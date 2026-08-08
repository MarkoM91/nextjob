import { getChatGPTUser } from "../chatgpt-auth";
import { RoleRadarApp } from "../components/RoleRadarApp";
import { DEMO_MODE } from "../../lib/providers";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const [{ screen }, query, signedInUser] = await Promise.all([params, searchParams, getChatGPTUser()]);
  return <RoleRadarApp screen={screen} jobId={query.job} user={signedInUser} demoMode={DEMO_MODE} />;
}
