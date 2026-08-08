import type { CandidateProfile, Job, Salary, SalaryPeriod, Workplace } from "./domain";

const annualFactor: Record<SalaryPeriod, number> = { HOUR: 2080, MONTH: 12, YEAR: 1 };
const eurRate: Record<string, number> = { EUR: 1, GBP: 1.16, USD: 0.92, CAD: 0.67, CHF: 1.04, SEK: 0.088, PLN: 0.23, SGD: 0.68 };

function salary(min: number, max: number, currency: string, period: SalaryPeriod = "YEAR"): Salary {
  const factor = annualFactor[period];
  const rate = eurRate[currency] ?? 1;
  return {
    originalAmountMin: min,
    originalAmountMax: max,
    originalCurrency: currency,
    originalPeriod: period,
    normalizedAnnualMin: Math.round(min * factor * rate),
    normalizedAnnualMax: Math.round(max * factor * rate),
    normalizedCurrency: "EUR",
    estimated: currency !== "EUR",
  };
}

export const candidate: CandidateProfile = {
  id: "candidate-demo-anna",
  fullName: "Anna Bianchi",
  email: "anna.bianchi@example.test",
  phone: "+39 000 000 0000",
  location: "Milan, Italy",
  currentRole: "Customer Operations Specialist",
  yearsOfExperience: 6,
  targetTitles: ["Customer Success Specialist", "Customer Operations Analyst", "Support Quality Lead"],
  skills: ["Customer support", "Salesforce", "Zendesk", "Process improvement", "Data analysis", "CRM", "Team training"],
  languages: ["Italian", "English", "Spanish"],
  education: ["BSc Business Administration — University of Bologna"],
  workAuthorizations: ["Italy", "European Union"],
  preferences: {
    countries: ["Italy", "Spain", "Portugal", "Germany", "Netherlands", "Ireland"],
    workplace: ["Remote", "Hybrid"],
    relocation: false,
    visaSponsorshipRequired: false,
    minimumAnnualSalaryEur: 34000,
  },
  experiences: [
    {
      id: "exp-1",
      company: "Lighthouse Services (fictional)",
      role: "Customer Operations Specialist",
      startDate: "2022-03",
      bullets: [
        { id: "fact-workflows", text: "Improved customer-support workflows in Salesforce and Zendesk across a multilingual service team." },
        { id: "fact-feedback", text: "Turned recurring customer feedback into practical process improvements with product and operations colleagues." },
        { id: "fact-training", text: "Created guidance and trained colleagues to deliver clearer, more consistent customer experiences." },
      ],
    },
    {
      id: "exp-2",
      company: "Harborline Retail (fictional)",
      role: "Customer Support Coordinator",
      startDate: "2019-08",
      endDate: "2022-02",
      bullets: [{ id: "fact-support", text: "Resolved complex customer cases and maintained accurate CRM records for an international customer base." }],
    },
  ],
  facts: [
    { id: "profile-role", label: "Current role", value: "Customer Operations Specialist", sourceText: "Customer Operations Specialist — Mar 2022 to present", confidence: 0.99, verifiedByUser: true },
    { id: "profile-salesforce", label: "Skill", value: "Salesforce", sourceText: "Managed workflows and customer records in Salesforce", confidence: 0.97, verifiedByUser: true },
    { id: "profile-zendesk", label: "Skill", value: "Zendesk", sourceText: "Zendesk ticketing and knowledge-base administration", confidence: 0.95, verifiedByUser: true },
    { id: "profile-language", label: "Language", value: "English — fluent", sourceText: "English: fluent", confidence: 0.99, verifiedByUser: true },
  ],
};

type Seed = {
  title: string; company: string; countryCode: string; country: string; city: string; workplace: Workplace;
  skills: string[]; preferred?: string[]; salary?: Salary; language?: string; visa?: boolean | null; seniority?: Job["seniority"];
  provider?: string; expired?: boolean; authorization?: string; description?: string;
};

