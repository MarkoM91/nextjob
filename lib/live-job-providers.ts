import type { Job, JobProvider, SalaryPeriod, Workplace } from "./domain";

type ProviderQuery = { keywords?: string[]; countries?: string[]; location?: string; radiusKm?: number; regional?: boolean };
type Health = "healthy" | "degraded" | "offline";

// Every enabled provider is queried concurrently, so the per-request budget has to
// absorb a slow aggregator without aborting the healthy employer boards alongside it.
const REQUEST_TIMEOUT_MS = 15_000;
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
  [/\b(milan|milano|ital(?:y|ia|ian)|rome|roma|turin|torino|pavia|napoli|naples|bologna|firenze|florence|venezia|venice|genova|genoa|bari|palermo|catania|verona|padova|brescia|bergamo|modena|parma|trieste|monza|varese|como|lombardia|lombardy|lazio|veneto|piemonte|toscana|sicilia|puglia|emilia)\b/i, "IT"],
  [/\b(spain|madrid|barcelona)\b/i, "ES"], [/\b(germany|berlin|munich|münchen)\b/i, "DE"],
  [/\b(netherlands|amsterdam|utrecht)\b/i, "NL"], [/\b(ireland|dublin|cork)\b/i, "IE"],
  [/\b(france|paris|lyon)\b/i, "FR"], [/\b(portugal|lisbon|porto)\b/i, "PT"],
  [/\b(united kingdom|london|manchester|gloucester|milton keynes|hemel hempstead|\buk\b)\b/i, "GB"], [/\b(switzerland|zurich|mendrisio)\b/i, "CH"],
  [/\b(denmark|copenhagen)\b/i, "DK"], [/\b(norway|oslo)\b/i, "NO"], [/\b(sweden|stockholm)\b/i, "SE"],
  [/\b(poland|warsaw)\b/i, "PL"],
  // Includes US state codes so an aggregator's "Rockdale, TX" is not read as European.
  [/\b(united states|\busa\b|new york|san francisco|texas|california|florida|seattle|chicago|boston|atlanta|denver|austin)\b|,\s*(?:AL|AK|AZ|AR|CA|CO|CT|FL|GA|HI|ID|IL|IA|KS|KY|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/, "US"],
  [/\b(canada|toronto|vancouver|montreal)\b/i, "CA"], [/\b(brazil|brasil|são paulo|sao paulo|rio de janeiro)\b/i, "BR"],
  [/\b(romania|bucharest|bucurești|iasi|iași)\b/i, "RO"], [/\b(india|bengaluru|bangalore|mumbai|delhi|hyderabad)\b/i, "IN"],
  [/\b(costa rica|san jos[eé])\b/i, "CR"], [/\b(colombia|bogot[aá]|medell[ií]n)\b/i, "CO"],
  [/\b(czechia|czech republic|prague|praha)\b/i, "CZ"], [/\b(hungary|budapest)\b/i, "HU"],
  [/\b(finland|helsinki)\b/i, "FI"], [/\b(greece|athens)\b/i, "GR"], [/\b(lithuania|vilnius)\b/i, "LT"],
  [/\b(singapore)\b/i, "SG"], [/\b(japan|tokyo)\b/i, "JP"], [/\b(mexico|mexico city)\b/i, "MX"], [/\b(australia|sydney|melbourne)\b/i, "AU"],
  [/\b(europe|emea|remote eu|european union)\b/i, "EU"],
];

function stripHtml(value: string): string {
  // Some boards (e.g. Greenhouse) return HTML-escaped markup, so entities that
  // encode tags must be decoded before tags are stripped.
  return value
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>|<\/li>|<\/div>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, "&")
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

/** null when the text carries no recognizable country, so a caller can refuse to guess. */
function inferCountryCodeOrNull(location: string): string | null {
  return countryPatterns.find(([pattern]) => pattern.test(location))?.[1] ?? null;
}

function inferCountryCode(location: string): string {
  return inferCountryCodeOrNull(location) ?? "EU";
}

/** Board salary text ("€30.000 - €40.000 per year", "$20 per hour") into a structured range. */
function parseSalaryText(text: string): Job["salary"] {
  if (!text) return undefined;
  const currency = /€|\beur\b/i.test(text) ? "EUR" : /£|\bgbp\b/i.test(text) ? "GBP" : /\$|\busd\b/i.test(text) ? "USD" : null;
  if (!currency) return undefined;
  const period: SalaryPeriod = /hour|hora|\bora\b|\/\s*h\b/i.test(text) ? "HOUR" : /month|mese|mensile|\bmes\b/i.test(text) ? "MONTH" : "YEAR";
  const amounts = (text.replace(/[.,](?=\d{3}\b)/g, "").match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((value) => Number(value.replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!amounts.length) return undefined;
  return salaryFromSource(amounts[0], amounts[1] ?? amounts[0], currency, period);
}

async function postJson<T>(url: string, body: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "user-agent": USER_AGENT }, body, redirect: "manual", signal: controller.signal });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error("Provider response is too large");
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
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

const FX_TO_EUR: Record<string, number> = { EUR: 1, GBP: 1.17, USD: 0.92, CHF: 1.05, PLN: 0.23, CAD: 0.68, AUD: 0.6, SGD: 0.68, INR: 0.011, BRL: 0.17, ZAR: 0.05, MXN: 0.05, NZD: 0.56, SEK: 0.088, DKK: 0.134, NOK: 0.086, CZK: 0.04, RON: 0.2, HUF: 0.0026 };

