import { providerRegistry } from "../../../../lib/providers";

export async function GET() {
  const checks = await Promise.all(providerRegistry.map(async (provider) => ({ id: provider.id, name: provider.name, countriesSupported: provider.countriesSupported, languagesSupported: provider.languagesSupported, ...(await provider.healthCheck()) })));
  return Response.json({ checkedAt: new Date().toISOString(), providers: checks, queue: { status: "idle", waiting: 0, deadLettered: 0 }, demoMode: false, notes: { eures: "Enabled only with recognized-partner credentials", crawler: "Restricted to administrator-approved HTTPS URLs and robots.txt" } });
}
