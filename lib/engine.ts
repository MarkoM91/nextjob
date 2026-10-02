import { hasNamedEmployer, jobSourceKind } from "./job-source.ts";
import type { AtsReport, CandidateProfile, GeneratedApplication, Job, MatchBand, MatchResult, SalaryPeriod } from "./domain";

const skillAliases: Record<string, string[]> = {
  crm: ["salesforce", "customer relationship management"],
  "customer support": ["customer care", "client support", "customer service"],
  "process improvement": ["continuous improvement", "service improvement", "operational excellence"],
  "team training": ["coaching", "enablement", "learning design"],
  "data analysis": ["reporting", "analytics", "customer insights"],
  "it support": ["help desk", "helpdesk", "service desk", "desktop support", "technical support", "workplace support", "supporto it", "supporto informatico", "assistenza informatica"],
  "microsoft 365": ["office 365", "m365"],
  "active directory": ["azure active directory", "microsoft entra", "entra id"],
  networking: ["network support", "tcp ip", "dns", "dhcp", "vpn"],
  "hardware troubleshooting": ["device troubleshooting", "desktop troubleshooting", "computer repair", "troubleshooting hardware", "manutenzione pc", "risoluzione problemi hardware"],
  "software troubleshooting": ["application support", "desktop support", "windows support"],
  english: ["inglese"], italian: ["italiano"], german: ["tedesco", "deutsch"], french: ["francese"], spanish: ["spagnolo", "espanol"],
};

export const MATCH_WEIGHTS = {
  requiredSkills: 30,
  experience: 20,
  title: 15,
  seniority: 10,
  language: 7,
  location: 7,
  salary: 5,
  education: 3,
  freshness: 3,
} as const;

export function normalizeText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeSalary(min: number, max: number, currency: string, period: SalaryPeriod, rates: Record<string, number>): { annualMinEur: number; annualMaxEur: number; estimated: boolean } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) throw new Error("Invalid salary range");
  const factor = period === "HOUR" ? 2080 : period === "MONTH" ? 12 : 1;
  const rate = rates[currency];
  if (!rate) throw new Error(`Missing currency rate for ${currency}`);
  return { annualMinEur: Math.round(min * factor * rate), annualMaxEur: Math.round(max * factor * rate), estimated: currency !== "EUR" };
}

function equivalentSkill(candidateSkill: string, requirement: string): boolean {
  const a = normalizeText(candidateSkill);
  const b = normalizeText(requirement);
  if (!a || !b) return false;
  if (a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)) return true;
  return Object.entries(skillAliases).some(([root, aliases]) => {
    const group = [root, ...aliases].map(normalizeText);
    const contains = (text: string) => group.some((term) => ` ${text} `.includes(` ${term} `));
    return contains(a) && contains(b);
  });
}

/** Legal forms and generic suffixes that vary between an employer's board and an aggregator's copy of it. */
const COMPANY_NOISE = /\b(?:s ?r ?l|s ?p ?a|s ?a ?s|s ?n ?c|srls|gmbh|ag|ltd|limited|llc|inc|corp|corporation|plc|bv|nv|sa|se|oy|ab|as|kg|co|company|group|holding|italia|italy|international)\b/g;

export function normalizeCompany(company: string): string {
  return normalizeText(company.replace("(fictional)", "")).replace(COMPANY_NOISE, " ").replace(/\s+/g, " ").trim();
}

/** Recruiting boilerplate that aggregators append to titles: "(m/f/d)", "(all genders)". */
const TITLE_NOISE = /\((?:all genders|[mfwdxh](?:\/[mfwdxh])+)[^)]*\)|\b(?:[mfwdxh]\/[mfwdxh](?:\/[mfwdxh])?|all genders)\b/gi;

export function normalizeJobTitle(title: string): string {
  return normalizeText(title.replace(TITLE_NOISE, " "));
}

/** Boards publish Italian cities in English and aggregators in Italian; both must group. */
const CITY_ALIASES: Record<string, string> = { milan: "milano", rome: "roma", turin: "torino", florence: "firenze", naples: "napoli", venice: "venezia", genoa: "genova", padua: "padova", bolzano: "bozen", "south tyrol": "bozen", munich: "muenchen", cologne: "koeln", vienna: "wien", lisbon: "lisboa", seville: "sevilla", "the hague": "den haag" };