/** Employer-stated pay only. A missing or malformed range stays absent rather than being estimated. */
function salaryFromSource(min?: number | null, max?: number | null, currency = "EUR", period: SalaryPeriod = "YEAR"): Job["salary"] {
  const low = typeof min === "number" && Number.isFinite(min) && min > 0 ? Math.round(min) : null;
  const high = typeof max === "number" && Number.isFinite(max) && max > 0 ? Math.round(max) : null;
  if (low === null && high === null) return undefined;
  const from = low ?? high!;
  const to = high ?? low!;
  if (to < from) return undefined;
  const rate = FX_TO_EUR[currency] ?? 1;
  const factor = period === "HOUR" ? 2080 : period === "MONTH" ? 12 : 1;
  return {
    originalAmountMin: from, originalAmountMax: to, originalCurrency: currency, originalPeriod: period,
    normalizedAnnualMin: Math.round(from * factor * rate), normalizedAnnualMax: Math.round(to * factor * rate),
    normalizedCurrency: "EUR", estimated: currency !== "EUR",
  };
}

function jobFromSource(input: {
  providerId: string; providerName: string; externalId: string; url: string; title: string; company: string;
  location: string; description: string; publishedAt?: string; expiresAt?: string; employment?: string;
  countryCode?: string; salary?: Job["salary"]; remote?: boolean;
}): Job {
  const description = stripHtml(input.description).slice(0, 20_000);
  const location = stripHtml(input.location || "Location not stated").slice(0, 240);
  const combined = `${input.title}\n${location}\n${description}`;
  const requiredSkills = extractSkills(combined);
  const countryCode = input.countryCode ?? inferCountryCode(location);
  const responsibilities = description.split(/\n|(?<=[.!?])\s+/).map((line) => line.trim()).filter((line) => line.length > 35).slice(0, 4);
  const url = new URL(input.url);
  return {
    id: stableId(input.providerId, input.externalId), externalId: input.externalId, providerId: input.providerId,
    providerName: input.providerName, applicationMethod: "external", canonicalUrl: url.toString(), originalUrl: url.toString(),
    title: stripHtml(input.title).slice(0, 180), normalizedTitle: stripHtml(input.title).toLowerCase().slice(0, 180),
    company: stripHtml(input.company).slice(0, 140), companyDomain: url.hostname, countryCode, country: countryNames[countryCode] ?? "European Union",
    city: location.split(/[,;·]/)[0]?.trim() || location, locationText: location, workplace: input.remote ? "Remote" : inferWorkplace(`${input.title}\n${location}`),
    employmentType: inferEmployment(input.employment ?? combined), seniority: inferSeniority(input.title), salary: input.salary, description,
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
  // Short words are matched on a boundary so "IT" does not hit "position"; a multi-word
  // keyword matches when all its words appear, so "IT Support Specialist" still finds
  // "IT System Support Specialist" instead of being discarded.
  const hasWord = (word: string) => word.length <= 3
    ? new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`).test(haystack)
    : haystack.includes(word);
  return query.keywords.some((keyword) => {
    const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length > 0 && words.every(hasWord);
  });
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

async function fetchJson<T>(url: string, token?: string, extraHeaders?: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": USER_AGENT, ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders }, redirect: "manual", signal: controller.signal });
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
  // No per-domain allow/deny list: a blanket block also refuses sites the operator
  // is authorized to use. Each site's own robots.txt is the access policy, and it is
  // enforced per URL in JsonLdCrawlerProvider before any page is read.
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

const robotsCache = new Map<string, { text: string; status: number; ok: boolean; expiresAt: number }>();

/** robots.txt is the publisher's word on crawling; an unreachable one (other than 404) blocks the fetch. */
async function robotsPermits(url: URL): Promise<boolean> {
  const cached = robotsCache.get(url.origin);
  const robots = cached && cached.expiresAt > Date.now() ? cached : await (async () => {
    const result = await fetchText(new URL("/robots.txt", url.origin).toString(), "text/plain", 500_000);
    const entry = { text: result.text, status: result.response.status, ok: result.response.ok, expiresAt: Date.now() + CACHE_TTL_MS };
    robotsCache.set(url.origin, entry);
    return entry;
  })();
  if (!robots.ok && robots.status !== 404) throw new Error(`robots.txt returned ${robots.status}`);
  return !robots.ok || robotsAllows(robots.text, `${url.pathname}${url.search}`);
}

async function fetchCrawlableHtml(url: URL): Promise<string> {
  const page = await fetchText(url.toString(), "text/html,application/xhtml+xml", 2_000_000);
  if (!page.response.ok || !/text\/html|application\/xhtml\+xml/i.test(page.response.headers.get("content-type") ?? "")) throw new Error("Job page is not crawlable HTML");
  return page.text;
}

function jobPostingsFromHtml(html: string): Record<string, unknown>[] {
  const postings: Record<string, unknown>[] = [];
  for (const script of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { findJobPostings(JSON.parse(script[1]), postings); } catch { /* malformed publisher JSON-LD is ignored */ }
  }
  return postings;
}

function jobFromPosting(providerId: string, providerName: string, posting: Record<string, unknown>, pageUrl: URL, index: number): Job {
  const organization = posting.hiringOrganization as Record<string, unknown> | undefined;
  return jobFromSource({ providerId, providerName, externalId: String(posting.identifier && typeof posting.identifier === "object" ? (posting.identifier as Record<string, unknown>).value : posting.identifier ?? `${pageUrl.hostname}-${index}`), url: String(posting.url ?? pageUrl), title: String(posting.title ?? "Untitled role"), company: String(organization?.name ?? pageUrl.hostname), location: schemaLocation(posting.jobLocation) || String(posting.jobLocationType ?? "Location not stated"), description: String(posting.description ?? ""), employment: Array.isArray(posting.employmentType) ? posting.employmentType.join(" ") : String(posting.employmentType ?? ""), publishedAt: String(posting.datePosted ?? ""), expiresAt: String(posting.validThrough ?? "") });
}

const JOB_LINK_PATTERN = /(job|jobs|career|careers|posizion|lavora|offert|vacan|opportunit|candidat|annunci|stellen)/i;

/** Same-origin links on a careers page that look like individual vacancies. */
function discoverJobLinks(html: string, pageUrl: URL, max: number): URL[] {
  const links = new Map<string, URL>();
  for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let link: URL;
    try { link = new URL(anchor[1], pageUrl); } catch { continue; }
    if (link.origin !== pageUrl.origin || link.protocol !== "https:" || link.pathname === pageUrl.pathname || !JOB_LINK_PATTERN.test(link.pathname)) continue;
    link.hash = "";
    links.set(link.toString(), link);
    if (links.size >= max) break;
  }
  return [...links.values()];
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
    const url = safeConfiguredUrl(value);
    if (!(await robotsPermits(url))) throw new Error("robots.txt does not permit this job URL");
    const html = await fetchCrawlableHtml(url);
    const direct = jobPostingsFromHtml(html).map((posting, index) => jobFromPosting(this.id, this.name, posting, url, index));
    if (direct.length) return direct;
    // A careers listing carries no posting itself, so its own job links are followed one level down.
    const settled = await Promise.allSettled(discoverJobLinks(html, url, 20).map(async (link) => {
      if (!(await robotsPermits(link))) return [];
      return jobPostingsFromHtml(await fetchCrawlableHtml(link)).map((posting, index) => jobFromPosting(this.id, this.name, posting, link, index));
    }));
    return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
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

/**
 * Adzuna is a licensed job aggregator with a documented public API. It is the
 * lawful way to reach the wide-net listings people expect from a search site;
 * Indeed and LinkedIn have no equivalent open API and are refused above.
 */
const ADZUNA_CURRENCY: Record<string, string> = { it: "EUR", de: "EUR", fr: "EUR", es: "EUR", nl: "EUR", at: "EUR", be: "EUR", ie: "EUR", pt: "EUR", gb: "GBP", pl: "PLN", ch: "CHF", us: "USD", ca: "CAD", au: "AUD", nz: "NZD", sg: "SGD", in: "INR", br: "BRL", mx: "MXN", za: "ZAR" };

export class AdzunaJobProvider extends LiveProvider {
  readonly id = "adzuna";
  readonly name = "Adzuna";
  readonly countriesSupported = Object.keys(ADZUNA_CURRENCY).map((code) => code.toUpperCase());
  readonly languagesSupported = ["en", "it", "es", "de", "fr", "nl", "pt"];
  private readonly appId?: string;
  private readonly appKey?: string;
  private readonly markets: string[];
  constructor(appId?: string, appKey?: string, markets: string[] = ["it"]) {
    super();
    this.appId = appId; this.appKey = appKey;
    this.markets = markets.map((market) => market.toLowerCase()).filter((market) => market in ADZUNA_CURRENCY);
    if (!appId || !appKey) this.status = "offline";
  }
  private async fetchMarket(market: string, keywords: string[], query: ProviderQuery): Promise<Job[]> {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/${market}/search/1`);
    url.searchParams.set("app_id", this.appId!);
    url.searchParams.set("app_key", this.appKey!);
    url.searchParams.set("results_per_page", "50");
    url.searchParams.set("content-type", "application/json");
    if (keywords.length) url.searchParams.set("what_or", keywords.slice(0, 8).join(" "));
    if (query.location) url.searchParams.set("where", query.location);
    if (query.location && query.radiusKm) url.searchParams.set("distance", String(query.radiusKm));
    const data = await fetchJson<{ results?: Array<{ id?: string | number; title?: string; description?: string; created?: string; redirect_url?: string; company?: { display_name?: string }; location?: { display_name?: string }; salary_min?: number; salary_max?: number; salary_is_predicted?: string; contract_time?: string; contract_type?: string }> }>(url.toString());
    const currency = ADZUNA_CURRENCY[market] ?? "EUR";
    return (data.results ?? []).flatMap((item) => {
      const link = item.redirect_url;
      if (!link || !item.title) return [];
      // Adzuna flags predicted pay; only employer-stated ranges are shown as salary.
      const predicted = item.salary_is_predicted === "1";
      return [jobFromSource({
        providerId: this.id, providerName: this.name, externalId: String(item.id ?? link), url: link,
        title: item.title, company: item.company?.display_name ?? "Employer",
        location: item.location?.display_name ?? market.toUpperCase(), description: item.description ?? "",
        publishedAt: item.created, employment: [item.contract_time, item.contract_type].filter(Boolean).join(" "),
        countryCode: market.toUpperCase(),
        salary: predicted ? undefined : salaryFromSource(item.salary_min, item.salary_max, currency, "YEAR"),
      })];
    });
  }
  private async allJobs(query: ProviderQuery): Promise<Job[]> {
    if (!this.appId || !this.appKey) throw new Error("Adzuna requires ADZUNA_APP_ID and ADZUNA_APP_KEY");
    const requested = query.countries?.map((code) => code.toLowerCase()).filter((code) => code in ADZUNA_CURRENCY) ?? [];
    const markets = query.regional ? this.markets.filter((market) => !query.countries?.length || query.countries.some((code) => code.toLowerCase() === market.toLowerCase())) : requested.length ? requested : this.markets;
    const keywords = query.keywords ?? [];
    return cachedJobs(`${this.id}:${markets.join(",")}:${keywords.slice(0, 8).join("|")}:${query.location ?? ""}:${query.radiusKm ?? ""}`, () => this.observe(async () => {
      const settled = await Promise.allSettled(markets.map((market) => this.fetchMarket(market, keywords, query)));
      const jobs = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (!jobs.length && settled.every((result) => result.status === "rejected")) throw new Error("Adzuna returned no usable markets");
      return jobs;
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs(query)).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs({})).find((job) => job.externalId === externalId) ?? null; }
}

