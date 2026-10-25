import { env } from "cloudflare:workers";
import { AlertError, confirmAlertEmail, readAlertToken } from "../../../../lib/alerts";
import { tokenPage } from "../token-page";
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try { await readAlertToken(token, "verify-alert-email"); return tokenPage("Confirm your email", "Verify and enable email", token, 200, request); }
  catch { return tokenPage("This email link has expired or is no longer valid.", "", "", 400, request); }
}
export async function POST(request: Request) {
  try {
    const data = await request.formData();
    await confirmAlertEmail((env as unknown as { DB: D1Database }).DB, String(data.get("token") ?? ""));
    return tokenPage("Email verified. Job alerts are enabled.", "", "", 200, request);
  } catch (error) { return tokenPage(error instanceof AlertError ? "This email link has expired or is no longer valid." : "Please try again later.", "", "", 400, request); }
}