/** "Provincia di Brescia" and "Brescia" are the same place for grouping purposes. */
const CITY_PREFIX = /^(?:provincia di|province of|citta metropolitana di|metropolitan city of|comune di|greater|area di|zona) /;
/** A posting that names only the country (or nothing) can be any city's copy of the vacancy. */
const VAGUE_CITY = /^(?:|italia|italy|europe|eu|remote|remoto|location not stated|non specificato|nazionale|tutta italia)$/;

function jobCity(job: Job): string {
  const city = normalizeText(job.city || job.locationText.split(/[,;·]/)[0] || "").replace(CITY_PREFIX, "");
  // A neighbourhood or province suffix must not split a city's copies across feeds.
  const cityToken = Object.keys(CITY_ALIASES).concat(Object.values(CITY_ALIASES)).find((name) => ` ${city} `.includes(` ${name} `));
  const resolved = CITY_ALIASES[cityToken ?? city] ?? cityToken ?? city;
  return VAGUE_CITY.test(resolved) ? "" : resolved;
}

function sameCity(a: string, b: string): boolean {
  return a === b || a === "" || b === "";
}

export function canonicalJobKey(job: Job): string {
  return [normalizeCompany(job.company), normalizeJobTitle(job.title), jobCity(job)].join("|");
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(" ").filter(Boolean));
  const wordsB = new Set(b.split(" ").filter(Boolean));
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const word of wordsA) if (wordsB.has(word)) shared += 1;
  return shared / (wordsA.size + wordsB.size - shared);
}

/** Titles that differ by one trailing word ("IT Support Specialist" vs "IT Support Specialist Milano") are the same vacancy. */
const SAME_TITLE_THRESHOLD = 0.75;

function sourceRank(job: Job): number {
  if (job.providerName === "Direct ATS") return 0;
  const kind = jobSourceKind(job);
  // The candidate's own copy leads: they chose it, and the feed pins it. Employer boards
  // beat aggregators because their link opens the official form without a redirect wall.
  return kind === "user" ? -1 : kind === "employer" ? 1 : 2;
}

/**
 * Groups the copies of one vacancy. A role is usually published under several ids: the
 * employer's own board, then Adzuna, Jooble and Careerjet re-listing it with a legal
 * suffix on the company, a "(m/f/d)" on the title or the region appended to the city.
 * Copies are grouped on what the vacancy is, and the employer's copy is the one shown. A
 * copy that names only the country joins the vacancy's group whatever city it states.
 * An unnamed employer ("Employer", "indeed.it") cannot be matched, so such postings stay apart.
 */
export function deduplicateJobs(input: Job[]): Array<{ canonical: Job; sources: Job[] }> {
  type Group = { company: string; city: string; title: string; sources: Job[] };
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const job of input) {
    const company = normalizeCompany(job.company);
    const title = normalizeJobTitle(job.title);
    const city = jobCity(job);
    const named = hasNamedEmployer(job);
    const key = named ? [company, title, city].join("|") : [job.id, title, city].join("|");
    let group = byKey.get(key);
    if (!group && named) group = groups.find((candidate) => candidate.company === company && sameCity(candidate.city, city) && titleSimilarity(candidate.title, title) >= SAME_TITLE_THRESHOLD);
    if (!group) { group = { company, city, title, sources: [] }; groups.push(group); }
    byKey.set(key, group);
    group.sources.push(job);
  }
  return groups.map(({ sources }) => ({
    // Among equal sources the copy that names a city and says more wins over a country-only stub.
    canonical: [...sources].sort((a, b) => sourceRank(a) - sourceRank(b) || Number(jobCity(b) !== "") - Number(jobCity(a) !== "") || b.description.length - a.description.length)[0],
    sources,
  }));
}

function bandFor(score: number, eligible: boolean): MatchBand {
  if (!eligible) return "Not eligible";
  if (score >= 85) return "Excellent match";
  if (score >= 72) return "Strong match";
  if (score >= 55) return "Possible match";
  return "Low confidence";
}

