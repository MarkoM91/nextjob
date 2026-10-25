import type { MatchResult } from "./domain";
import type { Locale } from "./i18n";
import { translate } from "./ui-translations";

/** Only NextJOB's explanation is localized; job descriptions and skill names stay factual. */
export function matchExplanation(match: MatchResult, locale: Locale): string {
  const t = (key: string, values?: Record<string, unknown>) => translate(locale, key, values);
  if (!match.eligible) return t(match.explanation);
  if (!match.job.requiredSkills.length) return t("Ranked on title, seniority, and location fit because the employer listing does not state requirements NextJOB can verify. Review the original description before applying.");
  return `${t("Identified skills in your CV: {0} of {1}.", {0: match.matchedSkills.length, 1: match.job.requiredSkills.length})}${match.matchedSkills.length ? ` ${match.matchedSkills.slice(0, 3).join(", ")}.` : ""} ${match.gaps.length ? t("Check {0}; it is not confirmed in your profile.", {0: match.gaps[0]}) : t("Review the full requirements before applying.")}`;
}
export function reviewNote(note: string, locale: Locale): string {
  const language = note.match(/^(German|French|Spanish) is mentioned in the listing and is not in your profile\. Check the required level\.$/);
  return language ? translate(locale, "{0} is mentioned in the listing and is not in your profile. Check the required level.", {0: translate(locale, language[1])}) : translate(locale, note);
}
