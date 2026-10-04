import type { CandidateProfile } from "./domain";

/**
 * Title relevance for the live feed. Deterministic and explainable: a job is only
 * shown when its title genuinely belongs to the candidate's occupation, so a broad
 * aggregator cannot flood the feed with same-word-different-job listings.
 */

/** Words that appear across unrelated occupations and mean nothing on their own. */
const AMBIGUOUS_TERMS = new Set([
  "support", "service", "services", "desk", "front", "back", "end", "analyst", "manager",
  "operations", "assistant", "specialist", "consultant", "engineer", "advisor", "agent",
  "technician", "tecnico", "supporto", "assistenza", "developer", "coordinator", "officer",
]);

/** Signals that a title really sits in IT / workplace technology. */
const IT_DOMAIN_SIGNAL = /\b(?:it|ict|i\.t\.?|helpdesk|help[\s-]*desk|service[\s-]*desk|desktop|workplace|euc|end[\s-]user|deskside|system|systems|sysadmin|network|networking|infrastructure|technical|technology|informatica|informatico|sistemi|sistemista|hardware|software|cloud|microsoft|windows|server|security|data|web|application|applications)\b/i;

/** Occupations that share vocabulary with IT but are a different job entirely. */
const COMPETING_DOMAIN = /\b(?:sales|market|marketing|commercial|retail|store|account executive|business development|recruit\w*|talent acquisition|hr|human resources|payroll|finance|financial|accounting|legal|procurement|logistics|warehouse|driver|nurse|nursing|medical|clinical|teacher|tutor|chef|kitchen|cleaner|security guard|construction|real estate|customer success|revenue|hospitality|travel|insurance|banking|laborator\w*|research (?:&|and) development|r&d|mechanical|electrical|chemical|production|manufacturing)\b/i;

/** Postings that are not a specific vacancy. */
const NOT_A_VACANCY = /don't see what|general application|talent pool|future opportunities|open application|speculative application|spontaneous application|candidatura spontanea/i;

/** Product-engineering roles a support profile should not be pushed into. */
const SOFTWARE_ENGINEERING = /\b(?:software|devops|platform|backend|back[\s-]end|frontend|front[\s-]end|full[\s-]?stack|mobile|ios|android|data)\b[^,|]*\b(?:engineer|engineering|developer|architect)\b/i;

/** Titles that are the IT-support occupation even when they share no word with the profile. */
const IT_SUPPORT_FAMILY = /\b(?:help[\s-]*desk|service[\s-]*desk|desktop[\s-]*support|deskside|it[\s-]*support|technical support|support (?:technician|specialist|engineer|analyst)|systems?[\s-]*administrat\w*|sysadmin|it (?:technician|specialist|administrator|operations)|tecnico (?:it|informatico|hardware|hw)|supporto (?:it|tecnico|informatico)|assistenza (?:it|tecnica|informatica)|sistemista|informatico)\b/i;

const TITLE_STOP_WORDS = new Set([
  "senior", "junior", "lead", "principal", "staff", "the", "and", "for", "with", "con", "delle", "della", "degli", "presso",
]);

/** Occupation evidence outranks incidental words such as clients or support. */
export function experienceRoleAlignment(role: string, target: string): number {
  const terms = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const roleTerms = new Set(terms(role));
  const specific = terms(target).filter(term => !TITLE_STOP_WORDS.has(term) && !AMBIGUOUS_TERMS.has(term) && (term.length >= 3 || term === "it"));
  const overlap = specific.filter(term => roleTerms.has(term)).length;
  if (IT_SUPPORT_FAMILY.test(target)) {
    if (IT_SUPPORT_FAMILY.test(role)) return 100 + overlap * 20;
    if (IT_DOMAIN_SIGNAL.test(role) && !COMPETING_DOMAIN.test(role)) return 40 + overlap * 10;
    return 0;
  }
  return overlap * 40;
}

export function profileTitleTerms(profile: CandidateProfile): string[] {
  return [...new Set([...profile.targetTitles, profile.currentRole]
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9+#.]+/))
    .filter((term) => term.length >= 4 && !TITLE_STOP_WORDS.has(term)))];
}

function inItSupportFamily(profile: CandidateProfile): boolean {
  return IT_SUPPORT_FAMILY.test([profile.currentRole, ...profile.targetTitles].join(" | "));
}

export function searchKeywords(profile: CandidateProfile): string[] {
  const simplifiedTitles = profile.targetTitles.map((title) => title.replace(/\b(?:junior|senior|lead|specialist|associate|manager|coordinator)\b/gi, " ").replace(/\s+/g, " ").trim());
  const supportAliases = inItSupportFamily(profile)
    ? ["IT support", "technical support", "service desk", "help desk", "desktop support", "IT technician", "supporto IT", "assistenza tecnica"]
    : [];
  const roleTerms = profileTitleTerms(profile).filter((term) => !AMBIGUOUS_TERMS.has(term));
  return [...new Set([...profile.targetTitles, ...simplifiedTitles, profile.currentRole, ...supportAliases, ...roleTerms, ...profile.skills.slice(0, 10)].filter(Boolean))].slice(0, 30);
}

export function isRelevantRoleTitle(title: string, profile: CandidateProfile): boolean {
  if (NOT_A_VACANCY.test(title)) return false;
  if (SOFTWARE_ENGINEERING.test(title)) return false;

  const targetTerms = profileTitleTerms(profile);
  // A profile with no usable title terms must not blank the whole feed.
  if (!targetTerms.length) return true;

  const normalizedTitle = title.toLowerCase();
  const matched = targetTerms.filter((term) => normalizedTitle.includes(term));
  const itSignal = IT_DOMAIN_SIGNAL.test(title);
  const competing = COMPETING_DOMAIN.test(title);

  // Same occupation, different words: "Service Desk Analyst" never says "IT Support".
  if (inItSupportFamily(profile) && IT_SUPPORT_FAMILY.test(title)) return !competing;
  if (!matched.length) return false;
  // "Sales and Market Support" shares only a generic word with "IT Support Specialist".
  // An ambiguous-only match needs real IT context, and it always loses to a named
  // competing occupation ("Sales Support ... Digital Automotive" is a sales job).
  if (matched.every((term) => AMBIGUOUS_TERMS.has(term)) && (!itSignal || competing)) return false;
  // Another occupation named outright wins unless the title is explicitly IT.
  return !competing || itSignal;
}