export function scoreJob(profile: CandidateProfile, job: Job, now = new Date()): MatchResult {
  const matchedSkills = job.requiredSkills.filter((required) => profile.skills.some((skill) => equivalentSkill(skill, required)) || profile.languages.some((language) => equivalentSkill(language, required)));
  const missingRequired = job.requiredSkills.filter((skill) => !matchedSkills.includes(skill));
  const preferredMatched = job.preferredSkills.filter((required) => profile.skills.some((skill) => equivalentSkill(skill, required)));
  const authorizationMismatch = Boolean(job.workAuthorization && !profile.workAuthorizations.includes(job.workAuthorization));
  const languageMismatch = job.languages.some((language) => !profile.languages.some((known) => equivalentSkill(known, language)));
  const locationFit = profile.preferences.countries.length === 0 || job.workplace === "Remote" || profile.preferences.countries.includes(job.country) || profile.preferences.relocation;
  const eligible = job.active && !authorizationMismatch && !languageMismatch && locationFit;

  const skillScore = job.requiredSkills.length ? matchedSkills.length / job.requiredSkills.length : 0.45;
  const titleWords = new Set(normalizeText(job.title).split(" "));
  const targetWords = new Set(normalizeText([profile.currentRole, ...profile.targetTitles].join(" ")).split(" "));
  const overlap = [...titleWords].filter((word) => targetWords.has(word)).length / Math.max(1, titleWords.size);
  const experienceFit = job.seniority === "Lead" ? Math.min(1, profile.yearsOfExperience / 8) : Math.min(1, profile.yearsOfExperience / 5);
  const seniorityFit = job.seniority === "Lead" && profile.yearsOfExperience < 5 ? 0.35 : 1;
  const languageFit = languageMismatch ? 0 : 1;
  const salaryFit = !job.salary || job.salary.normalizedAnnualMax >= profile.preferences.minimumAnnualSalaryEur ? 1 : 0.35;
  const ageDays = Math.max(0, (now.getTime() - new Date(job.publishedAt).getTime()) / 86400000);
  const freshness = Math.max(0.2, 1 - ageDays / 45);

  const breakdown = {
    requiredSkills: Math.round(skillScore * MATCH_WEIGHTS.requiredSkills),
    experience: Math.round(experienceFit * MATCH_WEIGHTS.experience),
    title: Math.round(overlap * MATCH_WEIGHTS.title),
    seniority: Math.round(seniorityFit * MATCH_WEIGHTS.seniority),
    language: Math.round(languageFit * MATCH_WEIGHTS.language),
    location: Math.round((locationFit ? 1 : 0) * MATCH_WEIGHTS.location),
    salary: Math.round(salaryFit * MATCH_WEIGHTS.salary),
    education: MATCH_WEIGHTS.education,
    freshness: Math.round(freshness * MATCH_WEIGHTS.freshness),
  };
  let score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  if (!eligible) score = Math.min(score, 38);
  if (!job.requiredSkills.length) score = Math.min(score, 70);
  const reviewNotes: string[] = [];
  const listingText = `${job.title}\n${job.description}`;
  const incomplete = job.description.trim().length < 300 || /(?:…|\.\.\.)\s*$/.test(job.description);
  const limited = job.requiredSkills.length < 3 || incomplete;
  if (incomplete) reviewNotes.push("The feed contains a short or incomplete description. Check the original listing for full requirements.");
  else if (job.requiredSkills.length < 3) reviewNotes.push("Few requirements could be identified. This is a preliminary fit, not a complete assessment.");
  const mentionedLanguages: Array<[string, RegExp]> = [["German", /\b(?:german|tedesco|deutsch)\b/i], ["French", /\b(?:french|francese)\b/i], ["Spanish", /\b(?:spanish|spagnolo|español)\b/i]];
  for (const [language, pattern] of mentionedLanguages) {
    if (pattern.test(listingText) && !profile.languages.some((known) => equivalentSkill(known, language))) reviewNotes.push(`${language} is mentioned in the listing and is not in your profile. Check the required level.`);
  }
  if (/categorie?\s+protett[aei]|categoria\s+protetta|l\.?\s*68\s*\/\s*99|legge\s+68/i.test(listingText)) reviewNotes.push("This listing has a protected-category eligibility requirement. Check it with the employer; your eligibility has not been assessed.");
  if (profile.preferences.visaSponsorshipRequired && job.visaSponsorship !== true) reviewNotes.push("Visa sponsorship is not confirmed in this listing. Check with the employer before applying.");
  if (limited) score = Math.min(score, 71);
  else if (reviewNotes.length || job.requirements.some((item) => item.mandatory && item.confidence < 0.9)) score = Math.min(score, 84);
  const gaps = [...missingRequired, ...job.preferredSkills.filter((skill) => !preferredMatched.includes(skill))].slice(0, 3);
  const band = bandFor(score, eligible);
  const explanation = !eligible
    ? `Not eligible because ${authorizationMismatch ? `work authorization for ${job.workAuthorization} is not confirmed` : languageMismatch ? "a mandatory language is not confirmed" : !job.active ? "the vacancy has expired" : "the location is incompatible with your preferences"}.`
    : job.requiredSkills.length === 0
      ? "Ranked on title, seniority, and location fit because the employer listing does not state requirements NextJOB can verify. Review the original description before applying."
      : `${matchedSkills.length} of ${job.requiredSkills.length} identified skills found in your CV${matchedSkills.length ? `: ${matchedSkills.slice(0, 3).join(", ")}` : ""}.${gaps.length ? ` Check ${gaps[0]}; it is not confirmed in your profile.` : " Review the full requirements before applying."}`;
  return { job, score, band, eligible, explanation, matchedSkills, gaps, breakdown, reviewNotes, evidenceCoverage: limited ? "limited" : reviewNotes.length ? "partial" : "detailed" };
}

