import { env } from "cloudflare:workers";
import { z } from "zod";
import { userFromRequest } from "../../../auth";
import { safeOwnerId } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { playSalesReady, PlayError } from "../../../../lib/google-play-api";
import { fulfillPlayPurchase } from "../../../../lib/google-play-billing";
import { playReturnPath } from "../../../../lib/google-play-order";
import { cvAccess, type BillingOrder } from "../../../../lib/billing-store";

const respond = (body: object, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
export async function GET(request: Request) {
  if (!rateLimit(`play-order:${clientKey(request)}`, 60).allowed) return respond({ error: "Please wait before trying again." }, 429);
  const user = await userFromRequest(request);
  if (!user || !env.DB) return respond({ error: "Open your CV workspace first." }, 401);
  const orderId = new URL(request.url).searchParams.get("order");
  if (!z.string().uuid().safeParse(orderId).success) return respond({ error: "Invalid purchase." }, 400);
  try {
    const owner = safeOwnerId(user.id);
    const order = await env.DB.prepare("SELECT o.*, p.account_id, p.mode, p.purchase_option_id FROM billing_orders o JOIN billing_play_orders p ON p.order_id = o.id WHERE o.id = ? AND o.owner_id = ? AND o.provider = 'google_play'").bind(orderId, owner).first<BillingOrder & { account_id: string; mode: string; purchase_option_id: string }>();
    if (!order) return respond({ error: "Purchase not found in this workspace." }, 404);
    const format = new URL(request.url).searchParams.get("format") ?? "pdf";
    if (!["pdf", "docx", "txt"].includes(format)) return respond({ error: "Invalid format." }, 400);
    const access = await cvAccess(env.DB, owner, order.cv_version_id);
    if (access.allowed) return respond({ returnUrl: playReturnPath(order, format), alreadyPurchased: true });
    if (!playSalesReady() || order.status !== "pending" || order.mode !== process.env.GOOGLE_PLAY_BILLING_MODE) return respond({ error: "Android payments are not available yet.", code: "PLAY_BILLING_NOT_CONFIGURED" }, 503);
    return respond({ orderId: order.id, productId: order.product_id, purchaseOptionId: order.purchase_option_id, accountId: order.account_id, profileId: order.id, amountCents: order.amount_cents, currency: order.currency, redownloadDays: order.redownload_days, testOnly: order.mode === "test", returnUrl: playReturnPath(order, format, "cancelled") });
  } catch { return respond({ error: "We couldn’t check your purchase. Please try again." }, 503); }
}
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return respond({ error: "Invalid request origin" }, 403);
  if (!rateLimit(`play-verify:${clientKey(request)}`, 90).allowed) return respond({ error: "Please wait before checking again." }, 429);
  if (Number(request.headers.get("content-length") ?? 0) > 10000) return respond({ error: "Invalid purchase." }, 400);
  const user = await userFromRequest(request);
  if (!user || !env.DB) return respond({ error: "Open your CV workspace first." }, 401);
  const input = z.object({ purchaseToken: z.string().min(10).max(4096), format: z.enum(["pdf", "docx", "txt"]).default("pdf") }).safeParse(await request.json().catch(() => null));
  if (!input.success) return respond({ error: "Invalid purchase." }, 400);
  try {
    const result = await fulfillPlayPurchase(env.DB, safeOwnerId(user.id), input.data.purchaseToken);
    return respond({ state: result.state, consumeRetry: result.consumeRetry ?? false, returnUrl: playReturnPath(result.order, input.data.format, result.state) });
  } catch (error) {
    const code = error instanceof PlayError ? error.code : "PLAY_VERIFICATION_UNAVAILABLE";
    return respond({ error: "We couldn’t confirm your payment yet. Check again before trying another payment.", code }, error instanceof PlayError ? error.status : 503);
  }
}
