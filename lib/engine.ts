import type { AtsReport, CandidateProfile, GeneratedApplication, Job, MatchBand, MatchResult, SalaryPeriod } from "./domain";

const skillAliases: Record<string, string[]> = {
  crm: ["salesforce", "customer relationship management"],
  "customer support": ["customer care", "client support", "customer service"],
  "process improvement": ["continuous improvement", "service improvement", "operational excellence"],
  "team training": ["coaching", "enablement", "learning design"],
  "data analysis": ["reporting", "analytics", "customer insights"],
  "it support": ["help desk", "service desk", "desktop support", "technical support", "workplace support"],
  "microsoft 365": ["office 365", "m365"],
  "active directory": ["azure active directory", "microsoft entra", "entra id"],
  networking: ["network support", "tcp ip", "dns", "dhcp", "vpn"],
  "hardware troubleshooting": ["device troubleshooting", "desktop troubleshooting", "computer repair"],
  "software troubleshooting": ["application support", "desktop support", "windows support"],
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
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return Object.entries(skillAliases).some(([root, aliases]) => {
    const group = [root, ...aliases].map(normalizeText);
    return group.includes(a) && group.includes(b);
  });
}

export function canonicalJobKey(job: Job): string {
  return [normalizeText(job.company.replace("(fictional)", "")), normalizeText(job.title), normalizeText(job.locationText)].join("|");
}

export function deduplicateJobs(input: Job[]): Array<{ canonical: Job; sources: Job[] }> {
  const groups = new Map<string, Job[]>();
  for (const job of input) {
    const urlKey = job.canonicalUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
    const key = job.canonicalUrl.includes("example.test/jobs/") ? canonicalJobKey(job) : urlKey;
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  return [...groups.values()].map((sources) => ({
    canonical: [...sources].sort((a, b) => Number(b.providerName === "Direct ATS") - Number(a.providerName === "Direct ATS"))[0],
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

export function scoreJob(profile: CandidateProfile, job: Job, now = new Date("2026-08-05T12:00:00.000Z")): MatchResult {
  const matchedSkills = job.requiredSkills.filter((required) => profile.skills.some((skill) => equivalentSkill(skill, required)) || profile.languages.some((language) => equivalentSkill(language, required)));
  const missingRequired = job.requiredSkills.filter((skill) => !matchedSkills.includes(skill));
  const preferredMatched = job.preferredSkills.filter((required) => profile.skills.some((skill) => equivalentSkill(skill, required)));
  const authorizationMismatch = Boolean(job.workAuthorization && !profile.workAuthorizations.includes(job.workAuthorization));
  const languageMismatch = job.languages.some((language) => language !== "English" && !profile.languages.some((known) => equivalentSkill(known, language)));
  const locationFit = job.workplace === "Remote" || profile.preferences.countries.includes(job.country) || profile.preferences.relocation;
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
  const gaps = [...missingRequired, ...job.preferredSkills.filter((skill) => !preferredMatched.includes(skill))].slice(0, 3);
  const band = bandFor(score, eligible);
  const explanation = eligible
    ? `${band.replace(" match", "")} because you meet ${matchedSkills.length} of ${job.requiredSkills.length} principal requirements${matchedSkills.length ? `, including ${matchedSkills.slice(0, 3).join(", ")}` : ""}.${gaps.length ? ` ${gaps[0]} is not confirmed in your profile.` : " No material gaps were found."}`
    : `Not eligible because ${authorizationMismatch ? `work authorization for ${job.workAuthorization} is not confirmed` : languageMismatch ? "a mandatory language is not confirmed" : !job.active ? "the vacancy has expired" : "the location is incompatible with your preferences"}.`;
  return { job, score, band, eligible, explanation, matchedSkills, gaps, breakdown };
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

export function createDemoApplication(profile: CandidateProfile, job: Job, tone = "Professional"): GeneratedApplication {
  const relevant = profile.skills.filter((skill) => job.requiredSkills.some((required) => equivalentSkill(skill, required)));
  const strongest = (relevant.length ? relevant : profile.skills).slice(0, 4);
  const summary = `${profile.currentRole} with ${profile.yearsOfExperience} years of verified experience supporting users and resolving workplace technology issues. Experienced with ${strongest.join(", ")}, structured troubleshooting, and documenting practical solutions.`;
  const cvBullets = profile.experiences.flatMap((experience) => experience.bullets).slice(0, 4).map((fact) => ({ text: fact.text, sourceFactIds: [fact.id], supported: true }));
  const cvText = [summary, ...cvBullets.map((bullet) => bullet.text), profile.skills.join(", ")].join("\n");
  const opening = tone === "Direct" ? `I am applying for the ${job.title} role because my verified IT-support experience aligns with its core needs.` : tone === "Warm" ? `I was glad to find the ${job.title} role because it combines hands-on troubleshooting with helpful user support.` : `I am applying for the ${job.title} role because it combines user support, structured troubleshooting, and reliable workplace technology.`;
  const coverLetter = `Dear ${job.company.replace(" (fictional)", "")} hiring team,\n\n${opening}\n\nAcross ${profile.yearsOfExperience} years in IT support, I have helped users resolve device, software, account, and connectivity issues. My verified experience with ${strongest.slice(0, 3).join(", ")} aligns with the role's core needs.\n\nI would welcome the opportunity to bring a calm, practical, and well-documented approach to your team. I would be glad to discuss how my experience could support your users and IT operations.\n\nKind regards,\n${profile.fullName}`;
  return {
    jobId: job.id,
    generatedAt: "2026-08-05T12:00:00.000Z",
    model: "nextjob-demo-deterministic-v1",
    promptVersion: "application-grounded-1.0",
    validationResult: "passed",
    summary,
    cvBullets,
    coverLetter,
    email: { subject: `Application — ${job.title} — ${profile.fullName}`, body: `Dear hiring team,\n\nPlease find attached my application for the ${job.title} position. My background in ${strongest.slice(0, 2).join(" and ")} is closely relevant to the role.\n\nThank you for your consideration.\n\nKind regards,\n${profile.fullName}\n\nAttachment reminder: tailored CV and cover letter.` },
    interview: {
      likelyQuestions: ["How do you diagnose an unfamiliar user issue?", "Tell us about a difficult device or network problem you resolved.", "How do you document fixes and keep users informed?"],
      gapQuestions: job.preferredSkills.slice(0, 2).map((gap) => `This role mentions ${gap}. What adjacent verified experience could you discuss honestly?`),
      starPrompts: profile.experiences[0].bullets.slice(0, 2).map((bullet) => `Build a STAR example from: “${bullet.text}”`),
      questionsToAsk: ["What would success look like in the first 90 days?", "Which systems and ticketing tools does the team use?", "How are escalations and knowledge sharing handled?"],
      researchChecklist: ["Review the employer's official careers page", "Confirm the workplace technology stack", "Check recent, verifiable company announcements"],
    },
    ats: atsAnalyze(profile, job, cvText),
  };
}

export function validateGeneratedClaims(application: GeneratedApplication, profile: CandidateProfile): { valid: boolean; unsupported: string[] } {
  const sourceIds = new Set(profile.experiences.flatMap((experience) => experience.bullets.map((bullet) => bullet.id)));
  const unsupported = application.cvBullets.filter((bullet) => !bullet.supported || bullet.sourceFactIds.some((id) => !sourceIds.has(id))).map((bullet) => bullet.text);
  return { valid: unsupported.length === 0, unsupported };
}
