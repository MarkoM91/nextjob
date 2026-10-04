import type { CandidateProfile, Job } from "./domain";
import { sanitizeReactiveResumeData, type ReactiveResumeData } from "./reactive-resume.ts";
import { selectRelevantBullets } from "./engine.ts";
import { experienceRoleAlignment } from "./relevance.ts";

const html = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const list = (lines: string[]) => lines.length ? `<ul>${lines.map((line) => `<li>${html(line)}</li>`).join("")}</ul>` : "";
type Raw = Record<string, any>;

/** Overlay reviewed text without dropping provider fields such as links and visibility. */
export function reviewedResumeData(raw: Raw, reviewed: ReactiveResumeData): Raw {
  const next = structuredClone(raw);
  next.basics = { ...next.basics, ...reviewed.basics };
  next.sections ??= {};
  for (const name of ["experience", "skills", "languages"] as const) {
    const source = reviewed.sections?.[name]?.items;
    if (!source) continue;
    const section = next.sections[name] ?? { title: name, hidden: false, columns: 1 };
    next.sections[name] = { ...section, items: source.map((item) => {
      const original = section.items?.find((old: Raw) => old.id === item.id) ?? {};
      const merged: Raw = { hidden: false, website: { url: "", label: "" }, ...original, ...item };
      if (name === "experience") {
        merged.location ??= "";
        merged.period ??= "";
        merged.description = list((item as { description?: string }).description?.split(/\n+/).filter(Boolean) ?? []);
        merged.roles = ((item as { roles?: Raw[] }).roles ?? []).map((role) => ({ ...role, description: list(role.description?.split(/\n+/).filter(Boolean) ?? []) }));
      } else if (name === "skills") {
        merged.proficiency = (item as { proficiency?: string }).proficiency ?? "";
        merged.level = 0; // A parser or an AI must never invent a visual proficiency rating.
        merged.keywords ??= [];
        merged.icon ??= "";
      } else {
        merged.fluency = (item as { fluency?: string }).fluency ?? "";
        merged.level = 0;
      }
      return merged;
    }) };
  }
  return next;
}

/** Retain the candidate's facts and design; emphasize relevant roles and shorten others. */
export function tailoredResumeData(base: Raw, generated: Raw, profile: CandidateProfile, job: Job, summary: string): Raw {
  const next = structuredClone(generated);
  next.basics = structuredClone(base.basics);
  next.sections = structuredClone(base.sections);
  if (base.customSections) next.customSections = structuredClone(base.customSections);
  const evidence = selectRelevantBullets(profile, job, 1000);
  const rank = new Map<string, number>();
  for (const bullet of evidence) rank.set(bullet.experienceId, Math.max(rank.get(bullet.experienceId) ?? 0, bullet.score));
  const experience = next.sections?.experience;
  if (experience?.items) {
    experience.items = experience.items.map((item: Raw, index: number) => ({ item, index, rank: rank.get(item.id) ?? 0, alignment: experienceRoleAlignment(profile.experiences.find(entry => entry.id === item.id)?.role ?? item.position ?? "", job.title) })).sort((a: Raw, b: Raw) => b.alignment - a.alignment || (a.alignment ? b.rank - a.rank : 0) || a.index - b.index).map(({ item }: Raw) => {
      const source = profile.experiences.find((entry) => entry.id === item.id);
      if (!source || item.roles?.length) return item;
      const bullets = evidence.filter((bullet) => bullet.experienceId === item.id);
      const lines = bullets.flatMap((bullet) => bullet.text.split(/\n+/).map((line) => line.replace(/^\s*[•*-]\s*/, "").trim()).filter(Boolean));
      return { ...item, description: list(lines.slice(0, experienceRoleAlignment(source.role, job.title) > 0 ? 5 : 2)) };
    });
  }
  next.summary = { ...next.summary, content: `<p>${html(summary)}</p>` };
  // Preserve columns, typography and colour while putting experience before education.
  for (const page of next.metadata?.layout?.pages ?? []) for (const column of ["main", "sidebar"]) {
    const sections = page[column];
    if (!Array.isArray(sections)) continue;
    const work = sections.indexOf("experience"), education = sections.indexOf("education");
    if (work > education && education >= 0) { sections.splice(work, 1); sections.splice(education, 0, "experience"); }
  }
  return next;
}

/** Local design changes need no provider call and use the same reviewed facts on both sides. */
export function prepareDesignedResume(base: ReactiveResumeData, profile: CandidateProfile, job: Job, summary: string) {
  const sourceSummary = base.summary?.content?.trim();
  const chosenSummary = sourceSummary && /\byears of verified experience\b/i.test(summary) && experienceRoleAlignment(profile.currentRole, job.title) > 0 ? sourceSummary : summary;
  const reviewed = reviewedResumeData(base, base);
  const content = sanitizeReactiveResumeData(tailoredResumeData(reviewed, reviewed, profile, job, chosenSummary));
  return { content, summary: chosenSummary };
}
