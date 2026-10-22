import { env } from "cloudflare:workers";
import { getCurrentUser } from "../../../../auth";
import { safeOwnerId } from "../../../../../lib/resume-storage";
import { readCvVersion } from "../../../../../lib/billing-cv";
import { cvAccess } from "../../../../../lib/billing-store";
import { fulfillStripeSession, stripeRequest, type StripeSession } from "../../../../../lib/stripe-billing";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") ?? "";
  const jobId = url.searchParams.get("job") ?? "";
  const format = url.searchParams.get("format") ?? "pdf";
  const target = new URL("/checkout", request.url);
  target.searchParams.set("job", jobId); target.searchParams.set("format", format);
  const redirect = (payment: string) => { target.searchParams.set("payment", payment); return new Response(null, { status: 303, headers: { location: target.toString(), "cache-control": "private, no-store" } }); };
  if (!/^cs_[a-zA-Z0-9_]{1,220}$/.test(sessionId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(jobId) || !["pdf", "docx", "txt"].includes(format)) return redirect("failed");
  const user = await getCurrentUser();
  if (!user || !env.DB || !env.DOCUMENTS) return redirect("not-confirmed");
  try {
    const session = await stripeRequest<StripeSession>(`checkout/sessions/${encodeURIComponent(sessionId)}`);
    const owner = safeOwnerId(user.id);
    const order = await fulfillStripeSession(env.DB, session, owner);
    if (!order) return redirect(session.status === "complete" && session.payment_status !== "paid" ? "pending" : "not-confirmed");
    const versionId = order.model === "pay_per_download" ? order.cv_version_id : session.metadata?.cvVersionId;
    const snapshot = versionId ? await readCvVersion(env.DOCUMENTS, owner, versionId) : null;
    if (!snapshot || snapshot.jobId !== jobId) return redirect("not-confirmed");
    if (!(await cvAccess(env.DB, owner, snapshot.id)).allowed) return redirect("expired");
    target.searchParams.set("version", snapshot.id);
    return redirect("successful");
  } catch { return redirect("not-confirmed"); }
}
