import { getCurrentUser } from "../auth";
import { NextJobApp } from "../components/RoleRadarApp";
import { DEMO_MODE } from "../../lib/providers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ job?: string; applied?: string; application?: string; provider?: string; format?: string; payment?: string; version?: string; location?: string }>;
}) {
  const [{ screen }, query, signedInUser] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (screen === "processing") redirect("/upload");
  if (["sign-in", "sign-up", "forgot-password"].includes(screen)) redirect("/upload");
  return <NextJobApp screen={screen} jobId={query.job} appliedJobId={query.applied} applicationState={query.application} generationProvider={query.provider} format={query.format} payment={query.payment} versionId={query.version} searchLocation={typeof query.location === "string" ? query.location.slice(0, 80) : undefined} user={signedInUser} demoMode={DEMO_MODE} />;
}
