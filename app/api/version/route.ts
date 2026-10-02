import { BUILD_VERSION } from "../../../lib/build-version";

export function GET() {
  return Response.json({ version: BUILD_VERSION }, { headers: { "cache-control": "private, no-store" } });
}
