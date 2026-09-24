/**
 * Email and password accounts. Passwords are hashed with PBKDF2-SHA256 and a
 * per-account salt before they reach the database, and the plain value is never
 * stored or logged. This route needs the account database; without it, the
 * caller is told to use a social sign-in rather than being signed in anyway.
 */

import { env } from "cloudflare:workers";
import { z } from "zod";
import { authSecret, createSessionToken, safeReturnPath, sessionCookie } from "../../../../lib/auth-session";
import { AuthStoreError, PASSWORD_MIN_LENGTH, normalizeEmail, registerPasswordUser, verifyPasswordUser } from "../../../../lib/auth-users";
import { databaseFromEnvironment } from "../../../../lib/job-store";
import { assertSameOrigin, clientKey, rateLimit, safePlainText } from "../../../../lib/security";

const bodySchema = z.object({
  intent: z.enum(["sign-in", "sign-up"]),
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
  fullName: z.string().trim().max(120).optional(),
  returnTo: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  // Deliberately strict: password guessing is the attack this route invites.
  const limit = rateLimit(`auth-password:${clientKey(request)}`, 10, 5 * 60_000);
  if (!limit.allowed) return Response.json({ error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });

  const secret = authSecret();
  if (!secret) return Response.json({ error: "Sign-in is not configured on this server yet.", code: "AUTH_NOT_CONFIGURED" }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address and a password." }, { status: 400 });

  const { intent, email, password } = parsed.data;
  const fullName = parsed.data.fullName ? safePlainText(parsed.data.fullName, 120) : null;

  try {
    const db = databaseFromEnvironment(env);
    const account = intent === "sign-up"
      ? await registerPasswordUser(db, { email: normalizeEmail(email), password, fullName })
      : await verifyPasswordUser(db, { email: normalizeEmail(email), password });

    const token = await createSessionToken({
      id: account.id,
      email: account.email,
      fullName: account.displayName,
      displayName: account.displayName || account.email,
      provider: "password",
      picture: null,
    }, secret);

    const redirectTo = safeReturnPath(parsed.data.returnTo, intent === "sign-up" ? "/upload" : "/dashboard");
    return Response.json({ ok: true, redirectTo, user: { email: account.email, displayName: account.displayName } }, { headers: { "set-cookie": sessionCookie(token, request), "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthStoreError) {
      const status = error.code === "invalid-credentials" ? 401 : error.code === "email-taken" ? 409 : error.code === "weak-password" ? 400 : 503;
      return Response.json({ error: error.message, code: error.code, passwordMinLength: PASSWORD_MIN_LENGTH }, { status });
    }
    console.warn(`[auth] password route: ${error instanceof Error ? error.message : String(error)}`);
    return Response.json({ error: "Sign-in could not be completed. Please try again." }, { status: 500 });
  }
}
