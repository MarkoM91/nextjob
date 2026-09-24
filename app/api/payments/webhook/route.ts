import { env } from "cloudflare:workers";
import { isPaidCvSession, recordCvPurchase, verifyStripeSignature, type PaidSession } from "../../../../lib/payment-records";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  if (!secret || !storage) return Response.json({ error: "Payment processing unavailable" }, { status: 503 });
  const body = await request.text();
  if (body.length > 1_000_000) return new Response(null, { status: 413 });
  if (!(await verifyStripeSignature(body, request.headers.get("stripe-signature"), secret))) return Response.json({ error: "Invalid signature" }, { status: 400 });
  let event: { type?: string; data?: { object?: PaidSession } };
  try { event = JSON.parse(body); } catch { return new Response(null, { status: 400 }); }
  if (event.type === "checkout.session.completed" && isPaidCvSession(event.data?.object ?? null)) {
    await recordCvPurchase(storage, event.data!.object!);
  }
  return Response.json({ received: true });
}
