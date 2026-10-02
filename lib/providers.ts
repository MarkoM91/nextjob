import { createLiveProviderRegistry } from "./live-job-providers";
import type { CandidateProfile, GeneratedApplication, Job, JobProvider } from "./domain";
import { createDemoApplication } from "./engine";

export interface AIProvider {
  extractProfile(file: ArrayBuffer, mimeType: string): Promise<CandidateProfile>;
  generateApplication(profile: CandidateProfile, job: Job, tone: string): Promise<GeneratedApplication>;
}

export interface EmailProvider {
  send(input: { to: string; subject: string; html: string; deepLink: string }): Promise<{ id: string; simulated: boolean }>;
}

export interface WhatsAppProvider {
  send(input: { to: string; template: string; variables: Record<string, string>; consentId: string }): Promise<{ id: string; simulated: boolean }>;
  processOptOut(phone: string): Promise<void>;
}

export interface BackgroundQueue {
  enqueue<T>(type: string, payload: T, options?: { attempts?: number; delayMs?: number }): Promise<{ id: string }>;
}

export interface FileParser {
  supports(mimeType: string, fileName: string): boolean;
  parse(file: ArrayBuffer, mimeType: string): Promise<string>;
}

export const DEMO_MODE = process.env.FEATURE_DEMO_MODE === "true";

export const providerRegistry: JobProvider[] = createLiveProviderRegistry();

/**
 * Jobs seen during any provider search, so opening one from the feed resolves by id.
 * Aggregator results depend on the exact query, so a keyword-less re-search cannot
 * reliably find a specific posting again.
 */
const RECENT_JOB_TTL_MS = 30 * 60_000;
const RECENT_JOB_LIMIT = 3_000;
const recentJobs = new Map<string, { job: Job; expiresAt: number }>();

function rememberJobs(jobs: Job[]): void {
  const expiresAt = Date.now() + RECENT_JOB_TTL_MS;
  for (const job of jobs) recentJobs.set(job.id, { job, expiresAt });
  if (recentJobs.size <= RECENT_JOB_LIMIT) return;
  const now = Date.now();
  for (const [id, entry] of recentJobs) if (entry.expiresAt <= now) recentJobs.delete(id);
  for (const id of [...recentJobs.keys()].slice(0, Math.max(0, recentJobs.size - RECENT_JOB_LIMIT))) recentJobs.delete(id);
}

export function findRecentJob(jobId: string): Job | null {
  const entry = recentJobs.get(jobId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { recentJobs.delete(jobId); return null; }
  return entry.job;
}

export async function searchAllProviders(query: { keywords?: string[]; countries?: string[]; location?: string; radiusKm?: number; regional?: boolean }) {
  if (process.env.NEXTJOB_DISABLE_LIVE_JOBS === "true") return { jobs: [] as Job[], failures: [{ providerId: "live-jobs", message: "Live providers are disabled for this environment" }], sourceCounts: {} as Record<string, number> };
  const settled = await Promise.allSettled(providerRegistry.map((provider) => provider.searchJobs(query)));
  const availableJobs: Job[] = [];
  const failures: Array<{ providerId: string; message: string }> = [];
  const sourceCounts: Record<string, number> = {};
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") { availableJobs.push(...result.value); sourceCounts[providerRegistry[index].id] = result.value.length; }
    else failures.push({ providerId: providerRegistry[index].id, message: result.reason instanceof Error ? result.reason.message.slice(0, 160) : "Provider temporarily unavailable" });
  });
  rememberJobs(availableJobs);
  return { jobs: availableJobs, failures, sourceCounts };
}

export const demoAIProvider: AIProvider = {
  async extractProfile() {
    const { candidate } = await import("./demo-data");
    return candidate;
  },
  async generateApplication(profile, job, tone) {
    return createDemoApplication(profile, job, tone);
  },
};

export const demoEmailProvider: EmailProvider = {
  async send() {
    return { id: `demo-email-${Date.now()}`, simulated: true };
  },
};

export const demoWhatsAppProvider: WhatsAppProvider = {
  async send(input) {
    if (!input.consentId) throw new Error("Explicit consent is required");
    return { id: `demo-whatsapp-${Date.now()}`, simulated: true };
  },
  async processOptOut() {},
};
