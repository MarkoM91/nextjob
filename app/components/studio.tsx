"use client";
import { DownloadPrice } from "./billing-context";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Download, ExternalLink, FileText, Heart, Mail, MessageCircle, Palette, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CandidateProfile, GeneratedApplication, MatchResult } from "../../lib/domain";
import { REACTIVE_RESUME_TEMPLATES, type ReactiveResumeData } from "../../lib/reactive-resume";
import { createDemoApplication } from "../../lib/engine";
import { prepareDesignedResume } from "../../lib/cv-tailoring";
import { CvPdfPreview } from "./cv-pdf-preview";
import { CvDesignPreview } from "./cv-design-preview";
import { CV_ACCENTS, CV_DESIGNS, designKey, parseDesignKey, type CvDesignId } from "./cv-design-catalog";

type GeneratedPackage = { application: GeneratedApplication; tailoredResume: ReactiveResumeData | null; generationProvider: string; documentsProvider: string; writerModel?: string; warnings?: string[]; tone?: string; template?: string; templates?: readonly string[]; reused?: boolean; profileChanged?: boolean };
const templateLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
type Tone = "Professional" | "Direct" | "Warm" | "Concise";
import { aggregatorName } from "../../lib/job-source";
import { AppContent, ApplicationMethodBadge, applicationMethodCopy, LiveJobState, PageIntro, ResumeLines, SourceNotice, splitResumeLines, useLiveMatch } from "./shared";
import { StoredProfileState, useStoredCvProfile, type StoredCvProfile } from "./stored-profile";

type ReactiveExperienceItem = { id?: string; company?: string; position?: string; location?: string; period?: string; description?: string; roles?: Array<{ id?: string; position?: string; period?: string; description?: string }> };

function isReactiveExperience(value: CandidateProfile["experiences"][number] | ReactiveExperienceItem): value is ReactiveExperienceItem { return !("bullets" in value); }

export function Generating({ jobId }: { jobId?: string }) {
  const { match, loading, error, profileRequired } = useLiveMatch(jobId);
  if (!match) return <LiveJobState loading={loading} error={error} profileRequired={profileRequired} />;
  return <GeneratingView match={match} />;
}

function GeneratingView({ match }: { match: MatchResult }) {
  const router = useRouter();
  const [generationError, setGenerationError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void fetch("/api/applications/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, tone: "Professional" }) }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { error?: string; generationProvider?: string };
      if (!response.ok) throw new Error(payload.error ?? "Your tailored CV could not be generated.");
      if (!active) return;
      const provider = payload.generationProvider === "reactive-resume" ? "reactive-resume" : "nextjob";
      window.setTimeout(() => router.push(`/workspace?job=${match.job.id}&provider=${provider}`), 350);
    }).catch((error) => { if (active) setGenerationError(error instanceof Error ? error.message : "Your tailored CV could not be generated."); });
    return () => { active = false; };
  }, [match.job.id, retryAttempt, router]);
  return <AppContent narrow><section className="generation-card"><h1>Preparing your documents</h1><p>{match.job.title} · {match.job.company}</p>{!generationError && <div role="status"><span className="active"><RefreshCw /> Preparing your CV from your reviewed profile…</span><p>You can review the complete CV and choose a design before downloading.</p></div>}{generationError && <div className="generation-error"><p className="form-error" role="alert">{generationError}</p><div className="generation-error-actions"><button className="button" onClick={() => { setGenerationError(""); setRetryAttempt((current) => current + 1); }}>Try again</button><Link className="secondary-action" href={`/job?job=${match.job.id}`}>Back to job</Link></div></div>}</section></AppContent>;
}

