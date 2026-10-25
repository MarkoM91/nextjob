import { getCurrentUser } from "../../../auth";
import { providerRegistry } from "../../../../lib/providers";
import { clientKey, rateLimit } from "../../../../lib/security";

function configuredAdminEmails(): Set<string> {
  return new Set((process.env.NEXTJOB_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user || user.provider === "guest" || !email || !configuredAdminEmails().has(email)) {
    return Response.json({ error: "Admin access required", code: "ADMIN_REQUIRED" }, { status: 403, headers: { "cache-control": "private, no-store" } });
  }
  const limit = rateLimit(`provider-health:${clientKey(request)}`, 12, 60_000);
  if (!limit.allowed) return Response.json({ error: "Please wait before checking provider health again." }, { status: 429, headers: { "cache-control": "private, no-store", "retry-after": String(limit.retryAfterSeconds) } });
  const checks = await Promise.all(providerRegistry.map(async (provider) => ({ id: provider.id, name: provider.name, countriesSupported: provider.countriesSupported, languagesSupported: provider.languagesSupported, ...(await provider.healthCheck()) })));
  return Response.json({ checkedAt: new Date().toISOString(), providers: checks, queue: { status: "idle", waiting: 0, deadLettered: 0 }, demoMode: false, notes: { eures: "Enabled only with recognized-partner credentials", crawler: "Restricted to administrator-approved HTTPS URLs and robots.txt" } });
}
