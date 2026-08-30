import type { Job, JobProvider, Workplace } from "./domain";

type ProviderQuery = { keywords?: string[]; countries?: string[] };
type Health = "healthy" | "degraded" | "offline";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const CACHE_TTL_MS = 10 * 60_000;
const USER_AGENT = "NextJOB/1.0 (+https://role-radar.markom91.chatgpt.site; jobs@nextjob.invalid)";
const cache = new Map<string, { expiresAt: number; jobs: Job[] }>();

const skillVocabulary = [
  "IT support", "Help desk", "Service desk", "Windows 10", "Windows 11", "Microsoft 365", "Office 365",
  "Google Workspace", "Active Directory", "Azure Active Directory", "Microsoft Entra", "Intune", "MECM",
  "Hardware troubleshooting", "Software troubleshooting", "Networking", "TCP/IP", "DNS", "DHCP", "VPN",
  "Ticketing", "ServiceNow", "ITIL", "Endpoint security", "Device management", "User management", "PowerShell",
  "Linux", "macOS", "iOS", "SQL", "HTML", "CSS", "JavaScript", "Customer support", "Technical support",
] as const;

const countryNames: Record<string, string> = {
  AT: "Austria", AU: "Australia", BE: "Belgium", BR: "Brazil", CA: "Canada", CH: "Switzerland", CO: "Colombia",
  CR: "Costa Rica", CZ: "Czechia", DE: "Germany", DK: "Denmark", ES: "Spain", EU: "European Union", FI: "Finland",
  FR: "France", GB: "United Kingdom", GR: "Greece", HU: "Hungary", IE: "Ireland", IN: "India", IT: "Italy",
  JP: "Japan", LT: "Lithuania", MX: "Mexico", NL: "Netherlands", NO: "Norway", PL: "Poland", PT: "Portugal",
  RO: "Romania", SE: "Sweden", SG: "Singapore", US: "United States",
};