export function Studio({ jobId, generationProvider }: { jobId?: string; generationProvider?: string }) {
  const { match, loading, error, profileRequired } = useLiveMatch(jobId);
  const storedCv = useStoredCvProfile();
  if (storedCv.loading || !storedCv.profile) return <StoredProfileState loading={storedCv.loading} error={storedCv.error} />;
  if (!match) return <LiveJobState loading={loading} error={error} profileRequired={profileRequired} />;
  return <StudioView key={match.job.id} match={match} generationProvider={generationProvider} storedCv={storedCv.profile} />;
}

function StudioView({ match, generationProvider, storedCv }: { match: MatchResult; generationProvider?: string; storedCv: StoredCvProfile }) {
  const router = useRouter();
  const cvProfile = storedCv.profile;
  const resumeContent = storedCv.resume;
  const [preferredTemplate, setPreferredTemplate] = useState<string | null>(storedCv.preferredTemplate);
  // The generated package is the source of truth; the template only stands in while it loads or is missing.
  const [pkg, setPkg] = useState<GeneratedPackage | null>(null);
  const [pkgState, setPkgState] = useState<"loading" | "ready" | "missing">("loading");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState("");
  const [summary, setSummary] = useState("");
  useEffect(() => {
    let active = true;
    void fetch(`/api/applications/generate?job=${encodeURIComponent(match.job.id)}`, { headers: { accept: "application/json" } }).then(async (response) => {
      const payload = await response.json().catch(() => null) as GeneratedPackage | null;
      if (!active) return;
      if (response.ok && payload?.application) { setPkg(payload); setPkgState("ready"); } else setPkgState("missing");
    }).catch(() => { if (active) setPkgState("missing"); });
    return () => { active = false; };
  }, [match.job.id]);
  const regenerate = async (tone: Tone) => {
    if (regenerating) return;
    setRegenerating(true); setRegenerateError("");
    const response = await fetch("/api/applications/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, tone, regenerate: true }) }).catch(() => null);
    const payload = await response?.json().catch(() => null) as (GeneratedPackage & { error?: string }) | null;
    if (!response?.ok || !payload?.application) setRegenerateError(payload?.error ?? "The documents could not be regenerated.");
    else { autoApplied.current = false; setTemplate(payload.template ?? ""); setPkg(payload); setPkgState("ready"); setSummary(""); }
    setRegenerating(false);
  };
  const templateApplication = useMemo(() => createDemoApplication(cvProfile, match.job), [cvProfile, match.job]);
  const application = pkg?.application ?? templateApplication;
  const resume = pkg?.tailoredResume ?? resumeContent;
  const tailoredCv = Boolean(pkg?.tailoredResume);
  const writtenByAi = pkg?.documentsProvider === "ai-writer";
  // The saved design controls both the NextJOB layout preview and PDF export.
  const [template, setTemplate] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [previewRevision, setPreviewRevision] = useState(0);
  const currentTemplate = template || pkg?.template || pkg?.tailoredResume?.metadata?.template || "";
  const templates = pkg?.templates ?? REACTIVE_RESUME_TEMPLATES;
  const changeTemplate = async (next: string) => {
    if (templateBusy || !next || next === currentTemplate) return;
    setTemplateBusy(true); setTemplateError("");
    const response = await fetch("/api/applications/template", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, template: next }) }).catch(() => null);
    const payload = await response?.json().catch(() => null) as { template?: string; error?: string } | null;
    if (!response?.ok || !payload?.template) setTemplateError(payload?.error ?? "The CV design could not be changed.");
    else { setTemplate(payload.template); setPreferredTemplate(payload.template); setPreviewRevision((current) => current + 1); setPkg((current) => current ? { ...current, template: payload.template } : current); }
    setTemplateBusy(false);
  };
  // NextJOB's own designs are rendered here in the browser, previewed from the blob, and stored so downloads match.
  const nextjobDesign = parseDesignKey(currentTemplate);
  const accentHex = nextjobDesign?.accent ?? CV_ACCENTS[0].hex;
  const applyDesign = async (design: CvDesignId, accent: string) => {
    if (templateBusy) return;
    setTemplateBusy(true); setTemplateError("");
    try {
      const { renderCvPdf } = await import("./cv-designs");
      const designed = prepareDesignedResume(resumeContent ?? resume ?? {}, cvProfile, match.job, summary || application.summary);
      const blob = await renderCvPdf({ profile: cvProfile, resume: designed.content, summary: designed.summary, design, accent });
      const key = designKey(design, accent);
      const form = new FormData();
      form.set("pdf", blob, "cv.pdf"); form.set("summary", designed.summary);
      const response = await fetch(`/api/documents/cv?job=${encodeURIComponent(match.job.id)}&design=${encodeURIComponent(key)}`, { method: "POST", body: form });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "The CV design could not be saved.");
      setTemplate(key);
      setPreferredTemplate(key);
      setSummary("");
      setPreviewRevision((current) => current + 1);
      setPkg((current) => current ? { ...current, template: key, tailoredResume: designed.content, application: { ...current.application, summary: designed.summary } } : current);
    } catch (error) { setTemplateError(error instanceof Error ? error.message : "The CV design could not be rendered."); }
    setTemplateBusy(false);
  };
  const saveSummary = async () => {
    if (templateBusy || !summary.trim()) return;
    if (nextjobDesign) { await applyDesign(nextjobDesign.design, nextjobDesign.accent); return; }
    setTemplateBusy(true); setTemplateError("");
    try {
      const response = await fetch("/api/applications/summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, summary }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your summary could not be saved.");
      setPkg(current => current ? { ...current, application: { ...current.application, summary }, tailoredResume: current.tailoredResume ? { ...current.tailoredResume, summary: { content: summary } } : null } : current);
      setPreviewRevision(current => current + 1);
    } catch (reason) { setTemplateError(reason instanceof Error ? reason.message : "Your summary could not be saved."); }
    setTemplateBusy(false);
  };
  const onDesignChange = (value: string) => { const parsed = parseDesignKey(value); if (parsed) void applyDesign(parsed.design, parsed.accent); else void changeTemplate(value); };
  // A design chosen earlier is applied to a freshly generated CV once, so every application looks the same.
  const autoApplied = useRef(false);
  useEffect(() => {
    if (autoApplied.current || pkgState !== "ready" || !tailoredCv) return;
    const preferred = parseDesignKey(preferredTemplate) ?? (pkg?.generationProvider === "nextjob-template" ? { design: "professional" as const, accent: "a8c9c4" } : null);
    if (!preferred) return;
    if (pkg?.template === preferredTemplate) { autoApplied.current = true; return; }
    autoApplied.current = true;
    const timer = window.setTimeout(() => { void applyDesign(preferred.design, preferred.accent); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkgState, tailoredCv, preferredTemplate, pkg?.application.generatedAt]);
  const method = applicationMethodCopy(match.job);
  const [tab, setTab] = useState<"cv" | "cover" | "email" | "interview">("cv");
  const [showSubmit, setShowSubmit] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [externalOpened, setExternalOpened] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submitNativeApplication = async () => {
    if (!confirmed || submitting) return;
    setSubmitting(true); setSubmitError("");
    const response = await fetch("/api/applications/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, action: "native", confirmed: true }) }).catch(() => null);
    if (!response?.ok) { const body = await response?.json().catch(() => null) as { error?: string } | null; setSubmitError(body?.error ?? "Submission could not be confirmed."); setSubmitting(false); return; }
    setSubmitted(true); setSubmitting(false); setShowSubmit(false);
    router.replace(`/matches?application=verified&job=${encodeURIComponent(match.job.id)}`);
  };
  const openedEmployerForm = () => {
    setExternalOpened(true); setSubmitError("");
    void fetch("/api/applications/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, action: "opened" }) }).catch(() => undefined);
  };
  const recordSelfReportedApplication = async () => {
    if (submitting) return;
    setSubmitting(true); setSubmitError("");
    const response = await fetch("/api/applications/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, action: "self_reported", confirmed: true }) }).catch(() => null);
    if (!response?.ok) { const body = await response?.json().catch(() => null) as { error?: string } | null; setSubmitError(body?.error ?? "Application activity could not be recorded."); setSubmitting(false); return; }
    router.replace(`/matches?application=reported&job=${encodeURIComponent(match.job.id)}`);
  };
  const applyAction = (mobile = false) => match.job.applicationMethod === "native"
    ? <button className={`button ${mobile ? "" : "button-small"}`} disabled={submitted} onClick={() => setShowSubmit(true)}>{submitted ? <><CheckCircle2 /> Submitted</> : <>{method.action} <ArrowRight /></>}</button>
    : match.job.originalUrl
      ? <a className={`button ${mobile ? "" : "button-small"}`} href={match.job.originalUrl} target="_blank" rel="noreferrer" onClick={openedEmployerForm}>{method.action} <ExternalLink /></a>
      : <span className={`secondary-action ${mobile ? "" : "button-small"}`}>Apply where you found this job</span>;
  const cvContent = nextjobDesign ? <><CvDesignPreview profile={cvProfile} resume={resume} summary={summary || application.summary} design={nextjobDesign.design} accent={nextjobDesign.accent} /><details className="cv-summary-editor"><summary>Edit professional summary</summary><textarea aria-label="Professional summary" value={summary || application.summary} onChange={(event) => setSummary(event.target.value)} /><button className="secondary-action" disabled={templateBusy} onClick={() => void applyDesign(nextjobDesign.design, nextjobDesign.accent)}>{templateBusy ? "Saving…" : "Save summary"}</button></details></> : <><section className="document-paper"><div className="document-name"><h2>{cvProfile.fullName}</h2><p>{resume?.basics?.headline || cvProfile.currentRole}</p><span>{[cvProfile.location, cvProfile.email, cvProfile.phone].filter(Boolean).join(" · ")}</span>{(resume?.sections?.profiles?.items ?? []).map((profile) => <small key={profile.id ?? `${profile.network}-${profile.username}`}>{[profile.network, profile.username, profile.website].filter(Boolean).join(" · ")}</small>)}</div><DocumentSection title="Professional Summary"><textarea aria-label="Professional summary" value={summary || application.summary} onChange={(event) => setSummary(event.target.value)} /><button className="secondary-action" disabled={templateBusy || !summary.trim()} onClick={() => void saveSummary()}>{templateBusy ? "Saving…" : "Save summary to CV"}</button><p className="source-chip"><ShieldCheck /> {tailoredCv ? "Prepared for this posting from your verified CV" : "Built from your verified profile"}</p></DocumentSection><DocumentSection title="Work Experience">{(resume?.sections?.experience?.items?.length ? resume.sections.experience.items : cvProfile.experiences).map((experience, index) => isReactiveExperience(experience) ? <article className="cv-entry" key={experience.id ?? `experience-${index}`}><h4>{experience.position || "Role"}</h4><p className="document-meta">{[experience.company, experience.location, experience.period].filter(Boolean).join(" · ")}</p><ResumeLines value={experience.description} />{experience.roles?.map((role, roleIndex) => <div className="cv-nested-role" key={role.id ?? `role-${roleIndex}`}><h5>{role.position || "Role"}</h5><p className="document-meta">{role.period}</p><ResumeLines value={role.description} /></div>)}</article> : <article className="cv-entry" key={experience.id}><h4>{experience.role}</h4><p className="document-meta">{[experience.company, [experience.startDate, experience.endDate ?? "Present"].filter(Boolean).join(" — ")].filter(Boolean).join(" · ")}</p><ul>{experience.bullets.flatMap((bullet) => splitResumeLines(bullet.text)).map((line, lineIndex) => <li key={`${experience.id}-${lineIndex}`}>{line}</li>)}</ul></article>)}</DocumentSection><DocumentSection title="Skills"><div className="cv-skill-groups">{(resume?.sections?.skills?.items ?? []).length ? resume!.sections!.skills!.items!.map((skill) => <p key={skill.id ?? skill.name}><strong>{skill.name}</strong>{skill.proficiency ? ` · ${skill.proficiency}` : ""}{skill.keywords?.length ? ` · ${skill.keywords.join(" · ")}` : ""}</p>) : <p>{cvProfile.skills.join(" · ")}</p>}</div></DocumentSection><DocumentSection title="Education">{(resume?.sections?.education?.items ?? []).length ? resume!.sections!.education!.items!.map((item, index) => <article className="cv-entry" key={item.id ?? `education-${index}`}><h4>{[item.degree, item.area].filter(Boolean).join(" — ") || "Education"}</h4><p className="document-meta">{[item.school, item.location, item.period].filter(Boolean).join(" · ")}</p><ResumeLines value={item.description} /></article>) : cvProfile.education.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</DocumentSection>{(resume?.sections?.certifications?.items ?? []).length > 0 && <DocumentSection title="Certifications">{resume!.sections!.certifications!.items!.map((item, index) => <article className="cv-entry" key={item.id ?? `certification-${index}`}><h4>{item.title}</h4><p className="document-meta">{[item.issuer, item.date].filter(Boolean).join(" · ")}</p><ResumeLines value={item.description} /></article>)}</DocumentSection>}{(resume?.sections?.projects?.items ?? []).length > 0 && <DocumentSection title="Projects">{resume!.sections!.projects!.items!.map((item, index) => <article className="cv-entry" key={item.id ?? `project-${index}`}><h4>{item.name}</h4><p className="document-meta">{item.period}</p><ResumeLines value={item.description} /></article>)}</DocumentSection>}{cvProfile.languages.length > 0 && <DocumentSection title="Languages"><p>{cvProfile.languages.join(" · ")}</p></DocumentSection>}</section></>;
  return <div className="studio-shell"><header className="studio-top"><Link href={`/job?job=${match.job.id}`} className="back-link"><ArrowLeft /> Back to job</Link><div><span>Application for</span><strong>{match.job.title} · {match.job.company}</strong></div><div className="studio-quick-actions"><a className="secondary-action" href={pkg?.profileChanged ? `/generating?job=${match.job.id}` : `/api/documents/pdf?job=${match.job.id}`}><Download /> Download CV · <DownloadPrice /></a>{applyAction()}</div></header><div className="studio-ready"><div><ApplicationMethodBadge job={match.job} /><span><CheckCircle2 /><strong>{submitted ? "Application submitted" : "Ready for your review"}</strong><small>{submitted ? "Submission confirmed" : "Your documents use only verified information"}</small></span></div></div><div className="studio-body"><aside className="studio-nav"><p className="nav-label">Your application</p><button className={tab === "cv" ? "active" : ""} onClick={() => setTab("cv")}><FileText /> CV <CheckCircle2 /></button><button className={tab === "cover" ? "active" : ""} onClick={() => setTab("cover")}><Heart /> Cover letter <CheckCircle2 /></button><button className={tab === "email" ? "active" : ""} onClick={() => setTab("email")}><Mail /> Email <CheckCircle2 /></button><button className={tab === "interview" ? "active" : ""} onClick={() => setTab("interview")}><MessageCircle /> Interview prep <CheckCircle2 /></button><div className="truth-card"><ShieldCheck /><strong>Based on your profile</strong><p>Review every document before applying.</p><Link href="/profile">Review profile</Link></div></aside><main className="editor-main">{pkg?.profileChanged && <div className="profile-change-notice" role="status"><strong>Your profile has changed.</strong><p>Update this CV before downloading or applying.</p><button className="button" disabled={regenerating} onClick={() => void regenerate("Professional")}>{regenerating ? "Updating your CV…" : "Update CV with my corrections"}</button>{regenerateError && <p className="form-error" role="alert">{regenerateError}</p>}</div>}
    {tab === "cv" && <><div className="editor-head"><div><p className="kicker">Your complete CV</p><h1>Your tailored CV</h1><p>{tailoredCv ? "Relevant experience is emphasized for this posting. Review the text and design before applying." : pkgState === "loading" ? "Loading your tailored CV…" : "This is your base CV. Create the application to get a version tailored to this posting."}</p></div>{tailoredCv && <div className="cv-toolbar"><label className={`chip-select ${currentTemplate ? "active" : ""}`}><Palette /><span>{templateBusy ? "Applying design…" : nextjobDesign ? `Design: ${CV_DESIGNS.find((design) => design.id === nextjobDesign.design)?.label ?? nextjobDesign.design}` : `Design: ${currentTemplate ? `${templateLabel(currentTemplate)} (Reactive Resume)` : "default"}`}</span><select aria-label="CV design" value={currentTemplate} disabled={templateBusy} onChange={(event) => onDesignChange(event.target.value)}>{!currentTemplate && <option value="">Default</option>}<optgroup label="NextJOB designs">{CV_DESIGNS.map((design) => <option key={design.id} value={designKey(design.id, accentHex)}>{design.label}</option>)}</optgroup><optgroup label="Reactive Resume templates">{templates.map((name) => <option key={name} value={name}>{templateLabel(name)}</option>)}</optgroup></select><ChevronDown /></label>{nextjobDesign && <span className="accent-swatches" role="group" aria-label="Accent colour">{CV_ACCENTS.map((accent) => <button key={accent.id} type="button" className={`accent-swatch ${accent.hex === accentHex ? "active" : ""}`} style={{ background: `#${accent.hex}` }} aria-label={`${accent.label} accent`} aria-pressed={accent.hex === accentHex} disabled={templateBusy} onClick={() => void applyDesign(nextjobDesign.design, accent.hex)} />)}</span>}<span className="source-chip">Free design preview</span></div>}</div>{templateError && <p className="form-error" role="alert">{templateError}</p>}<div className="editor-layout editor-layout-simple">{tailoredCv ? <CvPdfPreview jobId={match.job.id} design={currentTemplate} revision={`${application.generatedAt}-${previewRevision}`} fallback={cvContent} /> : cvContent}</div></>}
    {tab === "cover" && <DocumentEditor key={application.coverLetter} title="Cover letter" kicker={`${writtenByAi ? "Written from the job posting" : "NextJOB template"} · ${pkg?.tone ?? "Professional"}`} content={application.coverLetter} tone={(pkg?.tone as Tone | undefined) ?? "Professional"} onTone={regenerate} busy={regenerating} error={regenerateError} />}
    {tab === "email" && <EmailEditor key={application.email.body} subject={application.email.subject} body={application.email.body} />}
    {tab === "interview" && <InterviewEditor key={application.generatedAt} application={application} />}
  </main></div><div className="studio-mobile-action"><a className="secondary-action" href={pkg?.profileChanged ? `/generating?job=${match.job.id}` : `/api/documents/pdf?job=${match.job.id}`}><Download /> CV · <DownloadPrice /></a>{applyAction(true)}</div><div className="document-provider-notes"><SourceNotice job={match.job} />{(pkg ? pkg.generationProvider === "reactive-resume" : generationProvider === "reactive-resume") && <div className="document-provider-note"><ShieldCheck /> {writtenByAi ? "CV, cover letter, email and interview notes prepared from your verified record and this posting. Review everything before applying." : "PDF prepared from your verified CV and this job description. Review it before applying."}</div>}{pkgState === "missing" && <div className="document-provider-note warning"><ShieldCheck /> No tailored application exists for this job yet — you are viewing a template. <Link href={`/generating?job=${match.job.id}`}>Create the tailored application</Link></div>}{pkg?.warnings?.length ? <div className="document-provider-note warning"><ShieldCheck /> {pkg.warnings.join(" ")}</div> : null}</div>{showSubmit && <div className="submit-overlay"><section className="submit-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title"><button className="submit-close" onClick={() => setShowSubmit(false)} aria-label="Close submission confirmation"><X /></button><ApplicationMethodBadge job={match.job} /><h2 id="submit-title">Submit this application?</h2><p>NextJOB will send your reviewed profile, tailored CV, cover letter and answers to {match.job.company} through its authorized {match.job.providerName} connection.</p><div className="submit-summary"><span><FileText /><strong>Tailored CV</strong>Attached</span><span><Heart /><strong>Cover letter</strong>Attached</span><span><ShieldCheck /><strong>Factual check</strong>Passed</span></div><label className="submit-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I reviewed this application</strong><small>Submit only the information shown in this workspace.</small></span></label>{submitError && <p className="form-error" role="alert">{submitError}</p>}<div className="submit-actions"><button className="secondary-action" onClick={() => setShowSubmit(false)}>Cancel</button><button className="button" disabled={!confirmed || submitting} onClick={submitNativeApplication}>{submitting ? "Submitting…" : "Submit application"}</button></div><small className="submit-demo-note">Verified submission is enabled only for employers that authorize NextJOB and return a receipt.</small></section></div>}{externalOpened && <div className="submit-overlay"><section className="submit-dialog" role="dialog" aria-modal="true" aria-labelledby="external-submit-title"><button className="submit-close" onClick={() => setExternalOpened(false)} aria-label="Close application status"><X /></button><ApplicationMethodBadge job={match.job} /><h2 id="external-submit-title">Did you submit on the employer site?</h2><p>The official form opened in a new tab. NextJOB cannot see whether the employer accepted it, so choose the accurate status.</p><div className="submit-summary"><span><ExternalLink /><strong>Employer form</strong>Opened</span><span><FileText /><strong>Tailored CV</strong>Ready</span><span><ShieldCheck /><strong>Employer receipt</strong>Not received</span></div>{submitError && <p className="form-error" role="alert">{submitError}</p>}<div className="submit-actions"><button className="secondary-action" onClick={() => setExternalOpened(false)}>Not yet</button><button className="button" disabled={submitting} onClick={recordSelfReportedApplication}>{submitting ? "Recording…" : "Yes, I submitted"}</button></div><small className="submit-demo-note">This status is user-reported until an employer or ATS confirms it.</small></section></div>}</div>;
}

function DocumentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="document-section"><h3>{title}</h3>{children}</section>;
}

function DocumentEditor({ title, kicker, content, tone, onTone, busy, error }: { title: string; kicker: string; content: string; tone: Tone; onTone: (tone: Tone) => void; busy: boolean; error: string }) {
  const [text, setText] = useState(content);
  return <><div className="editor-head"><div><p className="kicker">{kicker}</p><h1>{title}</h1><p>Edit freely, or pick another tone to rewrite it from the job posting.</p></div><div className="tone-select">Tone <select value={tone} disabled={busy} aria-label="Tone" onChange={(event) => onTone(event.target.value as Tone)}><option>Professional</option><option>Direct</option><option>Warm</option><option>Concise</option></select></div></div>{error && <p className="form-error" role="alert">{error}</p>}<section className="letter-paper"><textarea value={text} onChange={(event) => setText(event.target.value)} aria-label={title} disabled={busy} /><div className="document-footer"><span>{text.trim().split(/\s+/).length} words</span><span><ShieldCheck /> Claims grounded</span><button type="button" onClick={() => setText(content)}><RefreshCw /> {busy ? "Rewriting…" : "Restore generated"}</button></div></section></>;
}

function EmailEditor({ subject, body }: { subject: string; body: string }) {
  return <><div className="editor-head"><div><p className="kicker">Concise · Ready to edit</p><h1>Application email</h1><p>A short note to send with your tailored documents.</p></div></div><section className="email-paper"><label>Subject<input defaultValue={subject} /></label><label>Message<textarea defaultValue={body} /></label><div className="attachment-reminder"><FileText /><div><strong>Before sending</strong><p>Attach the tailored CV and cover letter from your package.</p></div></div></section></>;
}

function InterviewEditor({ application }: { application: ReturnType<typeof createDemoApplication> }) {
  return <><div className="editor-head"><div><p className="kicker">Job-specific preparation</p><h1>Walk in with a clear story.</h1><p>Prompts use your verified experience. They never fabricate answers.</p></div></div><div className="prep-grid"><PrepList number="01" title="Likely questions" items={application.interview.likelyQuestions} /><PrepList number="02" title="Address possible gaps" items={application.interview.gapQuestions} /><PrepList number="03" title="STAR story prompts" items={application.interview.starPrompts} /><PrepList number="04" title="Questions to ask" items={application.interview.questionsToAsk} /></div></>;
}

function PrepList({ number, title, items }: { number: string; title: string; items: string[] }) {
  return <section className="prep-list"><span>{number}</span><h2>{title}</h2>{items.map((item) => <p key={item}>{item}</p>)}</section>;
}

export function PackageScreen({ jobId }: { jobId?: string }) {
  const { match, loading, error, profileRequired } = useLiveMatch(jobId);
  if (!match) return <LiveJobState loading={loading} error={error} profileRequired={profileRequired} />;
  return <PackageView match={match} />;
}

function PackageView({ match }: { match: MatchResult }) {
  return <AppContent narrow><Link href={`/workspace?job=${match.job.id}`} className="back-link"><ArrowLeft /> Back to review</Link><PageIntro eyebrow="Download & apply" title="Your application is ready" subtitle={`${match.job.title} · ${match.job.company}`} /><div className="package-layout"><section className="panel package-list"><PackageItem icon={FileText} title="Tailored CV" note="Grounded in your verified profile" formats={["PDF", "DOCX", "TXT"]} jobId={match.job.id} doc="cv" /><PackageItem icon={Heart} title="Cover letter" note="Written for this posting · edit before sending" formats={["PDF", "DOCX", "TXT"]} jobId={match.job.id} doc="cover-letter" /><PackageItem icon={Mail} title="Application email" note="Subject and concise message" formats={["TXT"]} jobId={match.job.id} doc="email" /><PackageItem icon={MessageCircle} title="Interview preparation" note="Questions, gap prompts and STAR stories" formats={["PDF", "TXT"]} jobId={match.job.id} doc="interview" /></section><aside className="manual-apply"><p className="kicker">Final step</p><h2>Continue to the employer</h2><ol><li>Download the documents you need.</li><li>Open the official application form.</li><li>Return to the review screen to record the accurate status.</li></ol><a className="button" href={match.job.originalUrl} target="_blank" rel="noreferrer">{aggregatorName(match.job) ? `Open via ${aggregatorName(match.job)}` : "Open employer form"} <ExternalLink /></a><SourceNotice job={match.job} /><small>Opening the form is not a submission. NextJOB records “applied” only after you confirm it.</small></aside></div></AppContent>;
}

function PackageItem({ icon: Icon, title, note, formats, jobId, doc }: { icon: LucideIcon; title: string; note: string; formats: string[]; jobId: string; doc: string }) {
  return <article className="package-item"><div className="package-icon"><Icon /></div><div><h2>{title}</h2><p>{note}{doc === "cv" && <> · <DownloadPrice /> to download</>}</p><span><ShieldCheck /> Factual validation passed</span></div><div className="format-actions">{formats.map((format) => <a key={format} href={`/api/documents/${format.toLowerCase()}?job=${encodeURIComponent(jobId)}&doc=${doc}`}>{format}<Download /></a>)}</div></article>;
}

