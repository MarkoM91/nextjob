export const dictionaries = {
  en: {
    brand: "RoleRadar",
    tagline: "Your global job search, brought into focus.",
    landing: {
      eyebrow: "A calmer way to find your next role",
      headline: "Upload your CV. Find jobs worldwide. Apply with confidence.",
      supporting: "RoleRadar analyzes your experience, recommends relevant jobs from multiple sources, and creates an ATS-optimized CV and personalized cover letter for every opportunity.",
      primary: "Upload your CV",
      secondary: "See how it works",
    },
    trust: ["Your CV stays private", "Nothing is submitted automatically", "You approve every document", "Your experience is never invented"],
    nav: { dashboard: "Overview", matches: "Matches", studio: "Application studio", tracker: "Tracker", documents: "Documents" },
  },
} as const;

export type Locale = keyof typeof dictionaries;

export function getDictionary(locale: string) {
  return dictionaries[(locale in dictionaries ? locale : "en") as Locale];
}
