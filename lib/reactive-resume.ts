import type { CandidateProfile, Job } from "./domain";
import { reviewedResumeData, tailoredResumeData } from "./cv-tailoring.ts";

const API_ROOT = "https://rxresu.me/api/openapi";
const MAX_JSON_RESPONSE_BYTES = 4_000_000;
const MAX_PDF_BYTES = 12_000_000;

const supportedAiProviders = new Set([
  "openai", "anthropic", "gemini", "vercel-ai-gateway", "openrouter", "mistral", "cohere", "xai", "groq",
  "deepseek", "togetherai", "fireworks", "cerebras", "perplexity", "ollama", "openai-compatible",
]);

/** Résumé designs Reactive Resume can render; the PDF is re-exported when one is chosen. */
export const REACTIVE_RESUME_TEMPLATES = ["azurill", "bronzor", "chikorita", "ditgar", "ditto", "gengar", "glalie", "kakuna", "lapras", "leafish", "meowth", "onyx", "pikachu", "rhyhorn", "scizor"] as const;
export type ReactiveResumeTemplate = typeof REACTIVE_RESUME_TEMPLATES[number];
export function isReactiveResumeTemplate(value: unknown): value is ReactiveResumeTemplate {
  return typeof value === "string" && (REACTIVE_RESUME_TEMPLATES as readonly string[]).includes(value);
}

export type ReactiveResumeData = {
  basics?: { name?: string; headline?: string; email?: string; phone?: string; location?: string };
  summary?: { content?: string };
  metadata?: { template?: string };
  sections?: {
    profiles?: { items?: Array<{ id?: string; network?: string; username?: string; website?: string }> };
    experience?: { items?: Array<{ id?: string; company?: string; position?: string; location?: string; period?: string; description?: string; roles?: Array<{ id?: string; position?: string; period?: string; description?: string }> }> };
    education?: { items?: Array<{ id?: string; school?: string; degree?: string; area?: string; location?: string; period?: string; description?: string }> };
    skills?: { items?: Array<{ id?: string; name?: string; proficiency?: string; keywords?: string[] }> };
    languages?: { items?: Array<{ id?: string; language?: string; fluency?: string }> };
    certifications?: { items?: Array<{ id?: string; title?: string; issuer?: string; date?: string; description?: string }> };
    projects?: { items?: Array<{ id?: string; name?: string; period?: string; description?: string }> };
  };
};

type ReactiveResumeConfig = {
  apiKey: string;
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
};

export type ImportedReactiveResume = { resumeId: string; content: ReactiveResumeData };
export type TailoredReactiveResume = { applicationId: string; resumeId: string; name?: string; pdf: ArrayBuffer; content: ReactiveResumeData | null };
type ReactiveApplicationRecord = { id?: unknown; company?: unknown; role?: unknown; resumeId?: unknown; sourceUrl?: unknown; tags?: unknown };

export class ReactiveResumeApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly stage?: string;
  constructor(message: string, status: number, code?: string, stage?: string) { super(message); this.status = status; this.code = code; this.stage = stage; }
}

function configuration(): ReactiveResumeConfig {
  return {
    apiKey: process.env.REACTIVE_RESUME_API_KEY?.trim() ?? "",
    aiProvider: process.env.AI_PROVIDER?.trim() ?? "",
    aiApiKey: process.env.AI_PROVIDER_API_KEY?.trim() ?? "",
    aiModel: process.env.AI_MODEL?.trim() ?? "",
    aiBaseUrl: process.env.AI_BASE_URL?.trim() ?? "",
  };
}

export function reactiveResumeConfiguration() {
  const config = configuration();
  const missing = [
    !config.apiKey && "REACTIVE_RESUME_API_KEY",
    !config.aiProvider && "AI_PROVIDER",
    !config.aiApiKey && "AI_PROVIDER_API_KEY",
    !config.aiModel && "AI_MODEL",
  ].filter((value): value is string => Boolean(value));
  return { configured: missing.length === 0 && supportedAiProviders.has(config.aiProvider), missing, providerSupported: supportedAiProviders.has(config.aiProvider) };
}

