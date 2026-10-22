import { env } from "cloudflare:workers";
import { getCurrentUser } from "../../../auth";
import { billingHistory, subscriptionState } from "../../../../lib/billing-store";
import { safeOwnerId } from "../../../../lib/resume-storage";
export async function GET() {
  const headers = { "cache-control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user || !env.DB) return Response.json({ downloads: [], subscription: { active: false, status: "none" } }, { headers });
  try {
    const owner = safeOwnerId(user.id);
    const [downloads, subscription] = await Promise.all([billingHistory(env.DB, owner), subscriptionState(env.DB, owner)]);
    return Response.json({ downloads, subscription }, { headers });
  } catch { return Response.json({ error: "Download history is temporarily unavailable." }, { status: 503, headers }); }
}