export const DEFAULT_MAX_JOB_AGE_DAYS = 30;

/**
 * A stale vacancy is usually already filled, so it is withheld rather than ranked low.
 * A posting with no usable date is kept: the feed should not hide a real job because a
 * board omitted its publication date.
 */
export function isRecentPosting(job: Job, maxAgeDays = DEFAULT_MAX_JOB_AGE_DAYS, now = Date.now()): boolean {
  const published = new Date(job.publishedAt).getTime();
  if (!Number.isFinite(published)) return true;
  if (published > now) return true;
  return published >= now - maxAgeDays * 86400000;
}

export function rankJobs(profile: CandidateProfile, jobs: Job[], includeIneligible = false): MatchResult[] {
  return deduplicateJobs(jobs)
    .map(({ canonical }) => scoreJob(profile, canonical))
    .filter((match) => includeIneligible || match.eligible)
    .sort((a, b) => b.score - a.score || b.job.publishedAt.localeCompare(a.job.publishedAt));
}

export function atsAnalyze(profile: CandidateProfile, job: Job, generatedText: string): AtsReport {
  const text = normalizeText(generatedText);
  const requiredCovered = job.requiredSkills.filter((skill) => text.includes(normalizeText(skill)) || profile.skills.some((candidateSkill) => equivalentSkill(candidateSkill, skill) && text.includes(normalizeText(candidateSkill))));
  const preferredCovered = job.preferredSkills.filter((skill) => text.includes(normalizeText(skill)));
  const unsupported = [...job.requiredSkills, ...job.preferredSkills].filter((skill) => text.includes(normalizeText(skill)) && !profile.skills.some((candidateSkill) => equivalentSkill(candidateSkill, skill)) && !profile.languages.some((language) => equivalentSkill(language, skill)));
  const requiredKeywordCoverage = Math.round((requiredCovered.length / Math.max(1, job.requiredSkills.length)) * 100);
  const preferredKeywordCoverage = Math.round((preferredCovered.length / Math.max(1, job.preferredSkills.length)) * 100);
  const factualIntegrityScore = unsupported.length ? Math.max(50, 100 - unsupported.length * 20) : 100;
  const formattingScore = 96;
  const overallScore = Math.round(requiredKeywordCoverage * 0.45 + preferredKeywordCoverage * 0.15 + formattingScore * 0.2 + factualIntegrityScore * 0.2);
  return {
    label: "NextJOB ATS readiness estimate",
    overallScore,
    requiredKeywordCoverage,
    preferredKeywordCoverage,
    formattingScore,
    factualIntegrityScore,
    warnings: unsupported.length ? unsupported.map((skill) => `${skill} appears in the job description but is not verified in your profile.`) : ["Actual employer systems may weigh keywords and formatting differently."],
    disclaimer: "This is a NextJOB estimate, not the proprietary score of an employer or ATS vendor. Actual systems may differ.",
  };
}

