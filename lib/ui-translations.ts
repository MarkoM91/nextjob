import it from "./locales/it.json" with { type: "json" };
import fr from "./locales/fr.json" with { type: "json" };
import de from "./locales/de.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import pt from "./locales/pt.json" with { type: "json" };
import nl from "./locales/nl.json" with { type: "json" };
import pl from "./locales/pl.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };
import type { Locale } from "./i18n";

export const catalogs: Record<Locale, Record<string, string>> = { en, it, fr, de, es, pt, nl, pl };
export function translate(locale: Locale, text: string, values?: Readonly<Record<string, unknown>>): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const translated = Object.hasOwn(catalogs[locale], trimmed) ? catalogs[locale][trimmed] : trimmed;
  const result = translated.replace(/\{(\d+)\}/g, (token, name: string) => values && Object.hasOwn(values, name) ? String(values[name] ?? "") : token);
  return `${text.match(/^\s*/)?.[0] ?? ""}${result}${text.match(/\s*$/)?.[0] ?? ""}`;
}
