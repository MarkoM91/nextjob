import { env } from "cloudflare:workers";
import { runAlertChecks } from "../../lib/alert-checker";
import { assertSameOrigin } from "../../lib/security";
// Sites authenticates MCP callers. Only the configured, verified Site owner may
// run this system-wide task; a guest/app cookie never grants scheduler access.
function isOwner(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  return Boolean(request.headers.get("oai-authenticated-user-id") && process.env.NOTIFICATION_ADMIN_EMAIL && email === process.env.NOTIFICATION_ADMIN_EMAIL.toLowerCase());
}
export async function GET(request: Request) {
  if (!isOwner(request)) return new Response("Forbidden", { status: 403 });
  return new Response('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>NextJOB alert checks</title><main style="font:17px/1.6 system-ui;max-width:600px;margin:60px auto;padding:24px"><h1>NextJOB alert checks</h1><p>Owner access. Check opted-in workspaces and process their consented email queue. Email stays off while the delivery provider is unconfigured.</p><form method="post"><button style="padding:14px;font:inherit" type="submit">Run job alert checks</button></form><p><a href="/notifications">Back to notifications</a></p></main></html>', { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}
export async function POST(request: Request) {
  if (!isOwner(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const isForm = request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded");
  if (isForm && (!request.headers.get("origin") || !assertSameOrigin(request))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = isForm ? { id: "owner-readiness-check", method: "tools/call", params: { name: "check_job_alerts" } } : await request.json().catch(() => null);
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: body?.id ?? null, result });
  if (body?.method === "server/discover") return reply({ supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  if (body?.method === "tools/list") return reply({ tools: [{ name: "check_job_alerts", description: "Check opted-in NextJOB workspaces for new relevant jobs and process their consented email queue. Returns aggregate counts only.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }] });
  if (body?.method === "tools/call" && body.params?.name === "check_job_alerts") {
    const { DB, DOCUMENTS } = env as unknown as { DB?: D1Database; DOCUMENTS?: R2Bucket };
    if (!DB) return reply({ content: [{ type: "text", text: "Database unavailable" }], isError: true });
    try { return reply({ content: [{ type: "text", text: JSON.stringify(await runAlertChecks(DB, DOCUMENTS)) }] }); }
    catch { return reply({ content: [{ type: "text", text: "Job alert run failed; retry on the next scheduled run." }], isError: true }); }
  }
  return Response.json({ jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32601, message: "Method not found" } }, { status: 400 });
}
