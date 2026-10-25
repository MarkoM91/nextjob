/** Interface languages. CV facts and employer text never pass through this catalog. */
export const LANGUAGES = [
  { code: "en", name: "English" }, { code: "it", name: "Italiano" },
  { code: "fr", name: "Français" }, { code: "de", name: "Deutsch" },
  { code: "es", name: "Español" }, { code: "pt", name: "Português" },
  { code: "nl", name: "Nederlands" }, { code: "pl", name: "Polski" },
] as const;
export type Locale = typeof LANGUAGES[number]["code"];
export const LANGUAGE_COOKIE = "nextjob_language";
export const isLocale = (value: unknown): value is Locale => typeof value === "string" && LANGUAGES.some(language => language.code === value);
const COUNTRY_LANGUAGES: Record<string, readonly Locale[]> = {
  IT: ["it"], SM: ["it"], VA: ["it"], FR: ["fr"], MC: ["fr"],
  DE: ["de"], AT: ["de"], LI: ["de"], ES: ["es"], PT: ["pt"], BR: ["pt"],
  NL: ["nl"], PL: ["pl"], GB: ["en"], IE: ["en"], US: ["en"], AU: ["en"], NZ: ["en"],
  CH: ["de", "fr", "it"], BE: ["nl", "fr", "de"], LU: ["fr", "de"], CA: ["en", "fr"],
  MX: ["es"], AR: ["es"], CL: ["es"], CO: ["es"], PE: ["es"], EC: ["es"], UY: ["es"],
  BO: ["es"], CR: ["es"], PA: ["es"], DO: ["es"], GT: ["es"], HN: ["es"], SV: ["es"], NI: ["es"], VE: ["es"],
  AO: ["pt"], MZ: ["pt"], CV: ["pt"], GW: ["pt"], ST: ["pt"],
  SN: ["fr"], CI: ["fr"], CM: ["fr", "en"], CD: ["fr"], CG: ["fr"], GA: ["fr"],
};
export function preferredLanguages(value = ""): Locale[] {
  return value.split(",").map((part, index) => {
    const [tag, ...parameters] = part.trim().split(";");
    const q = parameters.find(parameter => parameter.trim().startsWith("q="));
    return { locale: tag.toLowerCase().split("-")[0], quality: q ? Number(q.trim().slice(2)) : 1, index };
  }).filter(item => isLocale(item.locale) && Number.isFinite(item.quality) && item.quality > 0 && item.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index).map(item => item.locale as Locale);
}
export function resolveLocale(input: { preference?: string | null; country?: string | null; acceptLanguage?: string | null }) {
  const country = /^[A-Za-z]{2}$/.test(input.country ?? "") ? input.country!.toUpperCase() : null;
  if (isLocale(input.preference)) return { locale: input.preference, country, source: "manual" as const };
  const preferred = preferredLanguages(input.acceptLanguage ?? "");
  const choices = country ? COUNTRY_LANGUAGES[country] : undefined;
  if (choices) return { locale: preferred.find(locale => choices.includes(locale)) ?? choices[0], country, source: "country" as const };
  return { locale: preferred[0] ?? "en", country, source: preferred.length ? "device" as const : "fallback" as const };
}
export function languagePreference(cookieHeader = ""): Locale | "auto" {
  const raw = cookieHeader.split(";").map(value => value.trim()).find(value => value.startsWith(`${LANGUAGE_COOKIE}=`))?.slice(LANGUAGE_COOKIE.length + 1);
  return isLocale(raw) ? raw : "auto";
}
