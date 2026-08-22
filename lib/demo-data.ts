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
  id: "candidate-qa-marko",
  fullName: "Marko Medic",
  email: "marko.medic@example.test",
  phone: "+39 *** *** ****",
  location: "Milan, Italy",
  currentRole: "IT Support Specialist",
  yearsOfExperience: 4.5,
  targetTitles: ["IT Support Specialist", "Help Desk Specialist", "Workplace Support Technician"],
  skills: ["IT support", "Windows 11", "Microsoft 365", "Google Workspace", "Hardware troubleshooting", "Software troubleshooting", "Networking", "TCP/IP", "DNS", "DHCP", "VPN", "PowerShell", "HTML", "CSS", "JavaScript", "SQL"],
  languages: ["Italian", "English"],
  education: ["Technical and vocational education in information technology"],
  workAuthorizations: ["Italy", "European Union"],
  preferences: {
    countries: ["Italy", "Spain", "Portugal", "Germany", "Netherlands", "Ireland", "France", "Poland", "Romania", "Switzerland"],
    workplace: ["Remote", "Hybrid", "On-site"],
    relocation: false,
    visaSponsorshipRequired: false,
    minimumAnnualSalaryEur: 30000,
  },
  experiences: [
    {
      id: "exp-1",
      company: "Affaritaliani.it",
      role: "IT Support Specialist",
      startDate: "2021-11",
      endDate: "2026-05",
      bullets: [
        { id: "fact-support", text: "Provided day-to-day IT support for users, devices, software, email, connectivity, and workplace technology." },
        { id: "fact-troubleshooting", text: "Diagnosed and resolved Windows, Microsoft 365, Google Workspace, hardware, and network issues." },
        { id: "fact-web", text: "Supported web and data tasks using HTML, CSS, JavaScript, and SQL." },
      ],
    },
    {
      id: "exp-2",
      company: "BRI Srl",
      role: "IT Technician",
      startDate: "2021-05",
      endDate: "2021-10",
      bullets: [{ id: "fact-technician", text: "Installed, configured, and troubleshot computers, peripherals, operating systems, and local network connections." }],
    },
  ],
  facts: [
    { id: "profile-role", label: "Recent role", value: "IT Support Specialist", sourceText: "IT support and systems troubleshooting", confidence: 0.99, verifiedByUser: true },
    { id: "profile-m365", label: "Skill", value: "Microsoft 365", sourceText: "Microsoft 365 and workplace software support", confidence: 0.97, verifiedByUser: true },
    { id: "profile-networking", label: "Skill", value: "Networking", sourceText: "TCP/IP, DNS, DHCP and VPN troubleshooting", confidence: 0.96, verifiedByUser: true },
    { id: "profile-language", label: "Language", value: "English", sourceText: "English language", confidence: 0.95, verifiedByUser: true },
  ],
};

type Seed = {
  title: string; company: string; countryCode: string; country: string; city: string; workplace: Workplace;
  skills: string[]; preferred?: string[]; salary?: Salary; language?: string; visa?: boolean | null; seniority?: Job["seniority"];
  provider?: string; expired?: boolean; authorization?: string; description?: string;
};