/**
 * Jooble is a licensed aggregator covering boards Greenhouse-style feeds never reach.
 * Its own location filter is loose — a "Milano" query returns Texas listings — so each
 * posting is re-checked against the requested market and dropped when its stated
 * location does not resolve to that country, rather than being mislabeled.
 */
const JOOBLE_COUNTRY: Record<string, string> = {
  IT: "Italy", ES: "Spain", DE: "Germany", FR: "France", NL: "Netherlands", IE: "Ireland",
  PT: "Portugal", AT: "Austria", BE: "Belgium", CH: "Switzerland", GB: "United Kingdom",
  PL: "Poland", RO: "Romania", CZ: "Czechia", SE: "Sweden", US: "United States", CA: "Canada",
};

type JoobleRow = { title?: string; location?: string; snippet?: string; salary?: string; source?: string; type?: string; link?: string; company?: string; updated?: string };

export class JoobleJobProvider extends LiveProvider {
  readonly id = "jooble";
  readonly name = "Jooble";
  readonly countriesSupported = Object.keys(JOOBLE_COUNTRY);
  readonly languagesSupported = ["en", "it", "es", "de", "fr"];
  private readonly apiKey?: string;
  private readonly markets: string[];
  constructor(apiKey?: string, markets: string[] = ["IT"]) {
    super();
    this.apiKey = apiKey;
    this.markets = markets.map((market) => market.toUpperCase()).filter((market) => market in JOOBLE_COUNTRY);
    if (!apiKey) this.status = "offline";
  }
  private async fetchMarket(code: string, keywords: string[], query: ProviderQuery): Promise<Job[]> {
    // Jooble accepts discrete radii; fetch the next wider ring and enforce the
    // candidate's precise radius on our server.
    const providerRadius = query.radiusKm ? [4, 8, 16, 26, 40, 80].find((km) => km >= query.radiusKm!) : undefined;
    const body = JSON.stringify({ keywords: keywords.slice(0, 6).join(", "), location: query.location ? `${query.location}, ${JOOBLE_COUNTRY[code]}` : JOOBLE_COUNTRY[code], ...(query.location && providerRadius ? { radius: String(providerRadius) } : {}), page: "1" });
    const data = await postJson<{ jobs?: JoobleRow[] }>(`https://jooble.org/api/${encodeURIComponent(this.apiKey!)}`, body);
    return (data.jobs ?? []).flatMap((item) => {
      const link = item.link;
      const title = item.title;
      const location = item.location ?? "";
      if (!link || !title) return [];
      // A posting that clearly belongs to another country is dropped rather than
      // mislabeled; an unrecognized location is attributed to the market queried.
      const inferred = inferCountryCodeOrNull(location);
      if (inferred && inferred !== code && inferred !== "EU") return [];
      // The numeric id exceeds safe integer precision, so it is read from the link text.
      const externalId = /\/jdp\/(-?\d+)/.exec(link)?.[1] ?? link;
      return [jobFromSource({
        providerId: this.id, providerName: this.name, externalId, url: link, title,
        company: item.company || item.source || "Employer", location, description: item.snippet ?? "",
        employment: item.type, publishedAt: item.updated, countryCode: code, salary: parseSalaryText(item.salary ?? ""),
      })];
    });
  }
  private async allJobs(query: ProviderQuery): Promise<Job[]> {
    if (!this.apiKey) throw new Error("Jooble requires JOOBLE_API_KEY");
    const requested = query.countries?.map((code) => code.toUpperCase()).filter((code) => code in JOOBLE_COUNTRY) ?? [];
    const markets = query.regional ? this.markets.filter((market) => !query.countries?.length || query.countries.some((code) => code.toLowerCase() === market.toLowerCase())) : requested.length ? requested : this.markets;
    const keywords = query.keywords ?? [];
    return cachedJobs(`${this.id}:${markets.join(",")}:${keywords.slice(0, 6).join("|")}:${query.location ?? ""}:${query.radiusKm ?? ""}`, () => this.observe(async () => {
      const settled = await Promise.allSettled(markets.map((market) => this.fetchMarket(market, keywords, query)));
      const jobs = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (!jobs.length && settled.every((result) => result.status === "rejected")) throw new Error("Jooble returned no usable markets");
      return jobs;
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs(query)).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs({})).find((job) => job.externalId === externalId) ?? null; }
}

/**
 * Careerjet is a licensed aggregator with wide European coverage. Its public API is
 * plain HTTP and rejects requests without a Referer, so only the affiliate id and the
 * search terms travel — never candidate data. Its result links are affiliate redirects
 * that can rotate, so the stable id is derived from the posting itself.
 */
const CAREERJET_LOCALE: Record<string, string> = {
  IT: "it_IT", ES: "es_ES", DE: "de_DE", FR: "fr_FR", NL: "nl_NL", PT: "pt_PT", GB: "en_GB",
  IE: "en_IE", AT: "de_AT", CH: "de_CH", BE: "fr_BE", PL: "pl_PL", SE: "sv_SE", DK: "da_DK",
  RO: "ro_RO", CZ: "cs_CZ", US: "en_US", CA: "en_CA",
};

type CareerjetRow = { title?: string; company?: string; locations?: string; description?: string; salary?: string; date?: string; url?: string; site?: string };

export class CareerjetJobProvider extends LiveProvider {
  readonly id = "careerjet";
  readonly name = "Careerjet";
  readonly countriesSupported = Object.keys(CAREERJET_LOCALE);
  readonly languagesSupported = ["en", "it", "es", "de", "fr", "nl", "pt"];
  private readonly affiliateId?: string;
  private readonly markets: string[];
  private readonly siteUrl: string;
  constructor(affiliateId?: string, markets: string[] = ["IT"], siteUrl = "https://role-radar.markom91.chatgpt.site") {
    super();
    this.affiliateId = affiliateId;
    this.siteUrl = siteUrl;
    this.markets = markets.map((market) => market.toUpperCase()).filter((market) => market in CAREERJET_LOCALE);
    if (!affiliateId) this.status = "offline";
  }
  private async fetchMarket(code: string, keywords: string[], query: ProviderQuery): Promise<Job[]> {
    const url = new URL("http://public.api.careerjet.net/search");
    url.searchParams.set("affid", this.affiliateId!);
    // Careerjet ANDs across words and binds OR only to adjacent terms, so a combined
    // query collapses to nothing ("a b OR c d" becomes a AND b AND (c OR d)). The
    // primary role term is sent alone and NextJOB's own relevance filter does the rest.
    const primary = keywords.find((keyword) => keyword.trim().length > 0);
    if (primary) url.searchParams.set("keywords", primary.trim());
    if (query.location) url.searchParams.set("location", query.location);
    if (query.location && query.radiusKm) url.searchParams.set("radius", String(query.radiusKm));
    url.searchParams.set("locale_code", CAREERJET_LOCALE[code]!);
    url.searchParams.set("pagesize", "50");
    url.searchParams.set("user_agent", USER_AGENT);
    url.searchParams.set("user_ip", process.env.CAREERJET_USER_IP?.trim() || "0.0.0.0");
    url.searchParams.set("url", this.siteUrl);
    const data = await fetchJson<{ type?: string; error?: string; jobs?: CareerjetRow[] }>(url.toString(), undefined, { referer: `${this.siteUrl}/` });
    if (data.error) throw new Error(data.error);
    return (data.jobs ?? []).flatMap((item) => {
      const link = item.url;
      const title = item.title;
      const location = item.locations ?? "";
      if (!link || !title) return [];
      const inferred = inferCountryCodeOrNull(location);
      if (inferred && inferred !== code && inferred !== "EU") return [];
      const company = item.company || item.site || "Employer";
      return [jobFromSource({
        providerId: this.id, providerName: this.name,
        externalId: stableId(code, `${company}-${title}-${location}`), url: link, title, company,
        location, description: item.description ?? "", publishedAt: item.date,
        countryCode: inferred ?? code, salary: parseSalaryText(item.salary ?? ""),
      })];
    });
  }
  private async allJobs(query: ProviderQuery): Promise<Job[]> {
    if (!this.affiliateId) throw new Error("Careerjet requires CAREERJET_AFFILIATE_ID");
    const requested = query.countries?.map((code) => code.toUpperCase()).filter((code) => code in CAREERJET_LOCALE) ?? [];
    const markets = query.regional ? this.markets.filter((market) => !query.countries?.length || query.countries.some((code) => code.toLowerCase() === market.toLowerCase())) : requested.length ? requested : this.markets;
    const keywords = query.keywords ?? [];
    return cachedJobs(`${this.id}:${markets.join(",")}:${keywords.slice(0, 6).join("|")}:${query.location ?? ""}:${query.radiusKm ?? ""}`, () => this.observe(async () => {
      const settled = await Promise.allSettled(markets.map((market) => this.fetchMarket(market, keywords, query)));
      const jobs = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (!jobs.length && settled.every((result) => result.status === "rejected")) throw new Error("Careerjet returned no usable markets");
      return jobs;
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs(query)).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs({})).find((job) => job.externalId === externalId) ?? null; }
}

/** Arbeitnow publishes an open, key-free European job board feed. */
export class ArbeitnowJobProvider extends LiveProvider {
  readonly id = "arbeitnow";
  readonly name = "Arbeitnow";
  readonly countriesSupported = ["EU", "DE", "IT", "ES", "NL", "PL", "AT", "CH"];
  readonly languagesSupported = ["en", "de"];
  private async allJobs(): Promise<Job[]> {
    return cachedJobs(this.id, () => this.observe(async () => {
      const data = await fetchJson<{ data?: Array<{ slug?: string; company_name?: string; title?: string; description?: string; remote?: boolean; url?: string; location?: string; created_at?: number; job_types?: string[] }> }>("https://www.arbeitnow.com/api/job-board-api");
      return (data.data ?? []).flatMap((item) => {
        if (!item.url || !item.title) return [];
        return [jobFromSource({
          providerId: this.id, providerName: this.name, externalId: item.slug ?? item.url, url: item.url,
          title: item.title, company: item.company_name ?? "Employer", location: item.location ?? "Europe",
          description: item.description ?? "", employment: item.job_types?.join(" "), remote: item.remote === true,
          publishedAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : undefined,
        })];
      });
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs()).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs()).find((job) => job.externalId === externalId) ?? null; }
}

export class AshbyJobProvider extends LiveProvider {
  readonly id: string;
  readonly name: string;
  readonly countriesSupported = ["EU", "IT", "ES", "DE", "NL", "GB", "IE", "FR", "US"];
  readonly languagesSupported = ["en"];
  private readonly org: string;
  constructor(org: string, company: string) { super(); this.org = org; this.id = `ashby-${org}`; this.name = `Ashby · ${company}`; }
  private async allJobs(): Promise<Job[]> {
    return cachedJobs(this.id, () => this.observe(async () => {
      const data = await fetchJson<{ jobs?: Array<{ id?: string; title?: string; location?: string; descriptionPlain?: string; jobUrl?: string; publishedAt?: string; employmentType?: string; isRemote?: boolean }> }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(this.org)}`);
      return (data.jobs ?? []).flatMap((job) => {
        if (!job.jobUrl || !job.title) return [];
        return [jobFromSource({ providerId: this.id, providerName: this.name, externalId: job.id ?? job.jobUrl, url: job.jobUrl, title: job.title, company: this.name.replace("Ashby · ", ""), location: job.location ?? "Location not stated", description: job.descriptionPlain ?? "", employment: job.employmentType, publishedAt: job.publishedAt, remote: job.isRemote === true })];
      });
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs()).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs()).find((job) => job.externalId === externalId) ?? null; }
}

export class WorkableJobProvider extends LiveProvider {
  readonly id: string;
  readonly name: string;
  readonly countriesSupported = ["EU", "IT", "ES", "DE", "NL", "GB", "IE", "GR"];
  readonly languagesSupported = ["en", "it"];
  private readonly account: string;
  constructor(account: string, company: string) { super(); this.account = account; this.id = `workable-${account}`; this.name = `Workable · ${company}`; }
  private async allJobs(): Promise<Job[]> {
    return cachedJobs(this.id, () => this.observe(async () => {
      const data = await fetchJson<{ jobs?: Array<{ shortcode?: string; title?: string; description?: string; url?: string; created_at?: string; employment_type?: string; telecommuting?: boolean; location?: { city?: string; country?: string } }> }>(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(this.account)}?details=true`);
      return (data.jobs ?? []).flatMap((job) => {
        if (!job.url || !job.title) return [];
        return [jobFromSource({ providerId: this.id, providerName: this.name, externalId: job.shortcode ?? job.url, url: job.url, title: job.title, company: this.name.replace("Workable · ", ""), location: [job.location?.city, job.location?.country].filter(Boolean).join(", ") || "Location not stated", description: job.description ?? "", employment: job.employment_type, publishedAt: job.created_at, remote: job.telecommuting === true })];
      });
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs()).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs()).find((job) => job.externalId === externalId) ?? null; }
}

export class RecruiteeJobProvider extends LiveProvider {
  readonly id: string;
  readonly name: string;
  readonly countriesSupported = ["EU", "IT", "NL", "DE", "ES", "BE"];
  readonly languagesSupported = ["en", "it", "nl"];
  private readonly company: string;
  constructor(company: string, label: string) { super(); this.company = company; this.id = `recruitee-${company}`; this.name = `Recruitee · ${label}`; }
  private async allJobs(): Promise<Job[]> {
    return cachedJobs(this.id, () => this.observe(async () => {
      const data = await fetchJson<{ offers?: Array<{ id?: number; title?: string; description?: string; requirements?: string; careers_url?: string; city?: string; country?: string; published_at?: string; employment_type_code?: string; remote?: boolean }> }>(`https://${encodeURIComponent(this.company)}.recruitee.com/api/offers/`);
      return (data.offers ?? []).flatMap((offer) => {
        if (!offer.careers_url || !offer.title) return [];
        return [jobFromSource({ providerId: this.id, providerName: this.name, externalId: String(offer.id ?? offer.careers_url), url: offer.careers_url, title: offer.title, company: this.name.replace("Recruitee · ", ""), location: [offer.city, offer.country].filter(Boolean).join(", ") || "Location not stated", description: [offer.description, offer.requirements].filter(Boolean).join("\n"), employment: offer.employment_type_code, publishedAt: offer.published_at, remote: offer.remote === true })];
      });
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs()).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs()).find((job) => job.externalId === externalId) ?? null; }
}

/**
 * SmartRecruiters publishes every customer's public postings through one open API
 * with a direct apply link and a country filter, so only the requested market is read.
 * The list omits the ad text, so each posting's detail is fetched (capped) for the
 * description; a posting whose detail fails still appears with the employer link.
 */
type SmartRecruitersPosting = { id: string; name: string; releasedDate?: string; company?: { identifier?: string; name?: string }; location?: { city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean; fullLocation?: string }; typeOfEmployment?: { label?: string }; experienceLevel?: { label?: string } };
type SmartRecruitersDetail = SmartRecruitersPosting & { postingUrl?: string; applyUrl?: string; jobAd?: { sections?: Record<string, { title?: string; text?: string } | undefined> } };
const SMARTRECRUITERS_DETAIL_LIMIT = 40;

export class SmartRecruitersJobProvider extends LiveProvider {
  readonly id: string;
  readonly name: string;
  readonly countriesSupported = ["EU", "IT", "ES", "DE", "FR", "NL", "GB", "IE", "PT", "AT", "CH", "BE", "PL", "US"];
  readonly languagesSupported = ["en", "it"];
  private readonly company: string;
  private readonly label: string;
  private readonly markets: string[];
  constructor(company: string, label: string, markets: string[] = ["IT"]) {
    super();
    this.company = company; this.label = label; this.id = `smartrecruiters-${company.toLowerCase()}`; this.name = `SmartRecruiters · ${label}`;
    this.markets = markets.map((market) => market.toLowerCase()).filter((market) => /^[a-z]{2}$/.test(market));
  }
  private postingUrl(posting: SmartRecruitersDetail): string {
    return posting.postingUrl ?? posting.applyUrl ?? `https://jobs.smartrecruiters.com/${encodeURIComponent(this.company)}/${encodeURIComponent(posting.id)}`;
  }
  private toJob(posting: SmartRecruitersDetail): Job {
    const sections = posting.jobAd?.sections ?? {};
    const description = ["jobDescription", "qualifications", "additionalInformation"].map((key) => sections[key]?.text ?? "").filter(Boolean).join("\n");
    const location = posting.location?.fullLocation || [posting.location?.city, posting.location?.region, posting.location?.country?.toUpperCase()].filter(Boolean).join(", ") || "Location not stated";
    const countryCode = posting.location?.country ? posting.location.country.toUpperCase() : undefined;
    const job = jobFromSource({
      providerId: this.id, providerName: this.name, externalId: posting.id, url: this.postingUrl(posting), title: posting.name,
      company: posting.company?.name || this.label, location, description, publishedAt: posting.releasedDate,
      employment: [posting.typeOfEmployment?.label, posting.experienceLevel?.label].filter(Boolean).join(" "), countryCode, remote: posting.location?.remote === true,
    });
    return posting.location?.hybrid && job.workplace === "On-site" ? { ...job, workplace: "Hybrid" } : job;
  }
  private async fetchMarket(market: string): Promise<Job[]> {
    const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(this.company)}/postings`;
    const list = await fetchJson<{ content?: SmartRecruitersPosting[] }>(`${base}?country=${encodeURIComponent(market)}&limit=100`);
    const postings = (list.content ?? []).filter((posting) => posting.id && posting.name);
    const details = await Promise.allSettled(postings.slice(0, SMARTRECRUITERS_DETAIL_LIMIT).map((posting) => fetchJson<SmartRecruitersDetail>(`${base}/${encodeURIComponent(posting.id)}`)));
    return postings.map((posting, index) => {
      const detail = details[index];
      return this.toJob(detail?.status === "fulfilled" ? { ...posting, ...detail.value } : posting);
    });
  }
  private async allJobs(query: ProviderQuery): Promise<Job[]> {
    const requested = query.countries?.map((code) => code.toLowerCase()).filter((code) => /^[a-z]{2}$/.test(code)) ?? [];
    const markets = query.regional ? this.markets.filter((market) => !query.countries?.length || query.countries.some((code) => code.toLowerCase() === market.toLowerCase())) : requested.length ? requested : this.markets;
    return cachedJobs(`${this.id}:${markets.join(",")}`, () => this.observe(async () => {
      const settled = await Promise.allSettled(markets.map((market) => this.fetchMarket(market)));
      const jobs = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (!jobs.length && settled.some((result) => result.status === "rejected")) throw new Error("SmartRecruiters returned no usable markets");
      return jobs;
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs(query)).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs({})).find((job) => job.externalId === externalId) ?? null; }
}

/**
 * Personio exposes each customer's open positions as a public XML feed at
 * {company}.jobs.personio.de/xml (also .com); it is the ATS most common among Italian
 * and DACH mid-sized employers. Workers have no XML parser, so the small, flat
 * schema is read with tag matching.
 */
function xmlTag(xml: string, name: string): string {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  if (!match) return "";
  // CDATA is literal by definition; only plain text carries XML entities to decode.
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(match[1]);
  if (cdata) return cdata[1].trim();
  return match[1].replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, "&").trim();
}

export class PersonioJobProvider extends LiveProvider {
  readonly id: string;
  readonly name: string;
  readonly countriesSupported = ["EU", "IT", "DE", "AT", "CH", "ES", "NL", "GB", "FR"];
  readonly languagesSupported = ["en", "it", "de"];
  private readonly label: string;
  private readonly host: string;
  constructor(company: string, label: string, tld: "de" | "com" = "de") {
    super();
    this.label = label; this.host = `${company}.jobs.personio.${tld}`;
    this.id = `personio-${company}`; this.name = `Personio · ${label}`;
  }
  private async allJobs(): Promise<Job[]> {
    return cachedJobs(this.id, () => this.observe(async () => {
      const { response, text } = await fetchText(`https://${this.host}/xml`, "application/xml, text/xml");
      if (!response.ok) throw new Error(`Provider returned ${response.status}`);
      if (!/<workzag-jobs|<position>/i.test(text)) throw new Error("Personio feed did not return positions");
      return [...text.matchAll(/<position>([\s\S]*?)<\/position>/gi)].flatMap(([, position]) => {
        const id = xmlTag(position, "id");
        const title = xmlTag(position, "name");
        if (!id || !title) return [];
        const descriptions = [...position.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/gi)].map(([, section]) => `${xmlTag(section, "name")}\n${xmlTag(section, "value")}`);
        const keywords = xmlTag(position, "keywords");
        return [jobFromSource({
          providerId: this.id, providerName: this.name, externalId: id, url: `https://${this.host}/job/${encodeURIComponent(id)}`, title,
          company: xmlTag(position, "subcompany") || this.label, location: xmlTag(position, "office") || "Location not stated",
          description: [...descriptions, keywords ? `Keywords: ${keywords}` : ""].filter(Boolean).join("\n"),
          employment: `${xmlTag(position, "employmentType")} ${xmlTag(position, "schedule")}`, publishedAt: xmlTag(position, "createdAt"),
        })];
      });
    }));
  }
  async searchJobs(query: ProviderQuery) { return (await this.allJobs()).filter((job) => matchesQuery(job, query)); }
  async fetchJobDetails(externalId: string) { return (await this.allJobs()).find((job) => job.externalId === externalId) ?? null; }
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
  const lever = configured("LEVER_SITES", ["eu:prima", "eu:optotune", "global:researchgate", "global:reply", "global:musixmatch"]).map((entry) => { const [prefix, siteValue] = entry.includes(":") ? entry.split(":", 2) : ["global", entry]; return new LeverJobProvider(siteValue, displayName(siteValue), prefix === "eu" ? "eu" : "global"); });
  // Employer boards with Italian hiring, checked live: each default answered its public
  // feed with open positions. A slug that stops answering only marks its provider degraded.
  const ashby = configured("ASHBY_ORGS", ["satispay", "docebo", "serenis"]).map((org) => new AshbyJobProvider(org, displayName(org)));
  const workable = configured("WORKABLE_ACCOUNTS", ["moneyfarm"]).map((account) => new WorkableJobProvider(account, displayName(account)));
  const recruitee = configured("RECRUITEE_COMPANIES", []).map((company) => new RecruiteeJobProvider(company, displayName(company)));
  const smartMarkets = configured("SMARTRECRUITERS_MARKETS", ["IT"]);
  const smartrecruiters = configured("SMARTRECRUITERS_COMPANIES", ["BoschGroup:Bosch", "Continental", "ServiceNow", "Wabtec", "AveryDennison:Avery Dennison"]).map((entry) => { const [company, label] = entry.includes(":") ? entry.split(":", 2) : [entry, displayName(entry)]; return new SmartRecruitersJobProvider(company, label, smartMarkets); });
  const personio = configured("PERSONIO_COMPANIES", ["holidu"]).map((entry) => { const [prefix, company] = entry.includes(":") ? entry.split(":", 2) : ["de", entry]; return new PersonioJobProvider(company, displayName(company), prefix === "com" ? "com" : "de"); });
  const crawlerUrls = configured("CRAWLER_JOB_URLS", []);
  const adzunaMarkets = configured("ADZUNA_MARKETS", ["it"]);
  return [
    ...greenhouse, ...lever, ...ashby, ...workable, ...recruitee, ...smartrecruiters, ...personio,
    new AdzunaJobProvider(process.env.ADZUNA_APP_ID, process.env.ADZUNA_APP_KEY, adzunaMarkets),
    new JoobleJobProvider(process.env.JOOBLE_API_KEY, configured("JOOBLE_MARKETS", ["IT"])),
    new CareerjetJobProvider(process.env.CAREERJET_AFFILIATE_ID, configured("CAREERJET_MARKETS", ["IT"]), process.env.NEXT_PUBLIC_APP_URL?.trim() || undefined),
    new ArbeitnowJobProvider(),
    new EuresPartnerProvider(process.env.EURES_PARTNER_API_URL, process.env.EURES_PARTNER_API_TOKEN),
    new JsonLdCrawlerProvider(crawlerUrls),
  ];
}

export const liveJobInternals = { discoverJobLinks, xmlTag, extractSkills, fetchCrawlableHtml, inferCountryCode, inferCountryCodeOrNull, jobFromPosting, jobFromSource, jobPostingsFromHtml, parseSalaryText, robotsAllows, robotsPermits, safeConfiguredUrl, salaryFromSource, stripHtml };