/** Function words in the posting languages NextJOB sees most; they carry no relevance signal. */
const RELEVANCE_STOP_WORDS = new Set([
  "with", "that", "this", "from", "your", "will", "have", "them", "they", "what", "when", "where", "which", "while", "about", "into", "than", "then", "there", "their", "were", "been", "also", "more", "most", "such", "each", "other", "these", "those",
  "della", "delle", "degli", "dello", "nella", "nelle", "negli", "sono", "essere", "anche", "come", "alla", "alle", "agli", "sulla", "sulle", "tutti", "tutte", "nostro", "nostra", "nostri", "vostro", "questo", "questa", "quale", "quali", "dove", "quando", "presso", "oppure", "ossia",
]);

function relevanceTerms(text: string, minLength = 4): Set<string> {
  return new Set(normalizeText(text).split(" ").filter((word) => word.length >= minLength && !RELEVANCE_STOP_WORDS.has(word)));
}

/**
 * Verified CV bullets ranked by vocabulary overlap with the posting, so a career-changer's
 * older relevant role outranks an unrelated current one. Recency breaks ties, which keeps
 * the latest role on top for a posting that shares no vocabulary with the CV.
 */
export function selectRelevantBullets(profile: CandidateProfile, job: Job, limit = 5): Array<{ id: string; text: string; experienceId: string; score: number }> {
  const posting = relevanceTerms([job.title, ...job.requiredSkills, ...job.preferredSkills, ...job.responsibilities, job.description].join(" "));
  return profile.experiences
    .flatMap((experience, experienceIndex) => experience.bullets.map((bullet, bulletIndex) => ({
      id: bullet.id, text: bullet.text, experienceId: experience.id,
      score: [...relevanceTerms(bullet.text)].filter((word) => posting.has(word)).length,
      order: experienceIndex * 100 + bulletIndex,
    })))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ id, text, experienceId, score }) => ({ id, text, experienceId, score }));
}

/**
 * Deterministic, occupation-neutral application built only from verified facts. It is the
 * package when no AI writer is configured, and the grounded baseline the AI writer edits.
 */
