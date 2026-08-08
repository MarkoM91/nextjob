import { jobs } from "./demo-data";
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

export const DEMO_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

class DemoJobProvider implements JobProvider {
  constructor(
    public id: string,
    public name: string,
    public countriesSupported: string[],
    public languagesSupported: string[],
    private health: "healthy" | "degraded" | "offline" = "healthy",
  ) {}

  async searchJobs(query: { keywords?: string[]; countries?: string[] }): Promise<Job[]> {
    if (this.health === "offline") throw new Error("Provider unavailable");
    return jobs.filter((job) => {
      if (job.providerId !== this.id) return false;
      if (query.countries?.length && !query.countries.includes(job.countryCode)) return false;
      if (query.keywords?.length && !query.keywords.some((keyword) => `${job.title} ${job.description}`.toLowerCase().includes(keyword.toLowerCase()))) return false;
      return true;
    });
  }

  async fetchJobDetails(externalId: string): Promise<Job | null> {
    if (this.health === "offline") throw new Error("Provider unavailable");
    return jobs.find((job) => job.providerId === this.id && job.externalId === externalId) ?? null;
  }

  async healthCheck() {
    return { status: this.health, latencyMs: this.health === "degraded" ? 842 : this.health === "offline" ? 0 : 118, checkedAt: "2026-08-05T12:00:00.000Z" } as const;
  }
}

export const providerRegistry: JobProvider[] = [
  new DemoJobProvider("direct-ats", "Direct ATS", ["IT", "IE", "DE", "NL", "US"], ["en", "it", "de"]),
  new DemoJobProvider("atlas-jobs-api", "Atlas Jobs API", ["IT", "ES", "PT", "GB"], ["en", "it", "es", "pt"]),
  new DemoJobProvider("eures-demo-feed", "EURES demo feed", ["EU"], ["en", "it", "es", "de", "fr"]),
  new DemoJobProvider("open-roles-xml", "Open Roles XML", ["CA", "DE", "PL", "FR"], ["en", "de", "pl", "fr"]),
  new DemoJobProvider("public-jobs-json", "Public Jobs JSON", ["GB", "SE", "SG", "ES"], ["en", "sv", "es"], "degraded"),
  new DemoJobProvider("civic-careers-feed", "Civic Careers Feed", ["IT"], ["it", "en"], "offline"),
];

export async function searchAllProviders(query: { keywords?: string[]; countries?: string[] }) {
  const settled = await Promise.allSettled(providerRegistry.map((provider) => provider.searchJobs(query)));
  const availableJobs: Job[] = [];
  const failures: Array<{ providerId: string; message: string }> = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") availableJobs.push(...result.value);
    else failures.push({ providerId: providerRegistry[index].id, message: "Provider temporarily unavailable" });
  });
  return { jobs: availableJobs, failures };
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
