import type { CandidateProfile } from "./domain";
import type { ReactiveResumeData } from "./reactive-resume";

export type StoredResumeProfile = {
  provider: "reactive-resume";
  externalResumeId: string;
  parsedAt: string;
  verifiedAt?: string;
  content: ReactiveResumeData;
  profile: CandidateProfile;
};

export function safeOwnerId(value?: string | null): string {
  return (value || "demo-user").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120);
}

export function resumeProfileKey(ownerId: string): string { return `private/${safeOwnerId(ownerId)}/profile/latest.json`; }
export function tailoredResumeKey(ownerId: string, jobId: string): string { return `private/${safeOwnerId(ownerId)}/applications/${jobId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 160)}/tailored-cv.pdf`; }

export async function readStoredResume(storage: R2Bucket | undefined, ownerId: string): Promise<StoredResumeProfile | null> {
  if (!storage) return null;
  const object = await storage.get(resumeProfileKey(ownerId)) as { text(): Promise<string> } | null;
  if (!object) return null;
  return JSON.parse(await object.text()) as StoredResumeProfile;
}