const seeds: Seed[] = [
  { title: "Customer Success Specialist", company: "Northstar Loom", countryCode: "IT", country: "Italy", city: "Milan", workplace: "Hybrid", skills: ["Customer support", "Salesforce", "Process improvement"], preferred: ["SaaS onboarding"], salary: salary(38000, 45000, "EUR"), visa: false, provider: "Direct ATS" },
  { title: "Customer Operations Analyst", company: "Forma Harbor", countryCode: "IT", country: "Italy", city: "Remote", workplace: "Remote", skills: ["Data analysis", "CRM", "Process improvement"], preferred: ["SQL", "Looker"], salary: salary(40000, 48000, "EUR"), provider: "Atlas Jobs API" },
  { title: "Client Experience Manager", company: "Morrow Atelier", countryCode: "IT", country: "Italy", city: "Milan", workplace: "On-site", skills: ["Customer support", "Team training"], preferred: ["Luxury retail"], salary: salary(42000, 50000, "EUR"), seniority: "Senior", provider: "Direct ATS" },
  { title: "Support Quality Lead", company: "Kiteframe Systems", countryCode: "IE", country: "Ireland", city: "Dublin", workplace: "Remote", skills: ["Zendesk", "Team training", "Process improvement"], preferred: ["QA scorecards"], salary: salary(47000, 56000, "EUR"), seniority: "Lead", provider: "EURES demo feed" },
  { title: "CRM Coordinator", company: "Juniper Healthworks", countryCode: "IT", country: "Italy", city: "Turin", workplace: "Hybrid", skills: ["Salesforce", "CRM"], preferred: ["HubSpot", "Marketing automation"], salary: salary(34000, 39000, "EUR"), provider: "Civic Careers Feed" },
  { title: "Implementation Associate", company: "Aster Fieldwork", countryCode: "PT", country: "Portugal", city: "Lisbon", workplace: "Remote", skills: ["Customer support", "CRM"], preferred: ["API concepts", "Project delivery"], salary: salary(33000, 41000, "EUR"), provider: "Direct ATS" },
  { title: "Customer Support Team Lead", company: "Clover Ledger", countryCode: "ES", country: "Spain", city: "Barcelona", workplace: "Hybrid", skills: ["Zendesk", "Team training"], preferred: ["People management"], salary: salary(39000, 46000, "EUR"), seniority: "Lead", provider: "Atlas Jobs API" },
  { title: "Business Operations Associate", company: "Luma Household", countryCode: "DE", country: "Germany", city: "Berlin", workplace: "On-site", skills: ["Process improvement", "Data analysis"], preferred: ["Financial modelling", "SQL"], salary: salary(45000, 52000, "EUR"), provider: "Open Roles XML" },
  { title: "Partner Support Specialist", company: "Olive Route", countryCode: "NL", country: "Netherlands", city: "Amsterdam", workplace: "Remote", skills: ["Customer support", "Zendesk", "English"], preferred: ["German"], salary: salary(43000, 51000, "EUR"), provider: "Direct ATS" },
  { title: "Office Operations Manager", company: "Studio Cima Verde", countryCode: "IT", country: "Italy", city: "Milan", workplace: "On-site", skills: ["Process improvement"], preferred: ["Facilities management", "Vendor contracts"], salary: salary(32000, 38000, "EUR"), provider: "Civic Careers Feed" },
  { title: "Customer Success Advisor", company: "Fjord & Finch", countryCode: "GB", country: "United Kingdom", city: "Manchester", workplace: "Hybrid", skills: ["Customer support", "CRM", "English"], preferred: ["SaaS onboarding"], salary: salary(36000, 43000, "GBP"), visa: true, provider: "Public Jobs JSON" },
  { title: "Service Operations Coordinator", company: "Maple Current", countryCode: "CA", country: "Canada", city: "Toronto", workplace: "Remote", skills: ["Customer support", "Data analysis"], preferred: ["Workforce planning"], salary: salary(62000, 75000, "CAD"), visa: false, authorization: "Canada", provider: "Open Roles XML" },
  { title: "Customer Insights Associate", company: "Mesa Grove", countryCode: "US", country: "United States", city: "Austin", workplace: "Hybrid", skills: ["Data analysis", "Salesforce"], preferred: ["SQL"], salary: salary(65000, 79000, "USD"), visa: false, authorization: "United States", provider: "Direct ATS" },
  { title: "Customer Journey Specialist", company: "Sundial Works", countryCode: "ES", country: "Spain", city: "Madrid", workplace: "Hybrid", skills: ["Customer support", "Process improvement", "Spanish"], preferred: ["Miro"], salary: salary(36000, 43000, "EUR"), provider: "EURES demo feed" },
  { title: "Service Excellence Analyst", company: "Alpine Thread", countryCode: "CH", country: "Switzerland", city: "Zurich", workplace: "On-site", skills: ["Data analysis", "Process improvement", "English"], preferred: ["German"], salary: salary(78000, 90000, "CHF"), visa: false, authorization: "Switzerland", provider: "Direct ATS" },
  { title: "Customer Enablement Associate", company: "Baltic Bloom", countryCode: "SE", country: "Sweden", city: "Stockholm", workplace: "Remote", skills: ["Customer support", "Team training", "English"], preferred: ["SaaS onboarding"], salary: salary(480000, 570000, "SEK"), provider: "Public Jobs JSON" },
  { title: "Support Operations Specialist", company: "Vistula Craft", countryCode: "PL", country: "Poland", city: "Warsaw", workplace: "Remote", skills: ["Zendesk", "CRM", "Data analysis"], preferred: ["SQL"], salary: salary(150000, 185000, "PLN"), provider: "Open Roles XML" },
  { title: "Client Onboarding Coordinator", company: "Meridian Orchard", countryCode: "PT", country: "Portugal", city: "Porto", workplace: "Hybrid", skills: ["Customer support", "CRM"], preferred: ["Project delivery"], salary: salary(32000, 39000, "EUR"), provider: "Atlas Jobs API" },
  { title: "Customer Care Associate", company: "Terra Signal", countryCode: "IT", country: "Italy", city: "Florence", workplace: "On-site", skills: ["Customer support", "CRM"], salary: salary(28000, 31000, "EUR"), expired: true, provider: "Direct ATS" },
  { title: "Customer Success Specialist", company: "Northstar Loom", countryCode: "IT", country: "Italy", city: "Milan", workplace: "Hybrid", skills: ["Customer support", "Salesforce", "Process improvement"], preferred: ["SaaS onboarding"], salary: salary(38000, 45000, "EUR"), visa: false, provider: "Atlas Jobs API" },
  { title: "APAC Support Analyst", company: "Orchid Metric", countryCode: "SG", country: "Singapore", city: "Singapore", workplace: "Hybrid", skills: ["Customer support", "Data analysis", "English"], preferred: ["Mandarin"], salary: salary(72000, 88000, "SGD"), authorization: "Singapore", visa: false, provider: "Public Jobs JSON" },
  { title: "Customer Success Manager", company: "Rivermark Cloud", countryCode: "DE", country: "Germany", city: "Munich", workplace: "Hybrid", skills: ["Customer support", "Salesforce", "English"], preferred: ["German", "SaaS onboarding"], salary: salary(58000, 69000, "EUR"), seniority: "Senior", provider: "Direct ATS" },
  { title: "Knowledge Base Specialist", company: "Paper Kite Labs", countryCode: "NL", country: "Netherlands", city: "Utrecht", workplace: "Remote", skills: ["Zendesk", "Customer support", "Team training"], preferred: ["Technical writing"], salary: salary(42000, 50000, "EUR"), provider: "EURES demo feed" },
  { title: "Support Enablement Coordinator", company: "Copper Fern", countryCode: "IE", country: "Ireland", city: "Cork", workplace: "Hybrid", skills: ["Team training", "Process improvement", "English"], preferred: ["Learning design"], salary: salary(41000, 48000, "EUR"), provider: "Direct ATS" },
  { title: "Customer Data Coordinator", company: "Ember Path", countryCode: "FR", country: "France", city: "Lyon", workplace: "Hybrid", skills: ["CRM", "Data analysis"], preferred: ["French", "SQL"], salary: salary(36000, 44000, "EUR"), provider: "Open Roles XML" },
  { title: "CX Programme Associate", company: "Quiet Harbor", countryCode: "GB", country: "United Kingdom", city: "London", workplace: "Remote", skills: ["Customer support", "Process improvement", "Data analysis"], preferred: ["Programme management"], salary: salary(39000, 47000, "GBP"), provider: "Atlas Jobs API" },
  { title: "Customer Education Specialist", company: "Solaris Grove", countryCode: "ES", country: "Spain", city: "Valencia", workplace: "Remote", skills: ["Team training", "Customer support", "Spanish"], preferred: ["Video production"], salary: salary(35000, 42000, "EUR"), provider: "Public Jobs JSON" },
  { title: "Support Systems Administrator", company: "Willow Stack", countryCode: "US", country: "United States", city: "Remote", workplace: "Remote", skills: ["Zendesk", "Salesforce", "Data analysis"], preferred: ["APIs", "SQL"], salary: salary(76000, 94000, "USD"), authorization: "United States", visa: false, provider: "Direct ATS" },
  { title: "Customer Operations Partner", company: "Linen Compass", countryCode: "DK", country: "Denmark", city: "Copenhagen", workplace: "Hybrid", skills: ["Customer support", "Process improvement", "English"], preferred: ["Danish"], salary: salary(490000, 580000, "SEK"), provider: "EURES demo feed" },
  { title: "Customer Service Director", company: "Granite Circle", countryCode: "IT", country: "Italy", city: "Rome", workplace: "On-site", skills: ["Customer support", "Team training"], preferred: ["Budget ownership", "People management"], salary: salary(70000, 85000, "EUR"), seniority: "Lead", provider: "Direct ATS" },
];

