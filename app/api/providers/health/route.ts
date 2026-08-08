import { providerRegistry } from "../../../../lib/providers";

export async function GET() {
  const checks = await Promise.all(providerRegistry.map(async (provider) => ({ id: provider.id, name: provider.name, countriesSupported: provider.countriesSupported, languagesSupported: provider.languagesSupported, ...(await provider.healthCheck()) })));
  return Response.json({ checkedAt: "2026-08-05T12:00:00.000Z", providers: checks, queue: { status: "idle", waiting: 0, deadLettered: 0 }, demoMode: true });
}
