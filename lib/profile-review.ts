import { z } from "zod";
import type { CandidateProfile } from "./domain";
import type { StoredResumeProfile } from "./resume-storage";

const text = (max: number) => z.string().trim().max(max).regex(/^[^\0]*$/);
const experience = z.object({ id: text(100), company: text(180).min(1), role: text(180).min(1), startDate: text(100), endDate: text(100).optional(), bullets: z.array(z.object({ id: text(100), text: text(4000) })).max(30) }).strict();
export const profileUpdateSchema = z.object({
  confirmAll: z.boolean().optional(),
  profile: z.object({ fullName: text(160).min(1), email: text(240), phone: text(80), location: text(240).min(1), currentRole: text(180).min(1), yearsOfExperience: z.number().min(0).max(70), skills: z.array(text(180).min(1)).max(100), languages: z.array(text(120)).max(20), experiences: z.array(experience).max(30), skillLevels: z.record(z.string().max(180), z.enum(["unspecified", "beginner", "intermediate", "advanced"])).optional() }).strict().optional(),
  preferences: z.object({ targetTitles: z.array(text(180).min(1)).min(1).max(12), countries: z.array(text(80)).max(50), workplace: z.array(z.enum(["Remote", "Hybrid", "On-site"])).min(1).max(3), relocation: z.boolean(), visaSponsorshipRequired: z.boolean(), minimumAnnualSalaryEur: z.number().int().min(0).max(1000000) }).strict().optional(),
}).strict().refine((value) => value.confirmAll === true || value.profile || value.preferences, "Supply your profile or preferences");
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Apply only candidate-editable fields; owner IDs and source evidence remain server-owned. */
export function applyProfileUpdate(stored: StoredResumeProfile, update: ProfileUpdate): StoredResumeProfile {
  const next = structuredClone(stored);
  const before = JSON.stringify(next.profile);
  if (update.profile) {
    Object.assign(next.profile, update.profile);
    next.profile.skills = [...new Set(next.profile.skills)];
    next.profile.skillLevels = Object.fromEntries(Object.entries(update.profile.skillLevels ?? {}).filter(([name]) => next.profile.skills.includes(name)));
    const values: Record<string, string> = { Name: next.profile.fullName, "Current role": next.profile.currentRole, Location: next.profile.location, Experience: `${next.profile.yearsOfExperience} years`, Skills: next.profile.skills.slice(0, 12).join(", ") };
    next.profile.facts = next.profile.facts.map((fact) => ({ ...fact, value: values[fact.label] ?? fact.value }));
    next.content.basics = { ...next.content.basics, name: next.profile.fullName, email: next.profile.email, phone: next.profile.phone, location: next.profile.location, headline: next.profile.currentRole };
    next.content.sections ??= {};
    if (JSON.stringify(stored.profile.experiences) !== JSON.stringify(next.profile.experiences)) next.content.sections.experience = { items: next.profile.experiences.map((item) => ({ id: item.id, company: item.company, position: item.role, period: `${item.startDate} - ${item.endDate || "Present"}`, location: stored.content.sections?.experience?.items?.find((old) => old.id === item.id)?.location, description: item.bullets.map((bullet) => bullet.text).join("\n") })) };
    const oldSkills = next.content.sections.skills?.items ?? [];
    // Keep groups and source qualifiers until the candidate actually changes the skill list.
    if (JSON.stringify(stored.profile.skills) !== JSON.stringify(next.profile.skills)) next.content.sections.skills = { items: next.profile.skills.map((name, index) => ({ id: `review-skill-${index}`, name, proficiency: next.profile.skillLevels?.[name] === "unspecified" ? "" : next.profile.skillLevels?.[name], keywords: [] })) };
    else next.content.sections.skills = { items: oldSkills.map((item) => ({ ...item, proficiency: next.profile.skillLevels?.[item.name ?? ""] === "unspecified" ? undefined : next.profile.skillLevels?.[item.name ?? ""] ?? item.proficiency })) };
    if (JSON.stringify(stored.profile.languages) !== JSON.stringify(next.profile.languages)) next.content.sections.languages = { items: next.profile.languages.map((language, index) => ({ id: `review-language-${index}`, language })) };
  }
  if (update.preferences) {
    const { targetTitles, ...preferences } = update.preferences;
    next.profile.targetTitles = targetTitles;
    next.profile.preferences = preferences;
  }
  if (before !== JSON.stringify(next.profile) && update.profile) {
    next.verifiedAt = undefined;
    next.profile.facts = next.profile.facts.map((fact) => ({ ...fact, verifiedByUser: false }));
    next.updatedAt = new Date().toISOString();
  }
  if (update.confirmAll) {
    next.verifiedAt = new Date().toISOString();
    next.profile.facts = next.profile.facts.map((fact) => ({ ...fact, verifiedByUser: true }));
  }
  return next;
}

export function reviewFields(profile: CandidateProfile) {
  const { fullName, email, phone, location, currentRole, yearsOfExperience, skills, languages, experiences, skillLevels } = profile;
  return { fullName, email, phone, location, currentRole, yearsOfExperience, skills: skills.map((skill) => skill.trim()).filter(Boolean), languages: languages.map((language) => language.trim()).filter(Boolean), experiences: experiences.map((item) => ({ ...item, bullets: item.bullets.filter((bullet) => bullet.text.trim()) })), skillLevels: skillLevels ?? {} };
}
