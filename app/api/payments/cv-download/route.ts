import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureGuestUser } from "../../../auth";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { readStoredResume, safeOwnerId } from "../../../../lib/resume-storage";
import { CV_DOWNLOAD_PRICE_CENTS, CV_DOWNLOAD_PRICE_LABEL } from "../../../../lib/payment";
import { hasCvPurchase } from "../../../../lib/payment-records";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";

const requestSchema = z.object({
  jobId: z.string().trim().min(1).max(80),
  format: z.enum(["pdf", "docx", "txt"]).default("pdf"),
});

function publicOrigin(request: Request): string {
  const configured = process.env.PAYMENTS_PUBLIC_ORIGIN?.trim() || process.env.AUTH_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  try { return new URL(configured || request.url).origin; } catch { return new URL(request.url).origin; }
}

function paymentResponse(body: Record<string, unknown>, status: number, setCookie?: string): Response {
  const headers = new Headers({ "cache-control": "private, no-store" });
  if (setCookie) headers.set("set-cookie", setCookie);
  return Response.json(body, { status, headers });
}

/** Creates a one-time Stripe Checkout session for a verified CV download. */
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`cv-payment:${clientKey(request)}`, 12, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Payment attempts are temporarily limited", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a valid CV format and job" }, { status: 400 });

  const { user, setCookie } = await ensureGuestUser(request);
  if (!user) return paymentResponse({ error: "A private workspace is not available yet. Please try again later.", code: "ANONYMOUS_WORKSPACE_NOT_CONFIGURED" }, 503);
  const ownerId = safeOwnerId(user.id);
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const job = await resolveRealJob(parsed.data.jobId, databaseFromEnvironment(env), storage);
  if (!job) return paymentResponse({ error: "This live job is no longer available", code: "JOB_NOT_FOUND" }, 404, setCookie);
  const storedResume = await readStoredResume(storage, ownerId).catch(() => null);
  if (!storedResume?.verifiedAt) return paymentResponse({ error: "Upload and verify your CV before downloading it.", code: "CV_REQUIRED" }, 409, setCookie);

  const documentUrl = `/api/documents/${parsed.data.format}?job=${encodeURIComponent(job.id)}&doc=cv`;
  if (await hasCvPurchase(storage, ownerId, job.id)) return paymentResponse({ downloadUrl: documentUrl, reused: true, price: CV_DOWNLOAD_PRICE_LABEL }, 200, setCookie);

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecret) return paymentResponse({ error: "Checkout is not available yet. Your CV is saved in this browser's workspace; please try again later.", code: "PAYMENTS_NOT_CONFIGURED", price: CV_DOWNLOAD_PRICE_LABEL }, 503, setCookie);

  const origin = publicOrigin(request);
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("payment_method_types[0]", "card");
  params.set("line_items[0][price_data][currency]", "eur");
  params.set("line_items[0][price_data][unit_amount]", String(CV_DOWNLOAD_PRICE_CENTS));
  params.set("line_items[0][price_data][product_data][name]", "NextJOB tailored CV download");
  params.set("line_items[0][price_data][product_data][description]", `Download your tailored CV for ${job.title}`);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${origin}/api/payments/cv-download/success?session_id={CHECKOUT_SESSION_ID}&job=${encodeURIComponent(job.id)}&format=${parsed.data.format}`);
  params.set("cancel_url", `${origin}/checkout?job=${encodeURIComponent(job.id)}&format=${parsed.data.format}&payment=cancelled`);
  params.set("metadata[ownerId]", ownerId);
  params.set("metadata[jobId]", job.id);
  params.set("metadata[doc]", "cv");

  try {
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${stripeSecret}`, "content-type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const stripePayload = await stripeResponse.json().catch(() => null) as { url?: string; error?: { message?: string } } | null;
    if (!stripeResponse.ok || !stripePayload?.url) {
      console.error("[payments] Stripe Checkout session failed", stripePayload?.error?.message ?? stripeResponse.status);
      return paymentResponse({ error: "Checkout could not be started. Please try again.", code: "PAYMENT_PROVIDER_ERROR" }, 502, setCookie);
    }
    return paymentResponse({ checkoutUrl: stripePayload.url, price: CV_DOWNLOAD_PRICE_LABEL }, 200, setCookie);
  } catch (error) {
    console.error("[payments] Stripe Checkout request failed", error instanceof Error ? error.message : String(error));
    return paymentResponse({ error: "Checkout could not be started. Please try again.", code: "PAYMENT_PROVIDER_ERROR" }, 502, setCookie);
  }
}
