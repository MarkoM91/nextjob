import { env } from "cloudflare:workers";
import { runAlertChecks } from "../../lib/alert-checker";
// Sites authenticates MCP callers. Only the configured, verified Site owner may
// run this system-wide task; a guest/app cookie never grants scheduler access.
export async function POST(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if (!request.headers.get("oai-authenticated-user-id") || !process.env.NOTIFICATION_ADMIN_EMAIL || email !== process.env.NOTIFICATION_ADMIN_EMAIL.toLowerCase()) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
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