const countryPatterns: Array<[RegExp, string]> = [
  [/\b(milan|milano|italy|italia|rome|roma|turin|torino|pavia)\b/i, "IT"],
  [/\b(spain|madrid|barcelona)\b/i, "ES"], [/\b(germany|berlin|munich|münchen)\b/i, "DE"],
  [/\b(netherlands|amsterdam|utrecht)\b/i, "NL"], [/\b(ireland|dublin|cork)\b/i, "IE"],
  [/\b(france|paris|lyon)\b/i, "FR"], [/\b(portugal|lisbon|porto)\b/i, "PT"],
  [/\b(united kingdom|london|manchester|gloucester|milton keynes|hemel hempstead|\buk\b)\b/i, "GB"], [/\b(switzerland|zurich|mendrisio)\b/i, "CH"],
  [/\b(denmark|copenhagen)\b/i, "DK"], [/\b(norway|oslo)\b/i, "NO"], [/\b(sweden|stockholm)\b/i, "SE"],
  [/\b(poland|warsaw)\b/i, "PL"], [/\b(united states|\busa\b|new york|san francisco)\b/i, "US"],
  [/\b(canada|toronto|vancouver|montreal)\b/i, "CA"], [/\b(brazil|brasil|são paulo|sao paulo|rio de janeiro)\b/i, "BR"],
  [/\b(romania|bucharest|bucurești|iasi|iași)\b/i, "RO"], [/\b(india|bengaluru|bangalore|mumbai|delhi|hyderabad)\b/i, "IN"],
  [/\b(costa rica|san jos[eé])\b/i, "CR"], [/\b(colombia|bogot[aá]|medell[ií]n)\b/i, "CO"],
  [/\b(czechia|czech republic|prague|praha)\b/i, "CZ"], [/\b(hungary|budapest)\b/i, "HU"],
  [/\b(finland|helsinki)\b/i, "FI"], [/\b(greece|athens)\b/i, "GR"], [/\b(lithuania|vilnius)\b/i, "LT"],
  [/\b(singapore)\b/i, "SG"], [/\b(japan|tokyo)\b/i, "JP"], [/\b(mexico|mexico city)\b/i, "MX"], [/\b(australia|sydney|melbourne)\b/i, "AU"],
  [/\b(europe|emea|remote eu|european union)\b/i, "EU"],
];

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>|<\/li>|<\/div>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function stableId(provider: string, externalId: string): string {
  const clean = `${provider}-${externalId}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").slice(0, 76);
  return clean.replace(/^-|-$/g, "") || crypto.randomUUID();
}

function extractSkills(text: string): string[] {
  const normalized = text.toLowerCase();
  const skills = skillVocabulary.filter((skill) => normalized.includes(skill.toLowerCase()));
  if (/\btroubleshoot(?:ing)?\b/i.test(text) && !skills.includes("Hardware troubleshooting")) skills.push("Hardware troubleshooting");
  if (/\bnetwork(?:ing|s)?\b/i.test(text) && !skills.includes("Networking")) skills.push("Networking");
  if (/\buser (?:account|access|credential) management\b/i.test(text) && !skills.includes("User management")) skills.push("User management");
  return [...new Set(skills)].slice(0, 10);
}

function inferCountryCode(location: string): string {
  return countryPatterns.find(([pattern]) => pattern.test(location))?.[1] ?? "EU";
}

function inferWorkplace(text: string): Workplace {
  if (/\bhybrid|smart ?working\b/i.test(text)) return "Hybrid";
  if (/\bremote|work from home\b/i.test(text)) return "Remote";
  return "On-site";
}

function inferEmployment(text: string): Job["employmentType"] {
  if (/\bpart[- ]?time\b/i.test(text)) return "Part-time";
  if (/\bintern(?:ship)?\b|stage\b/i.test(text)) return "Internship";
  if (/\bcontract|freelance|temporary\b/i.test(text)) return "Contract";
  return "Full-time";
}

function inferSeniority(title: string): Job["seniority"] {
  if (/\blead|head|manager|director\b/i.test(title)) return "Lead";
  if (/\bsenior|sr\.?\b/i.test(title)) return "Senior";
  if (/\bjunior|jr\.?|entry\b/i.test(title)) return "Entry";
  return "Mid";
}

function jobFromSource(input: {
  providerId: string; providerName: string; externalId: string; url: string; title: string; company: string;
  location: string; description: string; publishedAt?: string; expiresAt?: string; employment?: string;
}): Job {
  const description = stripHtml(input.description).slice(0, 20_000);
  const location = stripHtml(input.location || "Location not stated").slice(0, 240);
  const combined = `${input.title}\n${location}\n${description}`;
  const requiredSkills = extractSkills(combined);
  const countryCode = inferCountryCode(location);
  const responsibilities = description.split(/\n|(?<=[.!?])\s+/).map((line) => line.trim()).filter((line) => line.length > 35).slice(0, 4);
  const url = new URL(input.url);
  return {
    id: stableId(input.providerId, input.externalId), externalId: input.externalId, providerId: input.providerId,
    providerName: input.providerName, applicationMethod: "external", canonicalUrl: url.toString(), originalUrl: url.toString(),
    title: stripHtml(input.title).slice(0, 180), normalizedTitle: stripHtml(input.title).toLowerCase().slice(0, 180),
    company: stripHtml(input.company).slice(0, 140), companyDomain: url.hostname, countryCode, country: countryNames[countryCode] ?? "European Union",
    city: location.split(/[,;·]/)[0]?.trim() || location, locationText: location, workplace: inferWorkplace(`${input.title}\n${location}`),
    employmentType: inferEmployment(input.employment ?? combined), seniority: inferSeniority(input.title), description,
    responsibilities: responsibilities.length ? responsibilities : ["Review the original employer listing for role responsibilities."],
    requirements: requiredSkills.map((value) => ({ value, kind: "skill", mandatory: true, confidence: 0.82, evidence: `${value} appears in the employer's published description.` })),
    requiredSkills, preferredSkills: [], languages: /\bitalian|italiano\b/i.test(combined) ? ["Italian", "English"] : ["English"],
    visaSponsorship: null, publishedAt: input.publishedAt && !Number.isNaN(Date.parse(input.publishedAt)) ? new Date(input.publishedAt).toISOString() : new Date().toISOString(),
    expiresAt: input.expiresAt && !Number.isNaN(Date.parse(input.expiresAt)) ? new Date(input.expiresAt).toISOString() : undefined,
    sourceLanguage: /\b(cosa farai|requisiti|conoscenza|sede di lavoro)\b/i.test(description) ? "it" : "en", active: true, fictional: false,
  };
}

