import type { CandidateProfile, Job } from "./domain";

const API_ROOT = "https://useresume.ai/api/v3";
const MAX_API_RESPONSE_BYTES = 2_000_000;
const MAX_PDF_BYTES = 12_000_000;

export type UseResumeContent = {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  address?: string;
  summary?: string;
  links?: Array<{ name?: string; url?: string }>;
  employment?: Array<{
    title?: string;
    company?: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    present?: boolean;
    short_description?: string;
    responsibilities?: Array<{ text?: string }>;
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    present?: boolean;
    short_description?: string;
    achievements?: Array<{ text?: string }>;
  }>;
  skills?: Array<{ name?: string; proficiency?: string; display_proficiency?: boolean }>;
  languages?: Array<{ language?: string; proficiency?: string }>;
  certifications?: Array<{ name?: string; institution?: string; start_date?: string; end_date?: string; present?: boolean }>;
  projects?: Array<{ name?: string; short_description?: string; start_date?: string; end_date?: string; present?: boolean }>;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  meta?: { run_id?: string; credits_used?: number; credits_remaining?: number };
};

export type TailoredResumeResult = {
  fileUrl: string;
  fileUrlExpiresAt?: number;
  runId?: string;
  creditsUsed?: number;
  creditsRemaining?: number;
};

export class UseResumeApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; }
}

export function isUseResumeConfigured(): boolean {
  return Boolean(process.env.USERESUME_API_KEY?.trim());
}

function cleanText(value: unknown, max = 2_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\u0000/g, "").trim().slice(0, max);
  return clean || undefined;
}

function cleanDate(value: unknown): string | undefined {
  const date = cleanText(value, 30);
  return date && /^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(date) ? date : undefined;
}

function cleanList<T>(value: unknown, map: (item: Record<string, unknown>, index: number) => T | null, max = 40): T[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).flatMap((item, index) => item && typeof item === "object" ? [map(item as Record<string, unknown>, index)].filter((entry): entry is T => entry !== null) : []);
}

export function sanitizeParsedResume(value: unknown): UseResumeContent {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const content: UseResumeContent = {
    name: cleanText(input.name, 160), role: cleanText(input.role, 160), email: cleanText(input.email, 240), phone: cleanText(input.phone, 80),
    address: cleanText(input.address, 240), summary: cleanText(input.summary, 4_000),
    links: cleanList(input.links, (item) => { const url = cleanText(item.url, 500); return url ? { name: cleanText(item.name, 80), url } : null; }, 12),
    employment: cleanList(input.employment, (item) => ({
      title: cleanText(item.title, 160), company: cleanText(item.company, 160), location: cleanText(item.location, 180),
      start_date: cleanDate(item.start_date), end_date: cleanDate(item.end_date), present: item.present === true,
      short_description: cleanText(item.short_description, 2_000),
      responsibilities: cleanList(item.responsibilities, (responsibility) => { const text = cleanText(responsibility.text, 800); return text ? { text } : null; }, 20),
    })),
    education: cleanList(input.education, (item) => ({
      institution: cleanText(item.institution, 180), degree: cleanText(item.degree, 180), location: cleanText(item.location, 180),
      start_date: cleanDate(item.start_date), end_date: cleanDate(item.end_date), present: item.present === true,
      short_description: cleanText(item.short_description, 2_000),
      achievements: cleanList(item.achievements, (achievement) => { const text = cleanText(achievement.text, 800); return text ? { text } : null; }, 15),
    })),
    skills: cleanList(input.skills, (item) => { const name = cleanText(item.name, 100); return name ? { name, proficiency: cleanText(item.proficiency, 60), display_proficiency: item.display_proficiency === true } : null; }, 80),
    languages: cleanList(input.languages, (item) => { const language = cleanText(item.language, 80); return language ? { language, proficiency: cleanText(item.proficiency, 60) } : null; }, 20),
    certifications: cleanList(input.certifications, (item) => { const name = cleanText(item.name, 180); return name ? { name, institution: cleanText(item.institution, 180), start_date: cleanDate(item.start_date), end_date: cleanDate(item.end_date), present: item.present === true } : null; }, 30),
    projects: cleanList(input.projects, (item) => { const name = cleanText(item.name, 180); return name ? { name, short_description: cleanText(item.short_description, 2_000), start_date: cleanDate(item.start_date), end_date: cleanDate(item.end_date), present: item.present === true } : null; }, 30),
  };
  return content;
}

function yearsBetween(start?: string, end?: string, present?: boolean): number {
  const startYear = Number(start?.slice(0, 4));
  const endYear = present ? new Date().getUTCFullYear() : Number(end?.slice(0, 4));
  return Number.isFinite(startYear) && Number.isFinite(endYear) && endYear >= startYear ? endYear - startYear : 0;
}