export function isReactiveResumeConfigured(): boolean { return reactiveResumeConfiguration().configured; }

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

function cleanText(value: unknown, max = 2_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\u0000/g, "").trim().slice(0, max);
  return clean || undefined;
}

function cleanRichText(value: unknown, max = 4_000): string | undefined {
  const source = cleanText(value, max * 2);
  if (!source) return undefined;
  return cleanText(source
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n"), max);
}

function cleanItems(value: unknown, max: number): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.slice(0, max).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function cleanWebsite(value: unknown): string | undefined {
  if (typeof value === "string") return cleanText(value, 500);
  if (value && typeof value === "object") return cleanText((value as Record<string, unknown>).url, 500);
  return undefined;
}

export function sanitizeReactiveResumeData(value: unknown): ReactiveResumeData {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const basicsInput = input.basics && typeof input.basics === "object" ? input.basics as Record<string, unknown> : {};
  const summaryInput = input.summary && typeof input.summary === "object" ? input.summary as Record<string, unknown> : {};
  const sectionsInput = input.sections && typeof input.sections === "object" ? input.sections as Record<string, unknown> : {};
  const metadataInput = input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {};
  const sectionItems = (name: string, max: number) => {
    const section = sectionsInput[name];
    return section && typeof section === "object" ? cleanItems((section as Record<string, unknown>).items, max) : [];
  };
  const content: ReactiveResumeData = {
    basics: {
      name: cleanText(basicsInput.name, 160), headline: cleanText(basicsInput.headline, 180), email: cleanText(basicsInput.email, 240),
      phone: cleanText(basicsInput.phone, 80), location: cleanText(basicsInput.location, 240),
    },
    summary: { content: cleanRichText(summaryInput.content, 4_000) },
    metadata: { template: cleanText(metadataInput.template, 40) },
    sections: {
      profiles: { items: sectionItems("profiles", 20).map((item, index) => ({ id: cleanText(item.id, 100) ?? `profile-${index + 1}`, network: cleanText(item.network, 100), username: cleanText(item.username, 180), website: cleanWebsite(item.website) })).filter((item) => item.network || item.username || item.website) },
      experience: { items: sectionItems("experience", 30).map((item, index) => ({
        id: cleanText(item.id, 100) ?? `experience-${index + 1}`, company: cleanText(item.company, 180), position: cleanText(item.position, 180),
        location: cleanText(item.location, 180), period: cleanText(item.period, 100), description: cleanRichText(item.description, 4_000),
        roles: cleanItems(item.roles, 20).map((role, roleIndex) => ({ id: cleanText(role.id, 100) ?? `role-${index + 1}-${roleIndex + 1}`, position: cleanText(role.position, 180), period: cleanText(role.period, 100), description: cleanRichText(role.description, 2_000) })),
      })) },
      education: { items: sectionItems("education", 20).map((item, index) => ({ id: cleanText(item.id, 100) ?? `education-${index + 1}`, school: cleanText(item.school, 180), degree: cleanText(item.degree, 180), area: cleanText(item.area, 180), location: cleanText(item.location, 180), period: cleanText(item.period, 100), description: cleanRichText(item.description, 2_000) })) },
      skills: { items: sectionItems("skills", 80).map((item, index) => ({ id: cleanText(item.id, 100) ?? `skill-${index + 1}`, name: cleanText(item.name, 120), proficiency: cleanText(item.proficiency, 80), keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 20).map((keyword) => cleanText(keyword, 100)).filter((keyword): keyword is string => Boolean(keyword)) : [] })).filter((item) => item.name) },
      languages: { items: sectionItems("languages", 20).map((item, index) => ({ id: cleanText(item.id, 100) ?? `language-${index + 1}`, language: cleanText(item.language, 100), fluency: cleanText(item.fluency, 80) })).filter((item) => item.language) },
      certifications: { items: sectionItems("certifications", 30).map((item, index) => ({ id: cleanText(item.id, 100) ?? `certification-${index + 1}`, title: cleanText(item.title, 180), issuer: cleanText(item.issuer, 180), date: cleanText(item.date, 100), description: cleanRichText(item.description, 2_000) })).filter((item) => item.title) },
      projects: { items: sectionItems("projects", 30).map((item, index) => ({ id: cleanText(item.id, 100) ?? `project-${index + 1}`, name: cleanText(item.name, 180), period: cleanText(item.period, 100), description: cleanRichText(item.description, 2_000) })).filter((item) => item.name) },
    },
  };
  return content;
}

