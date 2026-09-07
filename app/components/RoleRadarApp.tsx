"use client";

import { AppShell, type Props } from "./shared";
import { AddJob } from "./add-job";
import { Landing } from "./landing";
import { Dashboard } from "./dashboard";
import { MatchesScreen } from "./matches";
import { JobDetail } from "./job-detail";
import { UploadScreen } from "./onboarding";
import { Generating, PackageScreen, Studio } from "./studio";
import { DocumentsScreen, Tracker } from "./tracker";
import { Admin, AuthScreen, Notifications, StaticScreen } from "./misc";

export function NextJobApp({ screen, jobId, appliedJobId, applicationState, generationProvider, user, demoMode = true }: Props) {
  if (screen === "landing") return <Landing />;
  if (screen === "sign-in" || screen === "sign-up" || screen === "forgot-password") return <AuthScreen mode={screen} />;
  if (screen === "upload") return <UploadScreen />;
  if (screen === "profile-review") return <UploadScreen stage="profile" />;
  if (screen === "preferences") return <UploadScreen stage="preferences" />;
  let content: React.ReactNode;
  if (screen === "dashboard") content = <Dashboard />;
  else if (screen === "matches") content = <MatchesScreen appliedJobId={applicationState ? jobId : appliedJobId} applicationState={applicationState ?? (appliedJobId ? "reported" : undefined)} />;
  else if (screen === "saved") content = <MatchesScreen savedOnly />;
  else if (screen === "add-job") content = <AddJob />;
  else if (screen === "job") content = <JobDetail jobId={jobId} />;
  else if (screen === "setup" || screen === "generating") content = <Generating jobId={jobId} />;
  else if (["ats", "studio", "workspace", "cv-editor", "cover-letter", "application-email", "interview"].includes(screen)) content = <Studio jobId={jobId} generationProvider={generationProvider} />;
  else if (screen === "package" || screen === "done") content = <PackageScreen jobId={jobId} />;
  else if (screen === "tracker") content = <Tracker />;
  else if (screen === "documents") content = <DocumentsScreen />;
  else if (screen === "notifications" || screen === "notification-settings") content = <Notifications />;
  else if (screen === "admin") content = <Admin />;
  else content = <StaticScreen screen={screen} />;
  return <AppShell screen={screen} user={user} demoMode={demoMode}>{content}</AppShell>;
}
