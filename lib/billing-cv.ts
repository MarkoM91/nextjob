import type { Job, CandidateProfile } from "./domain";
import { applicationPlainText } from "./documents";
import { readStoredResume, readStoredTailoredApplication, applicationNeedsRefresh, tailoredResumeKey, type StoredTailoredApplication, type StoredResumeProfile } from "./resume-storage";

export type CvSnapshot = {
  id: string; ownerId: string; jobId: string; job: Job; profile: CandidateProfile;
  package: StoredTailoredApplication; text: string; createdAt: number;
};
export const versionKey = (ownerId: string, id: string) => `private/${ownerId}/cv-versions/${id}`;
export const validVersion = (id: string) => /^cv_[a-f0-9]{64}$/.test(id);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Hash reviewed content/design, excluding generation dates and PDF creation timestamps. */
export async function currentCv(storage: R2Bucket | undefined, ownerId: string, job: Job): Promise<CvSnapshot | null> {
  const [resume, pkg] = await Promise.all([readStoredResume(storage, ownerId), readStoredTailoredApplication(storage, ownerId, job.id)]);
  if (!resume?.verifiedAt || !pkg || applicationNeedsRefresh(pkg, resume)) return null;
  return makeCvSnapshot(ownerId, job, resume, pkg);
}

export async function makeCvSnapshot(ownerId: string, job: Job, resume: StoredResumeProfile, pkg: StoredTailoredApplication): Promise<CvSnapshot> {
  const text = applicationPlainText(resume.profile, job, pkg.application);
  const payload = JSON.stringify(canonical({ jobId: job.id, text, template: pkg.template ?? null, content: pkg.content }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const id = `cv_${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return { id, ownerId, jobId: job.id, job, profile: resume.profile, package: pkg, text, createdAt: Date.now() };
}

export async function readCvVersion(storage: R2Bucket | undefined, ownerId: string, id: string): Promise<CvSnapshot | null> {
  if (!storage || !validVersion(id)) return null;
  const object = await storage.get(`${versionKey(ownerId, id)}/snapshot.json`) as { text(): Promise<string> } | null;
  if (!object) return null;
  const snapshot = JSON.parse(await object.text()) as CvSnapshot;
  return snapshot.ownerId === ownerId && snapshot.id === id ? snapshot : null;
}

/** Freeze the file before payment. Later edits cannot change the purchased export. */
export async function freezeCvVersion(storage: R2Bucket, snapshot: CvSnapshot): Promise<void> {
  if (await readCvVersion(storage, snapshot.ownerId, snapshot.id)) return;
  const pdf = await storage.get(tailoredResumeKey(snapshot.ownerId, snapshot.jobId)) as { arrayBuffer(): Promise<ArrayBuffer>; customMetadata?: Record<string, string> } | null;
  if (!pdf) throw new Error("CV_NOT_READY");
  if (pdf.customMetadata?.cvVersionId && pdf.customMetadata.cvVersionId !== snapshot.id) throw new Error("CV_NOT_READY");
  const bytes = await pdf.arrayBuffer();
  if (bytes.byteLength < 100 || bytes.byteLength > 12 * 1024 * 1024 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("CV_NOT_READY");
  await storage.put(`${versionKey(snapshot.ownerId, snapshot.id)}/cv.pdf`, bytes, { httpMetadata: { contentType: "application/pdf" } });
  await storage.put(`${versionKey(snapshot.ownerId, snapshot.id)}/snapshot.json`, new TextEncoder().encode(JSON.stringify(snapshot)), { httpMetadata: { contentType: "application/json" } });
}
