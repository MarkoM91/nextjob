export type MatchBand =
  | "Excellent match"
  | "Strong match"
  | "Possible match"
  | "Low confidence"
  | "Not eligible";

export type Workplace = "Remote" | "Hybrid" | "On-site";
export type EmploymentType = "Full-time" | "Part-time" | "Contract" | "Internship";
export type SalaryPeriod = "HOUR" | "MONTH" | "YEAR";

export type Salary = {
  originalAmountMin: number;
  originalAmountMax: number;
  originalCurrency: string;
  originalPeriod: SalaryPeriod;
  normalizedAnnualMin: number;
  normalizedAnnualMax: number;
  normalizedCurrency: "EUR";
  estimated: boolean;
};

export type CandidateFact = {
  id: string;
  label: string;
  value: string;
  sourceText: string;
  confidence: number;
  verifiedByUser: boolean;
};

export type CandidateExperience = {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  bullets: Array<{ id: string; text: string }>;
};

export type CandidateProfile = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  currentRole: string;
  yearsOfExperience: number;
  targetTitles: string[];
  skills: string[];
  languages: string[];
  education: string[];
  workAuthorizations: string[];
  preferences: {
    countries: string[];
    workplace: Workplace[];
    relocation: boolean;
    visaSponsorshipRequired: boolean;
    minimumAnnualSalaryEur: number;
  };
  experiences: CandidateExperience[];
  facts: CandidateFact[];
};

export type JobRequirement = {
  value: string;
  kind: "skill" | "experience" | "language" | "education" | "authorization";
  mandatory: boolean;
  confidence: number;
  evidence: string;
};

export type Job = {
  id: string;
  externalId: string;
  providerId: string;
  providerName: string;
  applicationMethod: "native" | "autofill" | "external";
  canonicalUrl: string;
  originalUrl: string;
  title: string;
  normalizedTitle: string;
  company: string;
  companyDomain: string;
  countryCode: string;
  country: string;
  city: string;
  locationText: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  seniority: "Entry" | "Mid" | "Senior" | "Lead";
  salary?: Salary;
  description: string;
  responsibilities: string[];
  requirements: JobRequirement[];
  requiredSkills: string[];
  preferredSkills: string[];
  languages: string[];
  visaSponsorship: boolean | null;
  workAuthorization?: string;
  publishedAt: string;
  expiresAt?: string;
  sourceLanguage: string;
  active: boolean;
  fictional: boolean;
};

export type MatchResult = {
  job: Job;
  score: number;
  band: MatchBand;
  eligible: boolean;
  explanation: string;
  matchedSkills: string[];
  gaps: string[];
  breakdown: Record<string, number>;
  /** Straight-line distance from the candidate's place, when both sides could be located. */
  distanceKm?: number;
  searchRegion?: "nearby" | "north-italy" | "home-country" | "europe";
};

export type AtsReport = {
  label: "NextJOB ATS readiness estimate";
  overallScore: number;
  requiredKeywordCoverage: number;
  preferredKeywordCoverage: number;
  formattingScore: number;
  factualIntegrityScore: number;
  warnings: string[];
  disclaimer: string;
};

export type GeneratedApplication = {
  jobId: string;
  generatedAt: string;
  model: string;
  promptVersion: string;
  validationResult: "passed" | "flagged";
  summary: string;
  cvBullets: Array<{ text: string; sourceFactIds: string[]; supported: boolean }>;
  coverLetter: string;
  email: { subject: string; body: string };
  interview: {
    likelyQuestions: string[];
    gapQuestions: string[];
    starPrompts: string[];
    questionsToAsk: string[];
    researchChecklist: string[];
  };
  ats: AtsReport;
};

export interface JobProvider {
  id: string;
  name: string;
  countriesSupported: string[];
  languagesSupported: string[];
  searchJobs(query: { keywords?: string[]; countries?: string[]; location?: string; radiusKm?: number; regional?: boolean; cursor?: string }): Promise<Job[]>;
  fetchJobDetails(externalId: string): Promise<Job | null>;
  healthCheck(): Promise<{ status: "healthy" | "degraded" | "offline"; latencyMs: number; checkedAt: string }>;
}
