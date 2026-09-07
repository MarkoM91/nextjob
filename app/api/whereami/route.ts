import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { resolvePlace, type LocatedPlace } from "../../../lib/geo";
import { readStoredResume, safeOwnerId } from "../../../lib/resume-storage";
import { clientKey, rateLimit } from "../../../lib/security";

type CloudflareGeo = { city?: string; region?: string; country?: string; latitude?: string | number; longitude?: string | number };

/**
 * Where the candidate is, without asking the browser: the network's view of the request
 * (Cloudflare fills it in on the edge, local dev has none) and, more reliably for a job
 * search, the home town on the verified CV.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`whereami:${clientKey(request)}`, 60);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const user = await getChatGPTUser();
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const storedResume = await readStoredResume(storage, safeOwnerId(user?.id)).catch(() => null);
  const profileLocation = storedResume?.verifiedAt ? storedResume.profile.location : "";
  const profilePlace = profileLocation ? resolvePlace(profileLocation) : null;
  const cf = (request as Request & { cf?: CloudflareGeo }).cf;
  const latitude = Number(cf?.latitude);
  const longitude = Number(cf?.longitude);
  const networkPlace: LocatedPlace | null = cf?.city && Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { name: cf.city, country: cf.country ?? "", lat: latitude, lon: longitude, kind: "city" }
    : null;
  return Response.json({
    profile: profilePlace ? { ...profilePlace, source: "cv", label: profileLocation } : null,
    network: networkPlace ? { ...networkPlace, source: "network", label: [cf?.city, cf?.region].filter(Boolean).join(", ") } : null,
  }, { headers: { "cache-control": "private, no-store" } });
}