function durationFromPeriod(period?: string): number {
  if (!period) return 0;
  const years = [...period.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => Number(match[0]));
  if (!years.length) return 0;
  const start = years[0];
  const end = /present|current|now/i.test(period) ? new Date().getUTCFullYear() : years[1] ?? start;
  return Math.max(0, end - start);
}

export function candidateFromReactiveResume(content: ReactiveResumeData, ownerId = "uploaded-user"): CandidateProfile {
  const basics = content.basics ?? {};
  const experienceItems = content.sections?.experience?.items ?? [];
  const experiences = experienceItems.map((item, index) => {
    const bullets = [item.description, ...(item.roles ?? []).map((role) => role.description)].filter((text): text is string => Boolean(text));
    const [startDate = "", endDate] = (item.period ?? "").split(/\s+[–—-]\s+/, 2);
    return { id: item.id ?? `experience-${index + 1}`, company: item.company ?? "Employer", role: item.position ?? item.roles?.[0]?.position ?? "Role", startDate, endDate: /present|current|now/i.test(endDate ?? "") ? undefined : endDate, bullets: bullets.map((text, bulletIndex) => ({ id: `experience-${index + 1}-bullet-${bulletIndex + 1}`, text })) };
  });
  const skillItems = content.sections?.skills?.items ?? [];
  const skills = [...new Set(skillItems.flatMap((skill) => [skill.name, ...(skill.keywords ?? [])]).filter((value): value is string => Boolean(value)))];
  const languages = (content.sections?.languages?.items ?? []).map((item) => item.language).filter((value): value is string => Boolean(value));
  const education = (content.sections?.education?.items ?? []).map((item) => [item.degree, item.area, item.school].filter(Boolean).join(" — ")).filter(Boolean);
  const yearsOfExperience = Math.max(0, ...experienceItems.map((item) => durationFromPeriod(item.period)));
  // A headline is only a usable job title when it is short and not a summary sentence;
  // otherwise the most recent experience position is the honest role.
  const headline = basics.headline?.trim();
  const headlineIsTitle = Boolean(headline) && headline!.length <= 60 && headline!.split(/\s+/).length <= 6 && !/[.!?]$/.test(headline!) && !headline!.includes(",");
  const latestRole = experiences.map((experience) => experience.role).find((role) => role && role !== "Role");
  const currentRole = (headlineIsTitle ? headline : latestRole) ?? headline ?? "Professional";
  const targetTitles = [...new Set([currentRole, ...experiences.map((experience) => experience.role)])].filter((title) => title && title !== "Role").slice(0, 3);
  const facts = [
    ["name", "Name", basics.name], ["role", "Current role", currentRole], ["location", "Location", basics.location],
    ["experience", "Experience", yearsOfExperience ? `${yearsOfExperience} years` : undefined], ["skills", "Skills", skills.slice(0, 12).join(", ")],
  ].flatMap(([id, label, factValue]) => factValue ? [{ id: `parsed-${id}`, label: String(label), value: String(factValue), sourceText: String(factValue), confidence: 0.9, verifiedByUser: false }] : []);
  return {
    id: ownerId, fullName: basics.name ?? "CV owner", email: basics.email ?? "", phone: basics.phone ?? "", location: basics.location ?? "",
    currentRole, yearsOfExperience, targetTitles, skills, languages, education, workAuthorizations: [],
    preferences: { countries: [], workplace: ["Remote", "Hybrid", "On-site"], relocation: false, visaSponsorshipRequired: false, minimumAnnualSalaryEur: 0 },
    experiences, facts,
  };
}

