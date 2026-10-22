import { env } from "cloudflare:workers";
import { getCurrentUser } from "../../../auth";
import { authSecret, signPayload } from "../../../../lib/auth-session";
import { safeOwnerId } from "../../../../lib/resume-storage";
import { validVersion } from "../../../../lib/billing-cv";
import { assertSameOrigin, rateLimit, clientKey } from "../../../../lib/security";

export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403, headers });
  if (!rateLimit(`recovery-link:${clientKey(request)}`, 30, 3600000).allowed) return Response.json({ error: "Please wait before requesting another link." }, { status: 429, headers });
  const user = await getCurrentUser();
  const secret = authSecret();
  if (!user || !env.DB || !secret) return Response.json({ error: "Open your purchased CV first." }, { status: 401, headers });
  const body = await request.json().catch(() => null) as { versionId?: string } | null;
  if (!body?.versionId || !validVersion(body.versionId)) return Response.json({ error: "Choose a purchased CV." }, { status: 400, headers });
  try {
    const owner = safeOwnerId(user.id);
    const grant = await env.DB.prepare("SELECT e.order_id, e.expires_at FROM billing_entitlements e JOIN billing_orders o ON o.id = e.order_id WHERE e.owner_id = ? AND e.cv_version_id = ? AND e.revoked_at IS NULL AND e.expires_at > ? AND o.status = 'paid' ORDER BY e.expires_at DESC LIMIT 1").bind(owner, body.versionId, Date.now()).first<{ order_id: string; expires_at: number }>();
    if (!grant) return Response.json({ error: "There is no active purchase for this CV." }, { status: 403, headers });
    const token = await signPayload({ v: 1, kind: "cv_download", ownerId: owner, versionId: body.versionId, orderId: grant.order_id, exp: grant.expires_at }, secret);
    const url = new URL("/api/payments/recover", process.env.PAYMENTS_PUBLIC_ORIGIN || request.url);
    url.searchParams.set("token", token);
    return Response.json({ url: url.toString(), expiresAt: grant.expires_at }, { headers });
  } catch { return Response.json({ error: "Your private download link is temporarily unavailable. Please retry." }, { status: 503, headers }); }
}
