"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Globe2 } from "lucide-react";
import { isLocale, LANGUAGES, LANGUAGE_COOKIE, resolveLocale, type Locale } from "../../lib/i18n";
import { translate } from "../../lib/ui-translations";
type Preference = Locale | "auto";
type LanguageState = { locale: Locale; country: string | null; preference: Preference; setPreference: (value: Preference) => void; t: (text: string, values?: Readonly<Record<string, unknown>>) => string };
const LanguageContext = createContext<LanguageState | null>(null);
export function LanguageProvider({ initialLocale, initialCountry, initialPreference, children }: { initialLocale: Locale; initialCountry: string | null; initialPreference: Preference; children: React.ReactNode }) {
  const [locale, setLocale] = useState(initialLocale);
  const [country, setCountry] = useState(initialCountry);
  const [preference, updatePreference] = useState(initialPreference);
  const preferenceRef = useRef(initialPreference);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    const controller = new AbortController();
    // Country can be available on the request even when SSR did not receive its header.
    void fetch("/api/locale", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const result = await response.json() as { country?: unknown };
      if (controller.signal.aborted) return;
      const detectedCountry = typeof result.country === "string" && /^[A-Z]{2}$/.test(result.country) ? result.country : initialCountry;
      setCountry(detectedCountry);
      // A late automatic response must never overwrite a manual choice.
      if (preferenceRef.current === "auto") setLocale(resolveLocale({ country: detectedCountry, acceptLanguage: navigator.languages.join(",") }).locale);
    }).catch(() => { /* Keep the server/device selection when offline. */ });
    return () => controller.abort();
  }, []);
  const value = useMemo<LanguageState>(() => ({ locale, country, preference,
    setPreference: next => {
      if (next !== "auto" && !isLocale(next)) return;
      preferenceRef.current = next; updatePreference(next);
      document.cookie = `${LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      setLocale(next === "auto" ? resolveLocale({ country, acceptLanguage: navigator.languages.join(",") }).locale : next);
    },
    t: (text, values) => translate(locale, text, values),
  }), [locale, country, preference]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider is required");
  return context;
}
export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, preference, setPreference, t } = useI18n();
  return <label className={`language-selector ${compact ? "compact" : ""}`}><Globe2 aria-hidden="true" /><span className="sr-only">{t("Language")}</span><select aria-label={t("Language")} value={preference} onChange={event => setPreference(event.target.value as Preference)}>
    <option value="auto">{compact ? `${locale.toUpperCase()} · ${t("Auto")}` : `${t("Automatic")} · ${LANGUAGES.find(language => language.code === locale)?.name}`}</option>
    {LANGUAGES.map(language => <option key={language.code} value={language.code} lang={language.code}>{language.name}</option>)}
  </select></label>;
}
export function LanguageSettings() {
  const { t } = useI18n();
  return <section className="panel language-settings"><h2>{t("Language")}</h2><p>{t("The interface follows your country automatically. Choose a language to keep it when you travel.")}</p><LanguageSelector /><p className="muted">{t("CV content and employer listings keep their original language.")}</p></section>;
}
