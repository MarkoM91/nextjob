import type { Job } from "./domain";
import { resolvePlace } from "./geo.ts";
import { IMPORT_PROVIDER_ID } from "./job-filters.ts";
import { liveJobInternals } from "./live-job-providers.ts";
import { safeOwnerId } from "./resume-storage.ts";

/**
 * Jobs the candidate brings in themselves: a posting URL (read like the crawler, honouring
 * robots.txt) or the pasted text of an ad from a site that refuses automated fetching.
 * They live in the candidate's private storage and join the feed as "Added by you".
 */

export { IMPORT_PROVIDER_ID };
export const IMPORT_PROVIDER_NAME = "Added by you";
const MAX_IMPORTED_JOBS = 60;
const MIN_DESCRIPTION_CHARS = 120;

export class JobImportError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) { super(message); this.status = status; this.code = code; }
}

export type ImportedJobIndex = { jobs: Job[]; updatedAt: string };

export function importedJobsKey(ownerId: string): string { return `private/${safeOwnerId(ownerId)}/imported-jobs/index.json`; }

const { discoverJobLinks, fetchCrawlableHtml, jobFromPosting, jobFromSource, jobPostingsFromHtml, robotsPermits, safeConfiguredUrl, stripHtml } = liveJobInternals;

function metaContent(html: string, name: string): string {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']`, "i");
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i");
  return stripHtml(html.match(pattern)?.[1] ?? html.match(reversed)?.[1] ?? "").trim();
}

