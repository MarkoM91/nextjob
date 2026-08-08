import { verifyWebhookSignature } from "../../../../lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const body = await request.text();
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  const valid = await verifyWebhookSignature(body, request.headers.get("x-nextjob-signature"), secret);
  if (!valid) return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  return Response.json({ accepted: true, provider, receivedAt: new Date().toISOString() }, { status: 202 });
}
