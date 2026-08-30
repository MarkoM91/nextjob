import { getChatGPTUser } from "../chatgpt-auth";
import { NextJobApp } from "../components/RoleRadarApp";
import { DEMO_MODE } from "../../lib/providers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ job?: string; applied?: string; application?: string; provider?: string }>;
}) {
  const [{ screen }, query, signedInUser] = await Promise.all([params, searchParams, getChatGPTUser()]);
  if (screen === "processing") redirect("/upload");
  return <NextJobApp screen={screen} jobId={query.job} appliedJobId={query.applied} applicationState={query.application} generationProvider={query.provider} user={signedInUser} demoMode={DEMO_MODE} />;
}
