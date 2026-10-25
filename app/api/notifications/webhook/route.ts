import { env } from "cloudflare:workers";
import { base64UrlDecode } from "../../../../lib/auth-session";

export async function verifyResendWebhook(body: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get("svix-id"), timestamp = headers.get("svix-timestamp");
  const seconds = Number(timestamp);
  if (!id || !timestamp || !Number.isInteger(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  const keyBytes = base64UrlDecode(secret.replace(/^whsec_/, "")); if (!keyBytes) return false;
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  for (const entry of (headers.get("svix-signature") ?? "").split(" ")) {
    const [version, value] = entry.split(","); const signature = value ? base64UrlDecode(value) : null;
    if (version === "v1" && signature && await crypto.subtle.verify("HMAC", key, signature as BufferSource, signed)) return true;
  }
  return false;
}
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || Number(request.headers.get("content-length") ?? 0) > 65536) return new Response(null, { status: 400 });
  const raw = await request.text();
  if (raw.length > 65536 || !await verifyResendWebhook(raw, request.headers, secret)) return new Response(null, { status: 401 });
  let event: { type?: string; data?: { email_id?: string } };
  try { event = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return new Response(null, { status: 503 });
  const providerId = event.data?.email_id;
  if (!providerId || !["email.delivered", "email.bounced", "email.complained", "email.failed"].includes(event.type ?? "")) return new Response(null, { status: 204 });
  const row = await db.prepare("SELECT owner_id, email_revision FROM alert_deliveries WHERE provider_id = ? LIMIT 1").bind(providerId).first<{ owner_id: string; email_revision: number }>();
  // The webhook may beat the API response; ask Resend to retry until the send is recorded.
  if (!row) return new Response(null, { status: 503 });
  const failed = event.type !== "email.delivered";
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE alert_deliveries SET status = ?, failure_code = ?, updated_at = ? WHERE provider_id = ? AND status != 'failed'").bind(failed ? "failed" : "delivered", failed ? event.type! : null, now, providerId),
    ...(failed ? [
      db.prepare("UPDATE alert_settings SET email_enabled = 0, verification_hash = NULL, updated_at = ? WHERE owner_id = ? AND email_revision = ?").bind(now, row.owner_id, row.email_revision),
      db.prepare("UPDATE alert_deliveries SET status = 'cancelled', updated_at = ? WHERE owner_id = ? AND email_revision = ? AND status IN ('pending', 'retry')").bind(now, row.owner_id, row.email_revision),
    ] : []),
  ]);
  return new Response(null, { status: 204 });
}
