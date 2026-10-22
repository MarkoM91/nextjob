import { env } from "cloudflare:workers";
import { authSecret, verifyPayload } from "../../../../lib/auth-session";
import { readCvVersion, validVersion } from "../../../../lib/billing-cv";
import { downloadCv } from "../../../../lib/billing-download";
import { rateLimit, clientKey } from "../../../../lib/security";

export async function GET(request: Request) {
  const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
  if (!rateLimit(`recover-cv:${clientKey(request)}`, 60, 3600000).allowed) return Response.json({ error: "Please wait before trying this download again." }, { status: 429, headers });
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const format = url.searchParams.get("format") ?? "pdf";
  const secret = authSecret();
  if (!secret || !env.DB || !env.DOCUMENTS) return Response.json({ error: "Downloads are temporarily unavailable." }, { status: 503, headers });
  if (!token || token.length > 2000 || !["pdf", "docx", "txt"].includes(format)) return Response.json({ error: "Invalid download link." }, { status: 400, headers });
  try {
    const access = await verifyPayload<{ v: number; kind: string; ownerId: string; versionId: string; orderId: string; exp: number }>(token, secret);
    if (!access || access.v !== 1 || access.kind !== "cv_download" || !validVersion(access.versionId ?? "") || typeof access.ownerId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(access.ownerId) || typeof access.exp !== "number" || access.exp <= Date.now()) return Response.json({ error: "This private download link has expired or is invalid." }, { status: 403, headers });
    const grant = await env.DB.prepare("SELECT e.id FROM billing_entitlements e JOIN billing_orders o ON o.id = e.order_id WHERE e.owner_id = ? AND e.cv_version_id = ? AND e.order_id = ? AND e.revoked_at IS NULL AND e.expires_at > ? AND o.status = 'paid'").bind(access.ownerId, access.versionId, access.orderId, Date.now()).first();
    if (!grant) return Response.json({ error: "This download link is no longer active." }, { status: 403, headers });
    const snapshot = await readCvVersion(env.DOCUMENTS, access.ownerId, access.versionId);
    if (!snapshot) return Response.json({ error: "Your purchased CV is temporarily unavailable. Please retry." }, { status: 503, headers });
    const download = new URL(`/api/documents/${format}`, request.url);
    download.searchParams.set("job", snapshot.jobId); download.searchParams.set("version", snapshot.id);
    const response = await downloadCv(new Request(download), format as "pdf" | "docx" | "txt", access.ownerId, env.DB, env.DOCUMENTS);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  } catch { return Response.json({ error: "Your download could not be opened. Please retry." }, { status: 503, headers }); }
}