function matchesQuery(job: Job, query: ProviderQuery): boolean {
  if (query.countries?.length && !query.countries.includes(job.countryCode) && job.countryCode !== "EU" && job.workplace !== "Remote") return false;
  if (!query.keywords?.length) return true;
  const haystack = `${job.title} ${job.description} ${job.requiredSkills.join(" ")}`.toLowerCase();
  return query.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

async function fetchText(url: string, accept: string, maxBytes = MAX_RESPONSE_BYTES): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { accept, "user-agent": USER_AGENT }, redirect: "manual", signal: controller.signal });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) throw new Error("Provider response is too large");
    const text = await response.text();
    if (text.length > maxBytes) throw new Error("Provider response is too large");
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": USER_AGENT, ...(token ? { authorization: `Bearer ${token}` } : {}) }, redirect: "manual", signal: controller.signal });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("Provider response is too large");
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error("Provider response is too large");
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedJobs(key: string, load: () => Promise<Job[]>): Promise<Job[]> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.jobs;
  const jobs = await load();
  cache.set(key, { jobs, expiresAt: Date.now() + CACHE_TTL_MS });
  return jobs;
}

abstract class LiveProvider implements JobProvider {
  protected status: Health = "healthy";
  protected latencyMs = 0;
  protected checkedAt = new Date().toISOString();
  abstract id: string;
  abstract name: string;
  abstract countriesSupported: string[];
  abstract languagesSupported: string[];
  abstract searchJobs(query: ProviderQuery): Promise<Job[]>;
  abstract fetchJobDetails(externalId: string): Promise<Job | null>;
  protected async observe<T>(task: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try { const result = await task(); this.status = "healthy"; return result; }
    catch (error) { this.status = "degraded"; throw error; }
    finally { this.latencyMs = Date.now() - started; this.checkedAt = new Date().toISOString(); }
  }
  async healthCheck() { return { status: this.status, latencyMs: this.latencyMs, checkedAt: this.checkedAt } as const; }
}

export class GreenhouseJobProvider extends LiveProvider {
  readonly id: string;
  readonly name: string;
  readonly countriesSupported = ["EU", "IT", "ES", "DE", "NL", "GB", "IE", "FR"];
  readonly languagesSupported = ["en", "it"];
  private readonly board: string;
  private readonly company: string;
  private readonly region: "global" | "eu";
  constructor(board: string, company: string, region: "global" | "eu" = "global") { super(); this.board = board; this.company = company; this.region = region; this.id = region === "eu" ? `greenhouse-eu-${board}` : `greenhouse-${board}`; this.name = `Greenhouse · ${company}`; }
  private async allJobs(): Promise<Job[]> {
    return cachedJobs(this.id, () => this.observe(async () => {
      const host = this.region === "eu" ? "boards-api.eu.greenhouse.io" : "boards-api.greenhouse.io";
      const data = await fetchJson<{ jobs?: Array<{ id: number; title: string; updated_at?: string; absolute_url: string; location?: { name?: string }; content?: string }> }>(`https://${host}/v1/boards/${encodeURIComponent(this.board)}/jobs?content=true`);
      return (data.jobs ?? []).map((job) => jobFromSource({ providerId: this.id, providerName: this.name, externalId: String(job.id), url: job.absolute_url, title: job.title, company: this.company, location: job.location?.name ?? "Location not stated", description: job.content ?? "", publishedAt: job.updated_at }));
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs()).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs()).find((job) => job.externalId === externalId) ?? null; }
}

export class LeverJobProvider extends LiveProvider {
  readonly id: string;
  readonly name: string;
  readonly countriesSupported = ["EU", "IT", "ES", "GB"];
  readonly languagesSupported = ["en", "it"];
  private readonly site: string;
  private readonly company: string;
  private readonly region: "global" | "eu";
  constructor(site: string, company: string, region: "global" | "eu" = "global") { super(); this.site = site; this.company = company; this.region = region; this.id = `lever-${region}-${site}`; this.name = `Lever · ${company}`; }
  private async allJobs(): Promise<Job[]> {
    return cachedJobs(this.id, () => this.observe(async () => {
      const host = this.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
      const data = await fetchJson<Array<{ id: string; text: string; createdAt?: number; hostedUrl: string; descriptionPlain?: string; additionalPlain?: string; categories?: { location?: string; commitment?: string; team?: string; department?: string; allLocations?: string[] }; lists?: Array<{ text?: string; content?: string }> }>>(`https://${host}/v0/postings/${encodeURIComponent(this.site)}?mode=json&limit=100`);
      return data.map((job) => jobFromSource({ providerId: this.id, providerName: this.name, externalId: job.id, url: job.hostedUrl, title: job.text, company: this.company, location: job.categories?.allLocations?.join("; ") || job.categories?.location || "Location not stated", description: [job.descriptionPlain, ...(job.lists ?? []).map((item) => `${item.text ?? ""}\n${stripHtml(item.content ?? "")}`), job.additionalPlain].filter(Boolean).join("\n"), employment: job.categories?.commitment, publishedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined }));
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs()).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs()).find((job) => job.externalId === externalId) ?? null; }
}

function safeConfiguredUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || host === "localhost" || host.endsWith(".local") || /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "::1") throw new Error("Only public HTTPS job URLs are permitted");
  const partnerOnlyDomains = ["indeed.com", "linkedin.com"];
  if (partnerOnlyDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) throw new Error("Indeed and LinkedIn require an authorized partner API and cannot be crawled");
  return url;
}

