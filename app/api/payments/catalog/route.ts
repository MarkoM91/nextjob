import { billingCatalog } from "../../../../lib/payment";
export function GET() {
  try { return Response.json(billingCatalog(), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ error: "Pricing is temporarily unavailable." }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
