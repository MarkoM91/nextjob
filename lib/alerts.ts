import { z } from "zod";
import { authSecret, base64UrlDecode, base64UrlEncode, randomToken, sha256Base64Url, signPayload, verifyPayload } from "./auth-session.ts";
import { isLocale, type Locale } from "./i18n.ts";
import { translate } from "./ui-translations.ts";

export const alertConfigSchema = z.object({
  inApp: z.boolean(), emailEnabled: z.boolean(),
  frequency: z.enum(["daily", "weekly"]), minimumScore: z.union([z.literal(72), z.literal(85)]),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; } }),
  locale: z.string().refine(isLocale),
});
export type AlertConfig = z.infer<typeof alertConfigSchema>;
export const defaultAlertConfig: AlertConfig = { inApp: false, emailEnabled: false, frequency: "daily", minimumScore: 72, quietStart: "21:00", quietEnd: "08:00", timeZone: "Europe/Rome", locale: "en" };
export type AlertSettings = { owner_id: string; in_app: number; email_enabled: number; email_encrypted: string | null; email_hash: string | null; email_revision: number; verified_at: number | null; verification_hash: string | null; verification_expires: number | null; verification_requested: number | null; config_json: string; baseline_revision: string | null; last_checked: number | null; last_error: string | null; next_email: number; created_at: number };
export type InboxAlert = { id: string; job_id: string; title: string; company: string; location: string; created_at: number; read_at: number | null };
type Delivery = { id: string; owner_id: string; kind: string; email_revision: number; payload_encrypted: string; attempts: number; created_at: number; lease_token: string };
export type EmailMessage = { to: string; subject: string; html: string; text: string; unsubscribe?: string };
const HOUR = 3600000;
export class AlertError extends Error { code: string; status: number; constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; } }
const changes = (result: D1Result) => Number(result.meta?.changes ?? 0);
export function emailReady(): boolean {
  return process.env.NOTIFICATION_EMAIL_ENABLED === "true" && process.env.EMAIL_PROVIDER === "resend" && Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.RESEND_WEBHOOK_SECRET && authSecret() && alertOrigin());
}
export function alertOrigin(): string | null {
  try { const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? ""); return url.protocol === "https:" ? url.origin : null; } catch { return null; }
}
async function encryptionKey() {
  const secret = authSecret(); if (!secret) throw new AlertError("ALERTS_UNAVAILABLE", 503);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nextjob:alerts:contact:v1:${secret}`));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptContact(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(body))}`;
}
export async function decryptContact(value: string): Promise<string> {
  const [iv, body] = value.split(".").map(base64UrlDecode); if (!iv || !body) throw new AlertError("ALERTS_UNAVAILABLE", 503);
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, await encryptionKey(), body as BufferSource);
  return new TextDecoder().decode(bytes);
}
export async function getAlertSettings(db: D1Database, owner: string): Promise<AlertSettings | null> {
  return db.prepare("SELECT * FROM alert_settings WHERE owner_id = ?").bind(owner).first<AlertSettings>();
}
export function configFor(row: AlertSettings | null): AlertConfig {
  if (!row) return { ...defaultAlertConfig };
  return { ...alertConfigSchema.parse(JSON.parse(row.config_json)), inApp: Boolean(row.in_app), emailEnabled: Boolean(row.email_enabled) };
}
export async function ensureAlertSettings(db: D1Database, owner: string, now = Date.now()) {
  await db.prepare("INSERT OR IGNORE INTO alert_settings (owner_id, config_json, next_check, next_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(owner, JSON.stringify(defaultAlertConfig), now, now, now, now).run();
}
export async function saveAlertSettings(db: D1Database, owner: string, config: AlertConfig, now = Date.now()) {
  await ensureAlertSettings(db, owner, now);
  const old = (await getAlertSettings(db, owner))!;
  if (config.emailEnabled && (!old.verified_at || !emailReady())) throw new AlertError("EMAIL_NOT_VERIFIED", 409);
  const previous = configFor(old);
  const reset = previous.minimumScore !== config.minimumScore || (!previous.inApp && !previous.emailEnabled && (config.inApp || config.emailEnabled));
  const changedConsent = previous.emailEnabled !== config.emailEnabled;
  await db.batch([
    db.prepare("UPDATE alert_settings SET in_app = ?, email_enabled = ?, config_json = ?, baseline_revision = CASE WHEN ? THEN NULL ELSE baseline_revision END, next_check = CASE WHEN ? THEN ? ELSE next_check END, email_revision = email_revision + ?, verification_hash = CASE WHEN ? THEN NULL ELSE verification_hash END, verification_expires = CASE WHEN ? THEN NULL ELSE verification_expires END, consented_at = CASE WHEN ? THEN ? ELSE consented_at END, updated_at = ? WHERE owner_id = ?").bind(+config.inApp, +config.emailEnabled, JSON.stringify(config), +reset, +reset, now, +changedConsent, +changedConsent, +changedConsent, +(changedConsent && config.emailEnabled), now, now, owner),
    db.prepare("UPDATE alert_deliveries SET status = 'cancelled', updated_at = ? WHERE owner_id = ? AND status IN ('pending', 'retry') AND ? = 1").bind(now, owner, +changedConsent),
  ]);
}
export async function alertStatus(db: D1Database, owner: string | null) {
  const row = owner ? await getAlertSettings(db, owner) : null;
  const inbox = owner ? (await db.prepare("SELECT id, job_id, title, company, location, created_at, read_at FROM alert_inbox WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50").bind(owner).all<InboxAlert>()).results ?? [] : [];
  const count = owner ? await db.prepare("SELECT count(*) AS total FROM alert_inbox WHERE owner_id = ? AND read_at IS NULL").bind(owner).first<{ total: number }>() : null;
  const delivery = owner ? await db.prepare("SELECT status, failure_code, updated_at FROM alert_deliveries WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1").bind(owner).first() : null;
  return { config: configFor(row), email: row?.email_encrypted ? await decryptContact(row.email_encrypted) : "", verified: Boolean(row?.verified_at), verificationPending: Boolean(row?.verification_hash && (row.verification_expires ?? 0) > Date.now()), emailAvailable: emailReady(), inbox, unread: count?.total ?? 0, lastChecked: row?.last_checked ?? null, lastError: row?.last_error ?? null, delivery };
}
type AlertToken = { purpose: "verify-alert-email" | "unsubscribe-alert-email"; owner: string; revision: number; nonce: string; exp: number };
async function tokenFor(row: AlertSettings, purpose: AlertToken["purpose"], nonce: string, exp: number) {
  const secret = authSecret(); if (!secret) throw new AlertError("ALERTS_UNAVAILABLE", 503);
  return signPayload({ purpose, owner: row.owner_id, revision: row.email_revision, nonce, exp } satisfies AlertToken, secret);
}
export async function readAlertToken(token: string, purpose: AlertToken["purpose"], now = Date.now()): Promise<AlertToken> {
  if (token.length > 4096) throw new AlertError("INVALID_EMAIL_LINK");
  const secret = authSecret();
  const parsed = secret ? await verifyPayload<AlertToken>(token, secret) : null;
  if (!parsed || parsed.purpose !== purpose || typeof parsed.owner !== "string" || typeof parsed.nonce !== "string" || !Number.isInteger(parsed.revision) || !Number.isFinite(parsed.exp) || parsed.exp <= now) throw new AlertError("INVALID_EMAIL_LINK", 400);
  return parsed;
}
const escape = (text: string) => text.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!);
function emailCopy(locale: Locale, title: string, text: string, action: string, url: string, unsubscribe?: string): Omit<EmailMessage, "to"> {
  const t = (key: string) => translate(locale, key);
  return { subject: `NextJOB · ${t(title)}`, text: `${t(text)}\n\n${t(action)}: ${url}${unsubscribe ? `\n\n${t("Unsubscribe")}: ${unsubscribe}` : ""}`, html: `<div style="font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:auto;color:#183a34"><h1 style="font-size:24px">${escape(t(title))}</h1><p>${escape(t(text))}</p><p><a href="${escape(url)}">${escape(t(action))}</a></p>${unsubscribe ? `<p><a href="${escape(unsubscribe)}">${escape(t("Unsubscribe"))}</a></p>` : ""}<p>NextJOB</p></div>`, unsubscribe };
}
export async function requestEmailVerification(db: D1Database, owner: string, address: string, locale: Locale, now = Date.now()) {
  if (!emailReady()) throw new AlertError("EMAIL_NOT_CONFIGURED", 503);
  const parsed = z.string().trim().email().max(254).safeParse(address); if (!parsed.success) throw new AlertError("INVALID_EMAIL");
  const email = parsed.data.toLowerCase();
  await ensureAlertSettings(db, owner, now);
  const nonce = randomToken();
  const hash = await sha256Base64Url(nonce);
  const emailHash = await sha256Base64Url(`alert-email:${email}`);
  const encrypted = await encryptContact(email);
  const day = new Date(now).toISOString().slice(0, 10);
  // Durable per-workspace and destination limits, including across Worker restarts.
  const recent = await db.prepare("SELECT count(*) AS total FROM alert_deliveries d JOIN alert_settings s ON s.owner_id = d.owner_id WHERE s.email_hash = ? AND d.kind = 'verification' AND d.created_at > ?").bind(emailHash, now - 86400000).first<{ total: number }>();
  if ((recent?.total ?? 0) >= 5) throw new AlertError("EMAIL_RATE_LIMIT", 429);
  const result = await db.prepare("UPDATE alert_settings SET email_encrypted = ?, email_hash = ?, email_enabled = 0, verified_at = NULL, email_revision = email_revision + 1, verification_hash = ?, verification_expires = ?, verification_requested = ?, verification_day = ?, verification_count = CASE WHEN verification_day = ? THEN verification_count + 1 ELSE 1 END, updated_at = ? WHERE owner_id = ? AND (verification_requested IS NULL OR verification_requested <= ?) AND (verification_day IS NULL OR verification_day != ? OR verification_count < 5)").bind(encrypted, emailHash, hash, now + 24 * HOUR, now, day, day, now, owner, now - 60000, day).run();
  if (!changes(result)) throw new AlertError("EMAIL_RATE_LIMIT", 429);
  const row = (await getAlertSettings(db, owner))!;
  await db.prepare("UPDATE alert_settings SET config_json = ? WHERE owner_id = ? AND email_revision = ?").bind(JSON.stringify({ ...configFor(row), locale }), owner, row.email_revision).run();
  const token = await tokenFor(row, "verify-alert-email", nonce, now + 24 * HOUR);
  const message = { to: email, ...emailCopy(locale, "Confirm your email", "Confirm this email to receive job alerts you requested. This link expires in 24 hours. If you did not request it, ignore this email.", "Verify and enable email", `${alertOrigin()}/api/notifications/verify?token=${encodeURIComponent(token)}`) };
  await db.batch([
    db.prepare("UPDATE alert_deliveries SET status = 'cancelled', updated_at = ? WHERE owner_id = ? AND status IN ('pending', 'retry')").bind(now, owner),
    db.prepare("INSERT INTO alert_deliveries (id, owner_id, kind, email_revision, payload_encrypted, status, due_at, created_at, updated_at) VALUES (?, ?, 'verification', ?, ?, 'pending', ?, ?, ?)").bind(randomToken(), owner, row.email_revision, await encryptContact(JSON.stringify(message)), now, now, now),
  ]);
}
export async function confirmAlertEmail(db: D1Database, token: string, now = Date.now()) {
  const payload = await readAlertToken(token, "verify-alert-email", now);
  const result = await db.prepare("UPDATE alert_settings SET verified_at = ?, email_enabled = 1, consented_at = ?, verification_hash = NULL, verification_expires = NULL, updated_at = ?, next_check = ?, next_email = ? WHERE owner_id = ? AND email_revision = ? AND verification_hash = ? AND verification_expires > ?").bind(now, now, now, now, now, payload.owner, payload.revision, await sha256Base64Url(payload.nonce), now).run();
  if (!changes(result)) throw new AlertError("INVALID_EMAIL_LINK");
}
export async function unsubscribeAlertEmail(db: D1Database, token: string, now = Date.now()) {
  const payload = await readAlertToken(token, "unsubscribe-alert-email", now);
  const row = await getAlertSettings(db, payload.owner);
  if (!row || row.email_revision !== payload.revision) throw new AlertError("INVALID_EMAIL_LINK");
  await db.batch([
    db.prepare("UPDATE alert_settings SET email_enabled = 0, verification_hash = NULL, updated_at = ? WHERE owner_id = ? AND email_revision = ?").bind(now, payload.owner, payload.revision),
    db.prepare("UPDATE alert_deliveries SET status = 'cancelled', updated_at = ? WHERE owner_id = ? AND email_revision = ? AND status IN ('pending', 'retry')").bind(now, payload.owner, payload.revision),
  ]);
}
export function inQuietHours(config: AlertConfig, now = Date.now()) {
  if (config.quietStart === config.quietEnd) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: config.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const time = `${parts.find(p => p.type === "hour")!.value}:${parts.find(p => p.type === "minute")!.value}`;
  return config.quietStart < config.quietEnd ? time >= config.quietStart && time < config.quietEnd : time >= config.quietStart || time < config.quietEnd;
}
export async function queueDigest(db: D1Database, row: AlertSettings, now = Date.now()) {
  if (!emailReady() || !row.email_enabled || !row.verified_at || !row.email_encrypted || row.next_email > now || inQuietHours(configFor(row), now)) return;
  const pending = await db.prepare("SELECT id FROM alert_deliveries WHERE owner_id = ? AND kind = 'digest' AND status IN ('pending', 'retry', 'processing') LIMIT 1").bind(row.owner_id).first();
  if (pending) return;
  const alerts = (await db.prepare("SELECT id FROM alert_inbox WHERE owner_id = ? AND email_batch IS NULL AND created_at > ? ORDER BY created_at LIMIT 20").bind(row.owner_id, now - 7 * 86400000).all<{ id: string }>()).results;
  if (!alerts?.length) return;
  const config = configFor(row);
  const token = await tokenFor(row, "unsubscribe-alert-email", randomToken(), now + 366 * 86400000);
  const unsubscribe = `${alertOrigin()}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
  const message = { to: await decryptContact(row.email_encrypted), ...emailCopy(config.locale as Locale, "New job alerts", "New roles matching your saved profile are ready to review. Open your workspace on the device you use for NextJOB.", "View job alerts", `${alertOrigin()}/notifications`, unsubscribe) };
  const id = randomToken();
  const encrypted = await encryptContact(JSON.stringify(message));
  const interval = (config.frequency === "weekly" ? 7 * 24 : 24) * HOUR;
  // Owner check lease serializes digest creation; email consent is rechecked at send time.
  await db.batch([
    db.prepare("INSERT INTO alert_deliveries (id, owner_id, kind, email_revision, payload_encrypted, status, due_at, created_at, updated_at) VALUES (?, ?, 'digest', ?, ?, 'pending', ?, ?, ?)").bind(id, row.owner_id, row.email_revision, encrypted, now, now, now),
    ...alerts.map(alert => db.prepare("UPDATE alert_inbox SET email_batch = ? WHERE id = ? AND owner_id = ? AND email_batch IS NULL").bind(id, alert.id, row.owner_id)),
    db.prepare("UPDATE alert_settings SET next_email = ? WHERE owner_id = ?").bind(now + interval, row.owner_id),
  ]);
}
export class EmailSendError extends Error { code: string; retryable: boolean; constructor(code: string, retryable: boolean) { super(code); this.code = code; this.retryable = retryable; } }
export async function sendEmail(message: EmailMessage, idempotencyKey: string): Promise<string> {
  if (!emailReady()) throw new EmailSendError("EMAIL_NOT_CONFIGURED", true);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json", "Idempotency-Key": `nextjob-alert-${idempotencyKey}` }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text, ...(message.unsubscribe ? { headers: { "List-Unsubscribe": `<${message.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}) }) });
  } catch { throw new EmailSendError("EMAIL_NETWORK_ERROR", true); }
  if (!response.ok) throw new EmailSendError(`EMAIL_HTTP_${response.status}`, response.status === 429 || response.status >= 500);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new EmailSendError("EMAIL_INVALID_RESPONSE", true);
  return result.id;
}
export async function deliverAlerts(db: D1Database, now = Date.now(), sender = sendEmail, onlyOwner?: string) {
  if (!emailReady()) return { accepted: 0, failed: 0 };
  const rows = (await db.prepare(`SELECT * FROM alert_deliveries WHERE (status IN ('pending', 'retry') OR (status = 'processing' AND lease_until < ?)) AND due_at <= ? ${onlyOwner ? "AND owner_id = ?" : ""} ORDER BY due_at LIMIT 20`).bind(now, now, ...(onlyOwner ? [onlyOwner] : [])).all<Delivery>()).results;
  let accepted = 0, failed = 0;
  for (const delivery of rows ?? []) {
    const lease = randomToken();
    const claimed = await db.prepare("UPDATE alert_deliveries SET status = 'processing', lease_until = ?, lease_token = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND (status IN ('pending', 'retry') OR (status = 'processing' AND lease_until < ?))").bind(now + 60000, lease, now, delivery.id, now).run();
    if (!changes(claimed)) continue;
    const settings = await getAlertSettings(db, delivery.owner_id);
    const allowed = settings?.email_revision === delivery.email_revision && (delivery.kind === "verification" ? Boolean(settings.verification_hash && (settings.verification_expires ?? 0) > now) : Boolean(settings.email_enabled && settings.verified_at));
    if (!allowed) { await db.prepare("UPDATE alert_deliveries SET status = 'cancelled', updated_at = ? WHERE id = ? AND lease_token = ?").bind(now, delivery.id, lease).run(); continue; }
    if (delivery.kind === "digest" && inQuietHours(configFor(settings!), now)) {
      await db.prepare("UPDATE alert_deliveries SET status = 'retry', due_at = ?, attempts = attempts - 1 WHERE id = ? AND lease_token = ?").bind(now + HOUR, delivery.id, lease).run(); continue;
    }
    try {
      // Resend remembers idempotency keys for 24h; stop before that window can expire.
      if (delivery.created_at + 23 * HOUR < now) throw new EmailSendError("EMAIL_RETRY_EXPIRED", false);
      const message = JSON.parse(await decryptContact(delivery.payload_encrypted)) as EmailMessage;
      const day = new Date(now).toISOString().slice(0, 10);
      const configuredLimit = Number(process.env.NOTIFICATION_DAILY_SEND_LIMIT ?? 90);
      const dailyLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 90;
      const budget = await db.prepare("INSERT INTO alert_email_budget (day, used) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET used = used + 1 WHERE used < ?").bind(day, dailyLimit).run();
      if (!changes(budget)) {
        await db.prepare("UPDATE alert_deliveries SET status = 'retry', due_at = ?, attempts = attempts - 1, failure_code = 'EMAIL_DAILY_LIMIT', updated_at = ? WHERE id = ? AND lease_token = ?").bind(now + HOUR, now, delivery.id, lease).run();
        continue;
      }
      const providerId = await sender(message, delivery.id);
      await db.prepare("UPDATE alert_deliveries SET status = 'accepted', provider_id = ?, failure_code = NULL, updated_at = ? WHERE id = ? AND lease_token = ?").bind(providerId, now, delivery.id, lease).run(); accepted++;
    } catch (error) {
      const retry = error instanceof EmailSendError && error.retryable && delivery.attempts < 4;
      const code = error instanceof EmailSendError ? error.code : "EMAIL_PROCESSING_ERROR";
      await db.prepare("UPDATE alert_deliveries SET status = ?, due_at = ?, failure_code = ?, updated_at = ? WHERE id = ? AND lease_token = ?").bind(retry ? "retry" : "failed", now + Math.min(HOUR * 4, 60000 * 2 ** (delivery.attempts + 1)), code, now, delivery.id, lease).run(); failed++;
    }
  }
  return { accepted, failed };
}