function robotsAllows(robots: string, path: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let agents: string[] = []; let rules: Array<{ allow: boolean; path: string }> = [];
  const flush = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; };
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim(); if (!line) continue;
    const separator = line.indexOf(":"); if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase(); const value = line.slice(separator + 1).trim();
    if (key === "user-agent") { if (rules.length) flush(); agents.push(value.toLowerCase()); }
    else if ((key === "allow" || key === "disallow") && agents.length && value) rules.push({ allow: key === "allow", path: value });
  }
  flush();
  const exact = groups.filter((group) => group.agents.includes("nextjob"));
  const selected = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  const matching = selected.flatMap((group) => group.rules).filter((rule) => path.startsWith(rule.path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}

function findJobPostings(value: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) { value.forEach((item) => findJobPostings(item, found)); return found; }
  if (!value || typeof value !== "object") return found;
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) found.push(object);
  if (object["@graph"]) findJobPostings(object["@graph"], found);
  return found;
}

function schemaLocation(value: unknown): string {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object") return "";
    const location = entry as Record<string, unknown>; const address = location.address;
    if (typeof address === "string") return address;
    if (!address || typeof address !== "object") return String(location.name ?? "");
    const record = address as Record<string, unknown>;
    return [record.addressLocality, record.addressRegion, record.addressCountry].filter(Boolean).join(", ");
  }).filter(Boolean).join("; ");
}

export class JsonLdCrawlerProvider extends LiveProvider {
  readonly id = "jsonld-crawler";
  readonly name = "Employer career pages";
  readonly countriesSupported = ["EU", "IT"];
  readonly languagesSupported = ["en", "it"];
  private readonly jobUrls: string[];
  constructor(jobUrls: string[]) { super(); this.jobUrls = jobUrls; if (!jobUrls.length) this.status = "offline"; }
  private async crawlOne(value: string): Promise<Job[]> {
    const url = safeConfiguredUrl(value); const robotsUrl = new URL("/robots.txt", url.origin);
    const robotsResult = await fetchText(robotsUrl.toString(), "text/plain", 500_000);
    if (robotsResult.response.ok && !robotsAllows(robotsResult.text, `${url.pathname}${url.search}`)) throw new Error("robots.txt does not permit this job URL");
    if (!robotsResult.response.ok && robotsResult.response.status !== 404) throw new Error(`robots.txt returned ${robotsResult.response.status}`);
    const page = await fetchText(url.toString(), "text/html,application/xhtml+xml", 2_000_000);
    if (!page.response.ok || !/text\/html|application\/xhtml\+xml/i.test(page.response.headers.get("content-type") ?? "")) throw new Error("Job page is not crawlable HTML");
    const scripts = [...page.text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    const postings: Record<string, unknown>[] = [];
    for (const script of scripts) { try { findJobPostings(JSON.parse(script[1]), postings); } catch { /* malformed publisher JSON-LD is ignored */ } }
    return postings.map((posting, index) => {
      const organization = posting.hiringOrganization as Record<string, unknown> | undefined;
      return jobFromSource({ providerId: this.id, providerName: this.name, externalId: String(posting.identifier && typeof posting.identifier === "object" ? (posting.identifier as Record<string, unknown>).value : posting.identifier ?? `${url.hostname}-${index}`), url: String(posting.url ?? url), title: String(posting.title ?? "Untitled role"), company: String(organization?.name ?? url.hostname), location: schemaLocation(posting.jobLocation) || String(posting.jobLocationType ?? "Location not stated"), description: String(posting.description ?? ""), employment: Array.isArray(posting.employmentType) ? posting.employmentType.join(" ") : String(posting.employmentType ?? ""), publishedAt: String(posting.datePosted ?? ""), expiresAt: String(posting.validThrough ?? "") });
    });
  }
  private async allJobs() { return cachedJobs(this.id, () => this.observe(async () => (await Promise.all(this.jobUrls.map((url) => this.crawlOne(url)))).flat())); }
  async searchJobs(query: ProviderQuery) { if (!this.jobUrls.length) throw new Error("No administrator-approved crawler URLs are configured"); return (await this.allJobs()).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs()).find((job) => job.externalId === externalId) ?? null; }
}

