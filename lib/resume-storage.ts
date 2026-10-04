import type { CandidateProfile, GeneratedApplication } from "./domain";
import type { ReactiveResumeData } from "./reactive-resume";

export type StoredResumeProfile = {
  provider: "reactive-resume" | "nextjob-parser";
  externalResumeId?: string;
  sourceHash?: string;
  parserVersion?: string;
  parsedAt: string;
  verifiedAt?: string;
  updatedAt?: string;
  /** Reactive Resume design the candidate picked; applied to every tailored CV. */
  preferredTemplate?: string;
  content: ReactiveResumeData;
  profile: CandidateProfile;
};

/** One generated application package: the job-tailored CV plus the written documents. */
export type StoredTailoredApplication = {
  jobId: string;
  generatedAt: string;
  sourceRevision?: string;
  tone: string;
  /** Who produced the CV: Reactive Resume + AI, or the deterministic template. */
  resumeProvider: "reactive-resume" | "nextjob-template";
  /** Who wrote the cover letter, email and interview prep. */
  documentsProvider: "ai-writer" | "nextjob-template";
  externalResumeId?: string;
  applicationId?: string;
  writerModel?: string;
  /** Design of the exported PDF, when Reactive Resume produced it. */
  template?: string;
  /** The tailored résumé as returned by Reactive Resume, or null when only the template ran. */
  content: ReactiveResumeData | null;
  application: GeneratedApplication;
  warnings: string[];
};

export function applicationNeedsRefresh(pkg: Pick<StoredTailoredApplication, "generatedAt" | "sourceRevision">, resume: StoredResumeProfile | null): boolean {
  return Boolean(resume && (!resume.verifiedAt || (resume.updatedAt && pkg.sourceRevision !== resume.updatedAt) || resume.parsedAt > pkg.generatedAt));
}

export function safeOwnerId(value?: string | null): string {
  return (value || "demo-user").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120);
}

function safeJobId(jobId: string): string { return jobId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 160); }

export function resumeProfileKey(ownerId: string): string { return `private/${safeOwnerId(ownerId)}/profile/latest.json`; }
export function tailoredResumeKey(ownerId: string, jobId: string): string { return `private/${safeOwnerId(ownerId)}/applications/${safeJobId(jobId)}/tailored-cv.pdf`; }
export function tailoredApplicationKey(ownerId: string, jobId: string): string { return `private/${safeOwnerId(ownerId)}/applications/${safeJobId(jobId)}/package.json`; }

async function readJson<T>(storage: R2Bucket | undefined, key: string): Promise<T | null> {
  if (!storage) return null;
  const object = await storage.get(key) as { text(): Promise<string> } | null;
  if (!object) return null;
  return JSON.parse(await object.text()) as T;
}

export function readStoredResume(storage: R2Bucket | undefined, ownerId: string): Promise<StoredResumeProfile | null> {
  if (!ownerId || ownerId === "demo-user") return Promise.resolve(null);
  return readJson<StoredResumeProfile>(storage, resumeProfileKey(ownerId));
}

export function readStoredTailoredApplication(storage: R2Bucket | undefined, ownerId: string, jobId: string): Promise<StoredTailoredApplication | null> {
  if (!ownerId || ownerId === "demo-user") return Promise.resolve(null);
  return readJson<StoredTailoredApplication>(storage, tailoredApplicationKey(ownerId, jobId));
}
