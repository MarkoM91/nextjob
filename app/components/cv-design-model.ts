import type { CandidateProfile } from "../../lib/domain";
import type { ReactiveResumeData } from "../../lib/reactive-resume";
import type { CvDesignId } from "./cv-design-catalog";

export type CvDesignInput = { profile: CandidateProfile; resume: ReactiveResumeData | null; summary: string; design: CvDesignId; accent: string };

export type CvSection = { title: string; entries: Array<{ heading: string; meta: string; lines: string[]; company?: string; period?: string; location?: string }> };
type SkillGroup = { name: string; keywords: string[] };
type Model = { name: string; headline: string; contact: string[]; links: string[]; summary: string; experience: CvSection; education: CvSection; extras: CvSection[]; skills: SkillGroup[]; languages: string[]; labels: { profile: string; skills: string; languages: string; contact: string } };

function lines(value?: string): string[] { return value?.split(/\n+/).map((line) => line.replace(/^\s*[•*-]\s*/, "").trim()).filter(Boolean) ?? []; }

export function buildCvModel(input: CvDesignInput): Model {
  const { profile, resume } = input;
  const experienceItems = resume?.sections?.experience?.items ?? [];
  // Labels follow the CV's language, without translating a candidate's facts.
  const source = [resume?.summary?.content, ...profile.experiences.flatMap(item => item.bullets.map(bullet => bullet.text))].join(" ").toLowerCase();
  const italian = (source.match(/\b(?:della|delle|degli|gestione|supporto|esperienza|attività|manutenzione|dei|nelle|presso)\b/g) ?? []).length >= 3;
  const labels = italian ? { profile: "Profilo", skills: "Competenze", languages: "Lingue", contact: "Contatti" } : { profile: "Profile", skills: "Skills", languages: "Languages", contact: "Contact" };
  const experience: CvSection = {
    title: italian ? "Esperienza lavorativa" : "Experience",
    entries: experienceItems.length
      ? experienceItems.map((item) => ({ heading: item.position || "Role", company: item.company, period: item.period, location: item.location, meta: [item.company, item.location, item.period].filter(Boolean).join(" · "), lines: [...lines(item.description), ...(item.roles ?? []).flatMap((role) => [role.position ? `${role.position}${role.period ? ` (${role.period})` : ""}` : "", ...lines(role.description)])].filter(Boolean) }))
      : profile.experiences.map((item) => ({ heading: item.role, company: item.company, period: [item.startDate, item.endDate ?? (italian ? "In corso" : "Present")].filter(Boolean).join(" — "), meta: [item.company, [item.startDate, item.endDate ?? "Present"].filter(Boolean).join(" — ")].filter(Boolean).join(" · "), lines: item.bullets.flatMap((bullet) => lines(bullet.text)) })),
  };
  const educationItems = resume?.sections?.education?.items ?? [];
  const education: CvSection = {
    title: italian ? "Formazione" : "Education",
    entries: educationItems.length
      ? educationItems.map((item) => ({ heading: [item.degree, item.area].filter(Boolean).join(" — ") || "Education", meta: [item.school, item.location, item.period].filter(Boolean).join(" · "), lines: lines(item.description) }))
      : profile.education.map((item) => ({ heading: item, meta: "", lines: [] })),
  };
  const extras: CvSection[] = [];
  const certifications = resume?.sections?.certifications?.items ?? [];
  if (certifications.length) extras.push({ title: "Certifications", entries: certifications.map((item) => ({ heading: item.title ?? "", meta: [item.issuer, item.date].filter(Boolean).join(" · "), lines: lines(item.description) })) });
  const projects = resume?.sections?.projects?.items ?? [];
  if (projects.length) extras.push({ title: "Projects", entries: projects.map((item) => ({ heading: item.name ?? "", meta: item.period ?? "", lines: lines(item.description) })) });
  const skillItems = resume?.sections?.skills?.items ?? [];
  const skills: SkillGroup[] = skillItems.length ? skillItems.map((item) => ({ name: item.name ?? "", keywords: [item.proficiency, ...(item.keywords ?? [])].filter((value): value is string => Boolean(value)) })).filter((group) => group.name) : [{ name: "Skills", keywords: profile.skills }];
  const languages = (resume?.sections?.languages?.items ?? []).map((item) => [item.language, item.fluency].filter(Boolean).join(" · ")).filter(Boolean);
  return {
    name: resume?.basics?.name || profile.fullName,
    headline: resume?.basics?.headline || profile.currentRole,
    contact: [resume?.basics?.location || profile.location, resume?.basics?.email || profile.email, resume?.basics?.phone || profile.phone].filter(Boolean),
    links: (resume?.sections?.profiles?.items ?? []).map((item) => item.website || [item.network, item.username].filter(Boolean).join(": ")).filter(Boolean),
    summary: input.summary,
    experience, education, extras, skills,
    languages: languages.length ? languages : profile.languages, labels,
  };
}

