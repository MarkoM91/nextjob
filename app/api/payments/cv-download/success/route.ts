import { env } from "cloudflare:workers";
import { getCurrentUser } from "../../../../auth";
import { isPaidCvSession, recordCvPurchase, type PaidSession } from "../../../../../lib/payment-records";
import { safeOwnerId } from "../../../../../lib/resume-storage";

const formats = new Set(["pdf", "docx", "txt"]);

function checkoutRedirect(request: Request, jobId: string, format: string, payment: string): Response {
  const target = new URL("/checkout", request.url);
  target.searchParams.set("job", jobId);
  target.searchParams.set("format", format);
  target.searchParams.set("payment", payment);
  return Response.redirect(target.toString(), 303);
}

/** Verifies the Stripe session server-side, then grants a short-lived download entitlement. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") ?? "";
  const jobId = url.searchParams.get("job") ?? "";
  const format = url.searchParams.get("format") ?? "pdf";
  if (!sessionId || sessionId.length > 240 || !jobId || jobId.length > 80 || !formats.has(format)) return Response.redirect(new URL("/upload", request.url).toString(), 303);
  const user = await getCurrentUser();
  if (!user) return Response.redirect(new URL("/upload", request.url).toString(), 303);
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecret) return checkoutRedirect(request, jobId, format, "not-configured");

  try {
    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: { authorization: `Bearer ${stripeSecret}` } });
    const session = await stripeResponse.json().catch(() => null) as PaidSession | null;
    const ownerId = safeOwnerId(user.id);
    if (!stripeResponse.ok || !isPaidCvSession(session) || session?.metadata?.ownerId !== ownerId || session?.metadata?.jobId !== jobId) return checkoutRedirect(request, jobId, format, "not-confirmed");
    const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
    if (!storage) return checkoutRedirect(request, jobId, format, "not-configured");
    await recordCvPurchase(storage, session!);
    const target = new URL(`/api/documents/${format}`, request.url);
    target.searchParams.set("job", jobId);
    target.searchParams.set("doc", "cv");
    return new Response(null, { status: 303, headers: { location: target.toString(), "cache-control": "no-store" } });
  } catch (error) {
    console.error("[payments] Stripe session verification failed", error instanceof Error ? error.message : String(error));
    return checkoutRedirect(request, jobId, format, "not-confirmed");
  }
}