export function candidateFromUseResume(content: UseResumeContent, ownerId = "uploaded-user"): CandidateProfile {
  const experiences = (content.employment ?? []).map((employment, index) => {
    const responsibilities = (employment.responsibilities ?? []).map((item) => item.text).filter((text): text is string => Boolean(text));
    if (!responsibilities.length && employment.short_description) responsibilities.push(employment.short_description);
    return {
      id: `experience-${index + 1}`, company: employment.company ?? "Employer", role: employment.title ?? "Role",
      startDate: employment.start_date ?? "", endDate: employment.present ? undefined : employment.end_date,
      bullets: responsibilities.map((text, bulletIndex) => ({ id: `experience-${index + 1}-bullet-${bulletIndex + 1}`, text })),
    };
  });
  const skills = (content.skills ?? []).map((skill) => skill.name).filter((name): name is string => Boolean(name));
  const languages = (content.languages ?? []).map((item) => item.language).filter((name): name is string => Boolean(name));
  const education = (content.education ?? []).map((item) => [item.degree, item.institution].filter(Boolean).join(" — ")).filter(Boolean);
  const yearsOfExperience = Math.max(0, ...((content.employment ?? []).map((item) => yearsBetween(item.start_date, item.end_date, item.present))));
  const facts = [
    ["name", "Name", content.name], ["role", "Current role", content.role], ["location", "Location", content.address],
    ["experience", "Experience", yearsOfExperience ? `${yearsOfExperience} years` : undefined], ["skills", "Skills", skills.slice(0, 12).join(", ")],
  ].flatMap(([id, label, factValue]) => factValue ? [{ id: `parsed-${id}`, label: String(label), value: String(factValue), sourceText: String(factValue), confidence: 0.9, verifiedByUser: false }] : []);
  return {
    id: ownerId, fullName: content.name ?? "CV owner", email: content.email ?? "", phone: content.phone ?? "", location: content.address ?? "",
    currentRole: content.role ?? experiences[0]?.role ?? "Professional", yearsOfExperience,
    targetTitles: [content.role ?? experiences[0]?.role ?? "Professional"], skills, languages, education,
    workAuthorizations: [], preferences: { countries: [], workplace: ["Remote", "Hybrid", "On-site"], relocation: false, visaSponsorshipRequired: false, minimumAnnualSalaryEur: 0 },
    experiences, facts,
  };
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

async function apiRequest<T>(path: string, body: unknown, timeoutMs: number): Promise<ApiEnvelope<T>> {
  const apiKey = process.env.USERESUME_API_KEY?.trim();
  if (!apiKey) throw new UseResumeApiError("UseResume is not configured", 503, "PROVIDER_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_ROOT}${path}`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_API_RESPONSE_BYTES) throw new UseResumeApiError("UseResume returned an oversized response", 502, "RESPONSE_TOO_LARGE");
    const text = await response.text();
    if (text.length > MAX_API_RESPONSE_BYTES) throw new UseResumeApiError("UseResume returned an oversized response", 502, "RESPONSE_TOO_LARGE");
    const payload = JSON.parse(text) as ApiEnvelope<T>;
    if (!response.ok || payload.success === false || !payload.data) throw new UseResumeApiError(payload.message ?? payload.error ?? "UseResume request failed", response.status, payload.code);
    return payload;
  } catch (error) {
    if (error instanceof UseResumeApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new UseResumeApiError("UseResume timed out", 504, "PROVIDER_TIMEOUT");
    throw new UseResumeApiError("UseResume returned an invalid response", 502, "INVALID_PROVIDER_RESPONSE");
  } finally { clearTimeout(timeout); }
}

export async function parseResumeDocument(bytes: ArrayBuffer): Promise<UseResumeContent> {
  const response = await apiRequest<Record<string, unknown>>("/resume/parse", { file: bytesToBase64(bytes), parse_to: "json" }, 60_000);
  return sanitizeParsedResume(response.data);
}

export async function createTailoredResume(content: UseResumeContent, job: Job): Promise<TailoredResumeResult> {
  const response = await apiRequest<{ file_url?: string; file_url_expires_at?: number }>("/resume/create-tailored", {
    resume_content: { content, style: { template: "default", template_color: "blue", font: "inter", page_padding: 1.54, page_format: "a4", background_color: "white", document_language: "en", date_format: "LLL yyyy" } },
    tailoring_instructions: "Improve relevance and wording using only facts present in the supplied resume. Do not invent employers, dates, qualifications, skills, responsibilities, or achievements.",
    target_job: { job_title: job.title, job_description: job.description },
  }, 90_000);
  const data = response.data;
  const fileUrl = data?.file_url;
  if (!fileUrl) throw new UseResumeApiError("UseResume did not return a document URL", 502, "MISSING_FILE_URL");
  const url = new URL(fileUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new UseResumeApiError("UseResume returned an unsafe document URL", 502, "UNSAFE_FILE_URL");
  const trustedDownloadDomains = ["useresume.ai", "useresume-platform.com"];
  if (!trustedDownloadDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) throw new UseResumeApiError("UseResume returned an untrusted document host", 502, "UNTRUSTED_FILE_HOST");
  return { fileUrl: url.toString(), fileUrlExpiresAt: data?.file_url_expires_at, runId: response.meta?.run_id, creditsUsed: response.meta?.credits_used, creditsRemaining: response.meta?.credits_remaining };
}

export async function downloadTailoredPdf(fileUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(fileUrl, { headers: { accept: "application/pdf" }, redirect: "error" });
  if (!response.ok || !/application\/pdf/i.test(response.headers.get("content-type") ?? "")) throw new UseResumeApiError("The tailored PDF could not be downloaded", 502, "PDF_DOWNLOAD_FAILED");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_PDF_BYTES) throw new UseResumeApiError("The tailored PDF is too large", 502, "PDF_TOO_LARGE");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_PDF_BYTES) throw new UseResumeApiError("The tailored PDF is invalid", 502, "INVALID_PDF");
  return bytes;
}

export const useresumeInternals = { bytesToBase64, sanitizeParsedResume };
