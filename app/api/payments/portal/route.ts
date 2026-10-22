import { env } from "cloudflare:workers";
import { getCurrentUser } from "../../../auth";
import { safeOwnerId } from "../../../../lib/resume-storage";
import { stripeRequest } from "../../../../lib/stripe-billing";
import { assertSameOrigin, rateLimit, clientKey } from "../../../../lib/security";

export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403, headers });
  if (!rateLimit(`billing-portal:${clientKey(request)}`, 20, 3600000).allowed) return Response.json({ error: "Please wait before trying again." }, { status: 429, headers });
  if (request.headers.get("x-nextjob-platform") === "android") return Response.json({ error: "Manage Android purchases through Google Play." }, { status: 409, headers });
  const user = await getCurrentUser();
  if (!user || !env.DB) return Response.json({ error: "Open your billing workspace first." }, { status: 401, headers });
  try {
    const customer = await env.DB.prepare("SELECT customer_id FROM billing_customers WHERE owner_id = ? AND provider = 'stripe'").bind(safeOwnerId(user.id)).first<{ customer_id: string }>();
    if (!customer) return Response.json({ error: "No Stripe billing profile is linked to this workspace." }, { status: 404, headers });
    const base = new URL(process.env.PAYMENTS_PUBLIC_ORIGIN || request.url).origin;
    const portal = await stripeRequest<{ url?: string }>("billing_portal/sessions", new URLSearchParams({ customer: customer.customer_id, return_url: `${base}/billing` }));
    if (!portal.url?.startsWith("https://billing.stripe.com/")) throw new Error("Invalid portal URL");
    return Response.json({ url: portal.url }, { headers });
  } catch { return Response.json({ error: "Subscription management is temporarily unavailable. Please retry." }, { status: 503, headers }); }
}