export function createDemoApplication(profile: CandidateProfile, job: Job, tone = "Professional"): GeneratedApplication {
  const company = job.company.replace(/\s+\(fictional\)$/i, "");
  const stated = [...job.requiredSkills, ...job.preferredSkills];
  // Strengths are only named when they relate to this posting; listing unrelated skills reads as a form letter.
  const postingTerms = relevanceTerms([job.title, ...stated, ...job.responsibilities, job.description].join(" "), 3);
  const matchesStated = profile.skills.filter((skill) => stated.some((required) => equivalentSkill(skill, required)));
  const matchesPosting = profile.skills.filter((skill) => [...relevanceTerms(skill, 3)].some((word) => postingTerms.has(word)));
  const strongest = [...new Set([...matchesStated, ...matchesPosting])].slice(0, 4);
  const selected = selectRelevantBullets(profile, job, 5);
  const related = selected.filter((bullet) => bullet.score > 0);
  const highlights = (related.length ? related : selected).slice(0, 3);
  const bestScore = new Map<string, number>();
  for (const bullet of related) bestScore.set(bullet.experienceId, Math.max(bestScore.get(bullet.experienceId) ?? 0, bullet.score));
  const relatedExperiences = profile.experiences.filter((experience) => bestScore.has(experience.id)).sort((a, b) => bestScore.get(b.id)! - bestScore.get(a.id)!).slice(0, 3);
  const experienceLine = (relatedExperiences.length ? relatedExperiences : profile.experiences.slice(0, 1)).map((experience) => `${experience.role} at ${experience.company}`).join(", ");
  const strengths = strongest.length ? ` Strengths relevant to the ${job.title} role: ${strongest.join(", ")}.` : "";
  const summary = `${profile.currentRole} with ${profile.yearsOfExperience} years of verified experience${experienceLine ? `, including ${experienceLine}` : ""}.${strengths}`;
  const cvBullets = selected.map((bullet) => ({ text: bullet.text, sourceFactIds: [bullet.id], supported: true }));
  const cvText = [summary, ...cvBullets.map((bullet) => bullet.text), profile.skills.join(", ")].join("\n");
  const opening = tone === "Direct"
    ? `I am applying for the ${job.title} role at ${company}. My verified experience matches its stated needs.`
    : tone === "Warm"
      ? `I was glad to find the ${job.title} role at ${company}, and I would like to bring my experience to your team.`
      : tone === "Concise"
        ? `Please consider my application for the ${job.title} role at ${company}.`
        : `I am writing to apply for the ${job.title} role at ${company}.`;
  const coverLetter = `Dear ${company} hiring team,\n\n${opening}\n\nMy background as ${profile.currentRole} spans ${profile.yearsOfExperience} years${experienceLine ? `, including ${experienceLine}` : ""}. The experience most relevant to this role includes:\n${highlights.map((bullet) => `- ${bullet.text}`).join("\n")}\n\n${strongest.length ? `My verified strengths in ${strongest.slice(0, 3).join(", ")} align with the requirements you describe. ` : ""}I would welcome the opportunity to discuss how this experience could contribute to ${company}.\n\nKind regards,\n${profile.fullName}`;
  const unmet = (job.preferredSkills.length ? job.preferredSkills : job.requiredSkills).filter((skill) => !profile.skills.some((known) => equivalentSkill(known, skill)));
  return {
    jobId: job.id,
    generatedAt: new Date().toISOString(),
    model: "nextjob-template-v2",
    promptVersion: "application-grounded-2.0",
    validationResult: "passed",
    summary,
    cvBullets,
    coverLetter,
    email: { subject: `Application — ${job.title} — ${profile.fullName}`, body: `Dear hiring team,\n\nPlease find attached my application for the ${job.title} position at ${company}. My background as ${profile.currentRole}${strongest.length ? ` with ${strongest.slice(0, 2).join(" and ")}` : ""} is directly relevant to the role.\n\nThank you for your consideration.\n\nKind regards,\n${profile.fullName}\n\nAttachment reminder: tailored CV and cover letter.` },
    interview: {
      likelyQuestions: [
        `Walk us through the experience that best prepares you for the ${job.title} role.`,
        job.requiredSkills.length ? `How have you applied ${job.requiredSkills.slice(0, 2).join(" and ")} in a previous role?` : `Why ${company}, and why this role now?`,
        "Describe a difficult situation with a client or colleague and how you resolved it.",
      ],
      gapQuestions: unmet.slice(0, 2).map((gap) => `This role mentions ${gap}. What adjacent verified experience could you discuss honestly?`),
      starPrompts: highlights.slice(0, 2).map((bullet) => `Build a STAR example from: “${bullet.text}”`),
      questionsToAsk: ["What would success look like in the first 90 days?", "How is the team structured, and who would I work with most?", "What are the biggest challenges for the person in this role?"],
      researchChecklist: [`Review ${company}'s official careers page`, "Re-read the original job description before the interview", "Check recent, verifiable company announcements"],
    },
    ats: atsAnalyze(profile, job, cvText),
  };
}

export function validateGeneratedClaims(application: GeneratedApplication, profile: CandidateProfile): { valid: boolean; unsupported: string[] } {
  const sourceIds = new Set(profile.experiences.flatMap((experience) => experience.bullets.map((bullet) => bullet.id)));
  const unsupported = application.cvBullets.filter((bullet) => !bullet.supported || bullet.sourceFactIds.some((id) => !sourceIds.has(id))).map((bullet) => bullet.text);
  return { valid: unsupported.length === 0, unsupported };
}
