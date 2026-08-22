import { getChatGPTUser } from "../chatgpt-auth";
import { NextJobApp } from "../components/RoleRadarApp";
import { DEMO_MODE } from "../../lib/providers";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ job?: string; applied?: string; provider?: string }>;
}) {
  const [{ screen }, query, signedInUser] = await Promise.all([params, searchParams, getChatGPTUser()]);
  return <NextJobApp screen={screen} jobId={query.job} appliedJobId={query.applied} generationProvider={query.provider} user={signedInUser} demoMode={DEMO_MODE} />;
}