function providerError(payload: unknown, fallback: string): { message: string; code?: string } {
  if (!payload || typeof payload !== "object") return { message: fallback };
  const input = payload as Record<string, unknown>;
  return { message: cleanText(input.message, 500) ?? cleanText(input.error, 500) ?? fallback, code: cleanText(input.code, 100) };
}

type JsonRequestOptions = { retries?: number; stage?: string };

function canRetryProviderError(error: ReactiveResumeApiError): boolean {
  return error.status === 429 || error.status === 502 || error.status === 503 || error.status === 504;
}

async function jsonRequestOnce<T>(path: string, init: RequestInit, timeoutMs: number, stage?: string): Promise<T> {
  const config = configuration();
  if (!config.apiKey) throw new ReactiveResumeApiError("Reactive Resume is not configured", 503, "PROVIDER_NOT_CONFIGURED", stage);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_ROOT}${path}`, { ...init, headers: { "x-api-key": config.apiKey, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers }, signal: controller.signal });
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_JSON_RESPONSE_BYTES) throw new ReactiveResumeApiError("Reactive Resume returned an oversized response", 502, "RESPONSE_TOO_LARGE", stage);
    const text = await response.text();
    if (text.length > MAX_JSON_RESPONSE_BYTES) throw new ReactiveResumeApiError("Reactive Resume returned an oversized response", 502, "RESPONSE_TOO_LARGE", stage);
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    if (!response.ok) {
      const detail = providerError(payload, "Reactive Resume request failed");
      throw new ReactiveResumeApiError(detail.message, response.status, detail.code ?? `UPSTREAM_HTTP_${response.status}`, stage);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ReactiveResumeApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ReactiveResumeApiError("Reactive Resume timed out", 504, "PROVIDER_TIMEOUT", stage);
    throw new ReactiveResumeApiError("Reactive Resume is temporarily unavailable", 502, "INVALID_PROVIDER_RESPONSE", stage);
  } finally { clearTimeout(timeout); }
}

async function jsonRequest<T>(path: string, init: RequestInit, timeoutMs: number, options: JsonRequestOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.min(3, (options.retries ?? 0) + 1));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await jsonRequestOnce<T>(path, init, timeoutMs, options.stage);
    } catch (error) {
      if (!(error instanceof ReactiveResumeApiError) || !canRetryProviderError(error) || attempt === attempts) throw error;
      console.warn("[reactive-resume] retrying upstream request", { stage: options.stage, path, status: error.status, code: error.code, attempt });
      await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
    }
  }
  throw new ReactiveResumeApiError("Reactive Resume is temporarily unavailable", 502, "INVALID_PROVIDER_RESPONSE", options.stage);
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new ReactiveResumeApiError("Reactive Resume returned invalid résumé data", 502, "INVALID_RESUME_DATA");
  const record = value as Record<string, unknown>;
  const candidate = record.data && typeof record.data === "object" && !record.basics ? record.data as Record<string, unknown> : record;
  if (!candidate.basics && !candidate.sections) throw new ReactiveResumeApiError("Reactive Resume returned incomplete résumé data", 502, "INVALID_RESUME_DATA");
  return candidate;
}

function responseId(value: unknown, name: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const id = cleanText((value as Record<string, unknown>).id, 160);
    if (id) return id;
  }
  throw new ReactiveResumeApiError(`Reactive Resume did not return a ${name} ID`, 502, "MISSING_PROVIDER_ID");
}

export async function parseAndImportReactiveResume(bytes: ArrayBuffer, fileName: string, mediaType: string): Promise<ImportedReactiveResume> {
  const status = reactiveResumeConfiguration();
  if (!status.configured) throw new ReactiveResumeApiError(`Resume AI is not configured: ${status.missing.join(", ") || "unsupported AI provider"}`, 503, "PROVIDER_NOT_CONFIGURED");
  const isPdf = mediaType === "application/pdf";
  const isDocx = mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (!isPdf && !isDocx) throw new ReactiveResumeApiError("Reactive Resume supports PDF and DOCX uploads", 415, "UNSUPPORTED_FILE_TYPE");
  const aiProviderId = await ensureSavedAiProvider();
  const body: Record<string, unknown> = { aiProviderId, file: { name: fileName, data: bytesToBase64(bytes) } };
  if (isDocx) body.mediaType = mediaType;
  const parsedPayload = await jsonRequest<unknown>(isPdf ? "/ai/parse-pdf" : "/ai/parse-docx", { method: "POST", body: JSON.stringify(body) }, 90_000, { retries: 1, stage: "document_parse" });
  const rawResume = parsePayload(parsedPayload);
  const importedPayload = await jsonRequest<unknown>("/resumes/import", { method: "POST", body: JSON.stringify({ data: rawResume }) }, 45_000);
  return { resumeId: responseId(importedPayload, "résumé"), content: sanitizeReactiveResumeData(rawResume) };
}

function savedAiProviders(payload: unknown): Array<Record<string, unknown>> {
  const providers = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).items)
      ? (payload as { items: unknown[] }).items
      : [];
  return providers.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

function savedAiProviderIsTested(provider: Record<string, unknown>): boolean {
  if (provider.tested === true || provider.isTested === true) return true;
  if (cleanText(provider.testedAt, 100) || cleanText(provider.lastTestedAt, 100)) return true;
  const status = cleanText(provider.testStatus, 40) ?? cleanText(provider.status, 40);
  return Boolean(status && ["tested", "success", "passed"].includes(status.toLowerCase()));
}

async function ensureSavedAiProvider(): Promise<string> {
  const config = configuration();
  const payload = await jsonRequest<unknown>("/ai-providers", { method: "GET" }, 20_000);
  const provider = savedAiProviders(payload).find((item) => item.label === "NextJOB" && item.provider === config.aiProvider && item.model === config.aiModel);
  const created = provider ?? await jsonRequest<unknown>("/ai-providers", { method: "POST", body: JSON.stringify({ label: "NextJOB", provider: config.aiProvider, model: config.aiModel, apiKey: config.aiApiKey, baseURL: config.aiBaseUrl }) }, 30_000);
  const providerId = responseId(created, "AI provider");
  if (!provider || !savedAiProviderIsTested(provider)) await jsonRequest<unknown>(`/ai-providers/${encodeURIComponent(providerId)}/test`, { method: "POST" }, 45_000);
  if (!provider || provider.enabled !== true) await jsonRequest<unknown>(`/ai-providers/${encodeURIComponent(providerId)}`, { method: "PATCH", body: JSON.stringify({ enabled: true }) }, 20_000);
  return providerId;
}

async function downloadPdf(resumeId: string): Promise<ArrayBuffer> {
  const config = configuration();
  const retryDelays = [0, 400, 1_200, 2_500];
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt]) await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(`${API_ROOT}/resumes/${encodeURIComponent(resumeId)}/pdf?target=resume`, { headers: { "x-api-key": config.apiKey, accept: "application/pdf" }, signal: controller.signal });
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && /application\/pdf/i.test(contentType)) {
        const declaredSize = Number(response.headers.get("content-length") ?? 0);
        if (declaredSize > MAX_PDF_BYTES) throw new ReactiveResumeApiError("The tailored PDF is too large", 502, "PDF_TOO_LARGE");
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > MAX_PDF_BYTES) throw new ReactiveResumeApiError("The tailored PDF is invalid", 502, "INVALID_PDF");
        return bytes;
      }
      await response.body?.cancel().catch(() => undefined);
      const retryable = response.status === 200 || [404, 409, 425, 429].includes(response.status) || response.status >= 500;
      if (!retryable) break;
    } catch (error) {
      if (error instanceof ReactiveResumeApiError) throw error;
      if (attempt === retryDelays.length - 1) break;
    } finally { clearTimeout(timeout); }
  }
  throw new ReactiveResumeApiError("Reactive Resume could not export the tailored PDF after waiting for it to finish", 502, "PDF_DOWNLOAD_FAILED");
}

async function existingTailoredApplication(baseResumeId: string, job: Job): Promise<{ applicationId: string; resumeId: string } | null> {
  const payload = await jsonRequest<unknown>("/applications", { method: "GET" }, 20_000);
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).items)
      ? (payload as { items: unknown[] }).items
      : [];
  // Aggregator links rotate between searches, so the URL is a preference, not a requirement:
  // the same employer, title and NextJOB tag is the same vacancy, and creating a second
  // tailored résumé for it fails on Reactive Resume's slug uniqueness anyway.
  let sameVacancy: { applicationId: string; resumeId: string } | null = null;
  for (const item of records) {
    if (!item || typeof item !== "object") continue;
    const record = item as ReactiveApplicationRecord;
    const applicationId = cleanText(record.id, 160);
    const resumeId = cleanText(record.resumeId, 160);
    const tags = Array.isArray(record.tags) ? record.tags : [];
    const sameJob = cleanText(record.company, 240) === job.company.replace(/\s+\(fictional\)$/i, "")
      && cleanText(record.role, 240) === job.title
      && tags.includes("NextJOB");
    if (!sameJob || !applicationId || !resumeId || resumeId === baseResumeId) continue;
    if (cleanText(record.sourceUrl, 2_000) === job.originalUrl) return { applicationId, resumeId };
    sameVacancy ??= { applicationId, resumeId };
  }
  return sameVacancy;
}

/** The structured content of a résumé Reactive Resume holds, sanitized like an upload. */
export async function fetchReactiveResume(resumeId: string): Promise<ReactiveResumeData> {
  const payload = await jsonRequest<unknown>(`/resumes/${encodeURIComponent(resumeId)}`, { method: "GET" }, 30_000);
  return sanitizeReactiveResumeData(parsePayload(payload));
}

/**
 * The PDF is the deliverable, so a failure to read the tailored content back must
 * not discard it; the studio falls back to the base résumé when content is null.
 */
async function tailoredContent(resumeId: string): Promise<ReactiveResumeData | null> {
  return fetchReactiveResume(resumeId).catch(() => null);
}

/** Switches the design of a résumé Reactive Resume holds and re-exports its PDF. */
export async function setReactiveResumeTemplate(resumeId: string, template: ReactiveResumeTemplate): Promise<{ pdf: ArrayBuffer }> {
  if (!isReactiveResumeTemplate(template)) throw new ReactiveResumeApiError("Unknown résumé design", 400, "UNKNOWN_TEMPLATE");
  await jsonRequest<unknown>(`/resumes/${encodeURIComponent(resumeId)}`, { method: "PATCH", body: JSON.stringify({ operations: [{ op: "replace", path: "/metadata/template", value: template }] }) }, 30_000);
  return { pdf: await downloadPdf(resumeId) };
}

export async function setReactiveResumeSummary(resumeId: string, summary: string): Promise<{ pdf: ArrayBuffer }> {
  const escaped = summary.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
  await jsonRequest<unknown>(`/resumes/${encodeURIComponent(resumeId)}`, { method: "PATCH", body: JSON.stringify({ operations: [{ op: "replace", path: "/summary/content", value: `<p>${escaped}</p>` }] }) }, 30_000);
  return { pdf: await downloadPdf(resumeId) };
}

/** The candidate's chosen design is applied before export, so every tailored CV looks the same. */
async function exportTailored(applicationId: string, resumeId: string, name: string | undefined, template?: ReactiveResumeTemplate): Promise<TailoredReactiveResume> {
  let content = await tailoredContent(resumeId);
  if (template && content?.metadata?.template !== template) {
    const { pdf } = await setReactiveResumeTemplate(resumeId, template);
    if (content) content = { ...content, metadata: { ...content.metadata, template } };
    return { applicationId, resumeId, name, pdf, content };
  }
  return { applicationId, resumeId, name, pdf: await downloadPdf(resumeId), content };
}

export async function createTailoredReactiveResume(baseResumeId: string, job: Job, template?: ReactiveResumeTemplate, reviewed?: { content: ReactiveResumeData; profile: CandidateProfile; summary: string }): Promise<TailoredReactiveResume> {
  if (!isReactiveResumeConfigured()) throw new ReactiveResumeApiError("Reactive Resume + AI is not configured", 503, "PROVIDER_NOT_CONFIGURED");
  await ensureSavedAiProvider();
  let base: Record<string, unknown> | undefined;
  if (reviewed) {
    const raw = parsePayload(await jsonRequest<unknown>(`/resumes/${encodeURIComponent(baseResumeId)}`, { method: "GET" }, 30_000));
    base = reviewedResumeData(raw, reviewed.content);
    await jsonRequest<unknown>(`/resumes/${encodeURIComponent(baseResumeId)}`, { method: "PATCH", body: JSON.stringify({ operations: [{ op: "replace", path: "/basics", value: base.basics }, { op: "replace", path: "/sections", value: base.sections }] }) }, 30_000);
  }
  const existing = await existingTailoredApplication(baseResumeId, job);
  const finish = async (applicationId: string, resumeId: string, name?: string) => {
    if (reviewed && base) {
      const raw = parsePayload(await jsonRequest<unknown>(`/resumes/${encodeURIComponent(resumeId)}`, { method: "GET" }, 30_000));
      const grounded = tailoredResumeData(base, raw, reviewed.profile, job, reviewed.summary);
      await jsonRequest<unknown>(`/resumes/${encodeURIComponent(resumeId)}`, { method: "PATCH", body: JSON.stringify({ operations: ["basics", "sections", "summary", "metadata", ...(grounded.customSections ? ["customSections"] : [])].map((key) => ({ op: "replace", path: `/${key}`, value: grounded[key] })) }) }, 30_000);
    }
    return exportTailored(applicationId, resumeId, name, template);
  };
  if (existing) return finish(existing.applicationId, existing.resumeId);
  const applicationPayload = await jsonRequest<unknown>("/applications", { method: "POST", body: JSON.stringify({ company: job.company.replace(/\s+\(fictional\)$/i, ""), role: job.title, location: job.locationText, source: job.providerName, sourceUrl: job.originalUrl || undefined, jobDescription: job.description.slice(0, 20_000), resumeId: baseResumeId, tags: ["NextJOB"] }) }, 30_000);
  const applicationId = responseId(applicationPayload, "application");
  const tailoredPayload = await jsonRequest<{ resumeId?: string; name?: string }>(`/applications/${encodeURIComponent(applicationId)}/ai/tailor-resume`, { method: "POST" }, 90_000);
  const resumeId = cleanText(tailoredPayload?.resumeId, 160);
  if (!resumeId) throw new ReactiveResumeApiError("Reactive Resume did not return a tailored résumé", 502, "MISSING_TAILORED_RESUME");
  return finish(applicationId, resumeId, cleanText(tailoredPayload.name, 240));
}

export const reactiveResumeInternals = { bytesToBase64, cleanRichText, supportedAiProviders };