export class EuresPartnerProvider extends LiveProvider {
  readonly id = "eures-partner";
  readonly name = "EURES partner feed";
  readonly countriesSupported = ["EU"];
  readonly languagesSupported = ["en", "it", "es", "de", "fr"];
  private readonly endpoint?: string;
  private readonly token?: string;
  constructor(endpoint?: string, token?: string) { super(); this.endpoint = endpoint; this.token = token; if (!endpoint || !token) this.status = "offline"; }
  private async allJobs(query: ProviderQuery): Promise<Job[]> {
    if (!this.endpoint || !this.token) throw new Error("EURES requires recognized-partner API authorization");
    const endpoint = safeConfiguredUrl(this.endpoint);
    query.keywords?.slice(0, 5).forEach((keyword) => endpoint.searchParams.append("keyword", keyword));
    query.countries?.forEach((country) => endpoint.searchParams.append("country", country));
    return this.observe(async () => {
      const data = await fetchJson<{ jobs?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>> }>(endpoint.toString(), this.token);
      return (data.jobs ?? data.items ?? data.results ?? []).flatMap((item) => {
        const url = String(item.url ?? item.applyUrl ?? item.sourceUrl ?? ""); const title = String(item.title ?? item.positionTitle ?? "");
        if (!url || !title) return [];
        return [jobFromSource({ providerId: this.id, providerName: this.name, externalId: String(item.id ?? item.reference ?? url), url, title, company: String(item.company ?? item.employerName ?? "Employer"), location: String(item.location ?? item.locationText ?? item.country ?? "European Union"), description: String(item.description ?? item.descriptionText ?? ""), employment: String(item.employmentType ?? ""), publishedAt: String(item.publishedAt ?? item.datePosted ?? ""), expiresAt: String(item.expiresAt ?? item.validThrough ?? "") })];
      });
    });
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs(query)).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs({})).find((job) => job.externalId === externalId) ?? null; }
}

function displayName(slug: string): string { return slug.split(/[-_]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
function configured(name: string, defaults: string[]): string[] {
  const value = process.env[name]?.trim();
  if (!value) return defaults;
  if (value.toLowerCase() === "none") return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function createLiveProviderRegistry(): JobProvider[] {
  const greenhouse = configured("GREENHOUSE_BOARD_TOKENS", ["awin", "nozominetworks", "armissecurity", "planradar", "autoscout24", "saasgroup", "goodnotes", "fasthosts"]).map((entry) => { const [prefix, board] = entry.includes(":") ? entry.split(":", 2) : ["global", entry]; return new GreenhouseJobProvider(board, displayName(board), prefix === "eu" ? "eu" : "global"); });
  const lever = configured("LEVER_SITES", ["eu:prima", "eu:optotune", "global:researchgate"]).map((entry) => { const [prefix, siteValue] = entry.includes(":") ? entry.split(":", 2) : ["global", entry]; return new LeverJobProvider(siteValue, displayName(siteValue), prefix === "eu" ? "eu" : "global"); });
  const crawlerUrls = configured("CRAWLER_JOB_URLS", []);
  return [...greenhouse, ...lever, new EuresPartnerProvider(process.env.EURES_PARTNER_API_URL, process.env.EURES_PARTNER_API_TOKEN), new JsonLdCrawlerProvider(crawlerUrls)];
}

export const liveJobInternals = { extractSkills, inferCountryCode, jobFromSource, robotsAllows, safeConfiguredUrl, stripHtml };