const seeds: Seed[] = [
  { title: "IT Support Specialist", company: "Northstar IT Services", countryCode: "IT", country: "Italy", city: "Milan", workplace: "Hybrid", skills: ["IT support", "Windows 11", "Microsoft 365", "Networking"], preferred: ["Active Directory", "Intune"], salary: salary(32000, 40000, "EUR"), visa: false, provider: "Direct ATS" },
  { title: "Help Desk Specialist", company: "Forma Systems", countryCode: "IT", country: "Italy", city: "Remote", workplace: "Remote", skills: ["Help desk", "Microsoft 365", "Software troubleshooting"], preferred: ["Ticketing", "ITIL"], salary: salary(30000, 37000, "EUR"), provider: "Atlas Jobs API" },
  { title: "Workplace Support Technician", company: "Morrow Technology", countryCode: "IT", country: "Italy", city: "Milan", workplace: "On-site", skills: ["IT support", "Hardware troubleshooting", "Windows 11"], preferred: ["Device management"], salary: salary(31000, 38000, "EUR"), provider: "Direct ATS" },
  { title: "Technical Support Specialist", company: "Kiteframe Systems", countryCode: "IE", country: "Ireland", city: "Dublin", workplace: "Remote", skills: ["Technical support", "Networking", "DNS", "VPN"], preferred: ["ServiceNow"], salary: salary(39000, 47000, "EUR"), provider: "EURES demo feed" },
  { title: "Junior Systems Support Analyst", company: "Juniper Healthworks", countryCode: "IT", country: "Italy", city: "Turin", workplace: "Hybrid", skills: ["Windows 11", "Microsoft 365", "PowerShell"], preferred: ["Microsoft Entra", "Intune"], salary: salary(30000, 36000, "EUR"), seniority: "Entry", provider: "Civic Careers Feed" },
  { title: "IT Service Desk Analyst", company: "Aster Fieldwork", countryCode: "PT", country: "Portugal", city: "Lisbon", workplace: "Remote", skills: ["Service desk", "Microsoft 365", "User management"], preferred: ["ITIL", "Active Directory"], salary: salary(32000, 39000, "EUR"), provider: "Direct ATS" },
  { title: "Desktop Support Technician", company: "Clover Ledger", countryCode: "ES", country: "Spain", city: "Barcelona", workplace: "Hybrid", skills: ["Hardware troubleshooting", "Software troubleshooting", "Networking"], preferred: ["macOS"], salary: salary(33000, 40000, "EUR"), provider: "Atlas Jobs API" },
  { title: "Microsoft 365 Support Specialist", company: "Luma Technology", countryCode: "DE", country: "Germany", city: "Berlin", workplace: "Remote", skills: ["Microsoft 365", "User management", "PowerShell"], preferred: ["Microsoft Entra"], salary: salary(42000, 50000, "EUR"), provider: "Open Roles XML" },
  { title: "Network Support Technician", company: "Olive Route", countryCode: "NL", country: "Netherlands", city: "Amsterdam", workplace: "Remote", skills: ["Networking", "TCP/IP", "DNS", "DHCP", "VPN"], preferred: ["Endpoint security"], salary: salary(41000, 49000, "EUR"), provider: "Direct ATS" },
  { title: "IT Operations Assistant", company: "Studio Cima Verde", countryCode: "IT", country: "Italy", city: "Milan", workplace: "On-site", skills: ["IT support", "Google Workspace", "Hardware troubleshooting"], preferred: ["Device management"], salary: salary(29000, 35000, "EUR"), provider: "Civic Careers Feed" },
  { title: "Customer Success Advisor", company: "Fjord & Finch", countryCode: "GB", country: "United Kingdom", city: "Manchester", workplace: "Hybrid", skills: ["Customer support", "CRM", "English"], preferred: ["SaaS onboarding"], salary: salary(36000, 43000, "GBP"), visa: true, provider: "Public Jobs JSON" },
  { title: "Service Operations Coordinator", company: "Maple Current", countryCode: "CA", country: "Canada", city: "Toronto", workplace: "Remote", skills: ["Customer support", "Data analysis"], preferred: ["Workforce planning"], salary: salary(62000, 75000, "CAD"), visa: false, authorization: "Canada", provider: "Open Roles XML" },
  { title: "Customer Insights Associate", company: "Mesa Grove", countryCode: "US", country: "United States", city: "Austin", workplace: "Hybrid", skills: ["Data analysis", "Salesforce"], preferred: ["SQL"], salary: salary(65000, 79000, "USD"), visa: false, authorization: "United States", provider: "Direct ATS" },
  { title: "Customer Journey Specialist", company: "Sundial Works", countryCode: "ES", country: "Spain", city: "Madrid", workplace: "Hybrid", skills: ["Customer support", "Process improvement", "Spanish"], preferred: ["Miro"], salary: salary(36000, 43000, "EUR"), provider: "EURES demo feed" },
  { title: "Service Excellence Analyst", company: "Alpine Thread", countryCode: "CH", country: "Switzerland", city: "Zurich", workplace: "On-site", skills: ["Data analysis", "Process improvement", "English"], preferred: ["German"], salary: salary(78000, 90000, "CHF"), visa: false, authorization: "Switzerland", provider: "Direct ATS" },
  { title: "Customer Enablement Associate", company: "Baltic Bloom", countryCode: "SE", country: "Sweden", city: "Stockholm", workplace: "Remote", skills: ["Customer support", "Team training", "English"], preferred: ["SaaS onboarding"], salary: salary(480000, 570000, "SEK"), provider: "Public Jobs JSON" },
  { title: "Support Operations Specialist", company: "Vistula Craft", countryCode: "PL", country: "Poland", city: "Warsaw", workplace: "Remote", skills: ["Zendesk", "CRM", "Data analysis"], preferred: ["SQL"], salary: salary(150000, 185000, "PLN"), provider: "Open Roles XML" },
  { title: "Client Onboarding Coordinator", company: "Meridian Orchard", countryCode: "PT", country: "Portugal", city: "Porto", workplace: "Hybrid", skills: ["Customer support", "CRM"], preferred: ["Project delivery"], salary: salary(32000, 39000, "EUR"), provider: "Atlas Jobs API" },
  { title: "Customer Care Associate", company: "Terra Signal", countryCode: "IT", country: "Italy", city: "Florence", workplace: "On-site", skills: ["Customer support", "CRM"], salary: salary(28000, 31000, "EUR"), expired: true, provider: "Direct ATS" },
  { title: "IT Support Specialist", company: "Northstar IT Services", countryCode: "IT", country: "Italy", city: "Milan", workplace: "Hybrid", skills: ["IT support", "Windows 11", "Microsoft 365", "Networking"], preferred: ["Active Directory", "Intune"], salary: salary(32000, 40000, "EUR"), visa: false, provider: "Atlas Jobs API" },
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
    applicationMethod: seed.provider === "Direct ATS" ? "native" : ["Atlas Jobs API", "Public Jobs JSON"].includes(seed.provider ?? "") ? "autofill" : "external",
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
    description: seed.description ?? `Join a fictional international team to support users, troubleshoot workplace technology, and keep devices, software, and connectivity reliable. This demo vacancy is designed to show NextJOB's matching and application workflow.`,
    responsibilities: ["Resolve user requests from first report to resolution", "Diagnose device, software, access, and connectivity issues", "Document fixes and collaborate with IT colleagues"],
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
  originalSummary: "IT support specialist experienced in workplace technology, troubleshooting, Microsoft 365, and networking.",
  tailoredSummary: "IT support specialist with 4.5 years of verified experience helping users and resolving device, software, access, and connectivity issues. Experienced with Windows 11, Microsoft 365, Google Workspace, and network troubleshooting.",
};
