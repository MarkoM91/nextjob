import { env } from "cloudflare:workers";
import { ensureGuestUser, userFromRequest } from "../../auth";
import { AlertError, alertConfigSchema, alertStatus, deliverAlerts, requestEmailVerification, saveAlertSettings } from "../../../lib/alerts";
import { checkOwnerAlerts } from "../../../lib/alert-checker";
import { assertSameOrigin, clientKey, rateLimit } from "../../../lib/security";
import { readStoredResume, safeOwnerId } from "../../../lib/resume-storage";
import { isLocale } from "../../../lib/i18n";

const resources = () => env as unknown as { DB?: D1Database; DOCUMENTS?: R2Bucket };
const json = (body: unknown, status = 200, cookie?: string) => Response.json(body, { status, headers: { "cache-control": "private, no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });
export async function GET(request: Request) {
  const { DB } = resources(); if (!DB) return json({ error: "ALERTS_UNAVAILABLE" }, 503);
  try { const user = await userFromRequest(request); return json(await alertStatus(DB, user ? safeOwnerId(user.id) : null)); }
  catch { return json({ error: "ALERTS_UNAVAILABLE" }, 503); }
}
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return json({ error: "INVALID_ORIGIN" }, 403);
  if (!rateLimit(`alerts:${clientKey(request)}`, 20, 3600000).allowed) return json({ error: "EMAIL_RATE_LIMIT" }, 429);
  const { DB, DOCUMENTS } = resources(); if (!DB) return json({ error: "ALERTS_UNAVAILABLE" }, 503);
  const { user, setCookie } = await ensureGuestUser(request); if (!user) return json({ error: "ALERTS_UNAVAILABLE" }, 503);
  const owner = safeOwnerId(user.id);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "read") {
      if (body.id !== "all" && (typeof body.id !== "string" || body.id.length > 100)) throw new AlertError("INVALID_REQUEST");
      await DB.prepare(`UPDATE alert_inbox SET read_at = ? WHERE owner_id = ? AND read_at IS NULL${body.id === "all" ? "" : " AND id = ?"}`).bind(Date.now(), owner, ...(body.id === "all" ? [] : [body.id])).run();
    } else if (body.action === "save") {
      const parsed = alertConfigSchema.safeParse(body.config); if (!parsed.success) throw new AlertError("INVALID_REQUEST");
      if (parsed.data.inApp || parsed.data.emailEnabled) {
        const profile = await readStoredResume(DOCUMENTS, owner); if (!profile?.verifiedAt) throw new AlertError("PROFILE_REQUIRED", 409);
      }
      await saveAlertSettings(DB, owner, parsed.data);
      // Establish baseline now; later checks run unattended through the Site task.
      await checkOwnerAlerts(DB, DOCUMENTS, owner);
    } else if (body.action === "verify") {
      if (body.consent !== true || typeof body.email !== "string" || !isLocale(body.locale)) throw new AlertError("INVALID_REQUEST");
      const profile = await readStoredResume(DOCUMENTS, owner); if (!profile?.verifiedAt) throw new AlertError("PROFILE_REQUIRED", 409);
      await requestEmailVerification(DB, owner, body.email, body.locale);
      await deliverAlerts(DB, Date.now(), undefined, owner);
    } else if (body.action === "check") {
      await checkOwnerAlerts(DB, DOCUMENTS, owner);
    } else throw new AlertError("INVALID_REQUEST");
    return json(await alertStatus(DB, owner), 200, setCookie);
  } catch (error) { return json({ error: error instanceof AlertError ? error.code : "ALERTS_UNAVAILABLE" }, error instanceof AlertError ? error.status : 503, setCookie); }
}