export const jobs: Job[] = seeds.map((seed, index) => {
  const id = `job-${String(index + 1).padStart(2, "0")}`;
  const published = new Date(Date.UTC(2026, 7, Math.max(1, 5 - (index % 12))));
  return {
    id,
    externalId: `${seed.provider?.toLowerCase().replace(/\W+/g, "-")}-${index + 1000}`,
    providerId: (seed.provider ?? "Demo feed").toLowerCase().replace(/\W+/g, "-"),
    providerName: seed.provider ?? "Demo feed",
    canonicalUrl: `https://example.test/jobs/${id}`,
    originalUrl: `https://example.test/${seed.company.toLowerCase().replace(/\W+/g, "-")}/${id}`,
    title: seed.title,
    normalizedTitle: seed.title.toLowerCase(),
    company: `${seed.company} (fictional)`,
    companyDomain: `${seed.company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example.test`,
    countryCode: seed.countryCode,
    country: seed.country,
    city: seed.city,
    locationText: seed.city === "Remote" ? `Remote — ${seed.country}` : `${seed.city}, ${seed.country}`,
    workplace: seed.workplace,
    employmentType: "Full-time",
    seniority: seed.seniority ?? "Mid",
    salary: seed.salary,
    description: seed.description ?? `Join a fictional international team to improve customer journeys, resolve meaningful problems, and build clear, repeatable service operations. This demo vacancy is designed to show RoleRadar's matching and application workflow.`,
    responsibilities: ["Own customer questions from first contact to resolution", "Turn service insights into practical process improvements", "Collaborate with product and operations colleagues"],
    requirements: seed.skills.map((value) => ({ value, kind: value === "English" || value === "Spanish" ? "language" : "skill", mandatory: true, confidence: 0.96, evidence: `${value} is listed in the required experience section.` })),
    requiredSkills: seed.skills,
    preferredSkills: seed.preferred ?? [],
    languages: [seed.language ?? "English"],
    visaSponsorship: seed.visa ?? null,
    workAuthorization: seed.authorization,
    publishedAt: published.toISOString(),
    expiresAt: seed.expired ? "2026-07-20T00:00:00.000Z" : "2026-09-30T00:00:00.000Z",
    sourceLanguage: "en",
    active: !seed.expired,
    fictional: true,
  };
});

export const demoDocument = {
  originalSummary: "Customer operations specialist experienced in support workflows, CRM administration, and team training.",
  tailoredSummary: "Customer operations specialist with six years of verified experience improving support workflows and customer outcomes. Experienced with Salesforce and Zendesk, cross-functional problem-solving, and turning recurring feedback into practical service improvements.",
};
