import { env } from "cloudflare:workers";
import { readAlertToken, unsubscribeAlertEmail } from "../../../../lib/alerts";
import { tokenPage } from "../token-page";
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try { await readAlertToken(token, "unsubscribe-alert-email"); return tokenPage("Stop email job alerts?", "Unsubscribe", token, 200, request); }
  catch { return tokenPage("This email link has expired or is no longer valid.", "", "", 400, request); }
}
export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const token = new URL(request.url).searchParams.get("token") || String(data.get("token") ?? "");
    await unsubscribeAlertEmail((env as unknown as { DB: D1Database }).DB, token);
    return tokenPage("Email alerts are off. Your in-app preferences are unchanged.", "", "", 200, request);
  } catch { return tokenPage("This email link has expired or is no longer valid.", "", "", 400, request); }
}