/** Readable body text with navigation, scripts and boilerplate stripped; good enough to review and tailor against. */
function readableText(html: string): string {
  const withoutChrome = html
    .replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const main = withoutChrome.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0] ?? withoutChrome.match(/<body\b[\s\S]*?<\/body>/i)?.[0] ?? withoutChrome;
  return stripHtml(main.replace(/<\/(p|div|li|h\d|tr|section|br)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function importedId(): string { return `import-${crypto.randomUUID().slice(0, 8)}`; }

export async function importJobFromUrl(value: string): Promise<Job> {
  let url: URL;
  try { url = safeConfiguredUrl(value.trim()); } catch (error) { throw new JobImportError(error instanceof Error ? error.message : "Enter a public HTTPS job link", 400, "INVALID_URL"); }
  let permitted: boolean;
  try { permitted = await robotsPermits(url); } catch { throw new JobImportError("The site's robots.txt could not be read, so NextJOB did not fetch the page. Paste the job text instead.", 502, "ROBOTS_UNAVAILABLE"); }
  if (!permitted) throw new JobImportError(`${url.hostname} does not allow automated fetching of this page. Paste the job title, company and description instead.`, 403, "SITE_FORBIDS_FETCH");
  let html: string;
  try { html = await fetchCrawlableHtml(url); } catch { throw new JobImportError("The job page could not be read. Check the link, or paste the job text instead.", 502, "PAGE_UNAVAILABLE"); }
  const postings = jobPostingsFromHtml(html);
  if (postings.length) {
    const job = jobFromPosting(IMPORT_PROVIDER_ID, IMPORT_PROVIDER_NAME, postings[0], url, 0);
    return { ...job, id: importedId(), originalUrl: url.toString(), canonicalUrl: url.toString() };
  }
  // A listing page names several jobs but describes none; the candidate must pick one link.
  if (discoverJobLinks(html, url, 3).length && readableText(html).length < 1_500) throw new JobImportError("This looks like a list of jobs rather than one posting. Open the job you want and paste that link.", 422, "LISTING_PAGE");
  const title = metaContent(html, "og:title") || stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").split(/\s[|–-]\s/)[0].trim();
  const company = metaContent(html, "og:site_name") || url.hostname.replace(/^www\./, "");
  const description = readableText(html).slice(0, 20_000);
  if (!title || description.length < MIN_DESCRIPTION_CHARS) throw new JobImportError("No job description was found on that page. Paste the job text instead.", 422, "NO_JOB_CONTENT");
  const place = resolvePlace(`${title} ${description.slice(0, 3_000)}`);
  const job = jobFromSource({ providerId: IMPORT_PROVIDER_ID, providerName: IMPORT_PROVIDER_NAME, externalId: url.toString(), url: url.toString(), title, company, location: place?.name ?? "Location not stated", description });
  return { ...job, id: importedId() };
}

export function importJobFromText(input: { title: string; company?: string; location?: string; description: string; sourceUrl?: string }): Job {
  const title = input.title.trim().slice(0, 180);
  const description = input.description.trim();
  if (!title) throw new JobImportError("A job title is required", 400, "TITLE_REQUIRED");
  if (description.length < MIN_DESCRIPTION_CHARS) throw new JobImportError("Paste the full job description (at least a few sentences)", 400, "DESCRIPTION_TOO_SHORT");
  let sourceUrl = "";
  if (input.sourceUrl?.trim()) {
    try { sourceUrl = new URL(input.sourceUrl.trim()).toString(); } catch { throw new JobImportError("The job link is not a valid URL", 400, "INVALID_URL"); }
    if (!sourceUrl.startsWith("https://") && !sourceUrl.startsWith("http://")) throw new JobImportError("The job link must be a web address", 400, "INVALID_URL");
  }
  const id = importedId();
  const location = input.location?.trim() || resolvePlace(`${title} ${description.slice(0, 3_000)}`)?.name || "Location not stated";
  const job = jobFromSource({ providerId: IMPORT_PROVIDER_ID, providerName: IMPORT_PROVIDER_NAME, externalId: id, url: sourceUrl || `https://nextjob.invalid/imported/${id}`, title, company: input.company?.trim() || "Employer not stated", location, description: description.slice(0, 20_000) });
  // Without a link there is nothing to open on the employer side; the studio hides the handoff instead of pointing at a placeholder.
  return { ...job, id, originalUrl: sourceUrl, canonicalUrl: sourceUrl, companyDomain: sourceUrl ? new URL(sourceUrl).hostname : "" };
}

async function readIndex(storage: R2Bucket, ownerId: string): Promise<ImportedJobIndex> {
  const object = await storage.get(importedJobsKey(ownerId)).catch(() => null) as { text(): Promise<string> } | null;
  if (!object) return { jobs: [], updatedAt: new Date(0).toISOString() };
  try { const parsed = JSON.parse(await object.text()) as ImportedJobIndex; return { jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [], updatedAt: parsed.updatedAt ?? "" }; } catch { return { jobs: [], updatedAt: "" }; }
}

async function writeIndex(storage: R2Bucket, ownerId: string, index: ImportedJobIndex): Promise<void> {
  await storage.put(importedJobsKey(ownerId), new TextEncoder().encode(JSON.stringify(index)), { httpMetadata: { contentType: "application/json" }, customMetadata: { ownerId: safeOwnerId(ownerId) } });
}

export async function listImportedJobs(storage: R2Bucket | undefined, ownerId: string): Promise<Job[]> {
  if (!storage) return [];
  return (await readIndex(storage, ownerId)).jobs;
}

export async function saveImportedJob(storage: R2Bucket, ownerId: string, job: Job): Promise<Job[]> {
  const index = await readIndex(storage, ownerId);
  const jobs = [job, ...index.jobs.filter((entry) => entry.id !== job.id && !(job.originalUrl && entry.originalUrl === job.originalUrl))].slice(0, MAX_IMPORTED_JOBS);
  await writeIndex(storage, ownerId, { jobs, updatedAt: new Date().toISOString() });
  return jobs;
}

export async function removeImportedJob(storage: R2Bucket, ownerId: string, jobId: string): Promise<Job[]> {
  const index = await readIndex(storage, ownerId);
  const jobs = index.jobs.filter((entry) => entry.id !== jobId);
  await writeIndex(storage, ownerId, { jobs, updatedAt: new Date().toISOString() });
  return jobs;
}

export const jobImportInternals = { metaContent, readableText };
