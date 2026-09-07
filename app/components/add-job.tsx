"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardPaste, Link2, ShieldCheck, Trash2 } from "lucide-react";
import type { Job } from "../../lib/domain";
import { AppContent, PageIntro, relativeDate } from "./shared";

type ImportResponse = { job?: Job; error?: string; code?: string };

/** Brings a job the candidate found elsewhere into the feed: from its link, or from pasted text when the site forbids fetching. */
export function AddJob() {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "paste">("link");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<Job[]>([]);
  useEffect(() => {
    let active = true;
    void fetch("/api/jobs/import", { headers: { accept: "application/json" } }).then((response) => response.ok ? response.json() : { jobs: [] }).then((payload: { jobs?: Job[] }) => { if (active) setImported(payload.jobs ?? []); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const submit = async (body: Record<string, string>) => {
    if (busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/jobs/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = await response?.json().catch(() => null) as ImportResponse | null;
    if (response?.ok && payload?.job) { router.push(`/job?job=${encodeURIComponent(payload.job.id)}`); return; }
    setBusy(false);
    setError(payload?.error ?? "The job could not be added.");
    // A site that refuses crawlers still lets the candidate paste what they can read.
    if (payload?.code === "SITE_FORBIDS_FETCH" || payload?.code === "NO_JOB_CONTENT" || payload?.code === "ROBOTS_UNAVAILABLE") setMode("paste");
  };
  const remove = async (jobId: string) => {
    setImported((current) => current.filter((job) => job.id !== jobId));
    await fetch(`/api/jobs/import?job=${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => undefined);
  };
  return <AppContent narrow>
    <Link href="/matches" className="back-link"><ArrowLeft /> Back to jobs</Link>
    <PageIntro eyebrow="Your own leads" title="Add a job you found" subtitle="Paste a link from any job site or the text of the ad. NextJOB reads it, matches it against your verified CV and prepares the application like any other job." />
    <div className="feed-tabs"><button className={mode === "link" ? "active" : ""} onClick={() => setMode("link")}><Link2 /> From a link</button><button className={mode === "paste" ? "active" : ""} onClick={() => setMode("paste")}><ClipboardPaste /> Paste the text</button></div>
    {mode === "link" ? <form className="panel add-job-form" onSubmit={(event) => { event.preventDefault(); void submit({ url }); }}>
      <label className="field-label">Job link<input type="url" required placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      <p className="hint"><ShieldCheck /> NextJOB fetches the page once, respecting the site&apos;s robots.txt. Sites that forbid automated reading (Indeed, LinkedIn) will ask you to paste the text instead.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy || !url.trim()}>{busy ? "Reading the job…" : "Add this job"} <ArrowRight /></button>
    </form> : <form className="panel add-job-form" onSubmit={(event) => { event.preventDefault(); void submit({ title, company, location, description, sourceUrl: url }); }}>
      <div className="add-job-grid">
        <label className="field-label">Job title<input required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Agente immobiliare" /></label>
        <label className="field-label">Company<input maxLength={140} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Employer name" /></label>
        <label className="field-label">Location<input maxLength={240} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Milano" /></label>
        <label className="field-label">Link (optional)<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
      </div>
      <label className="field-label">Job description<textarea required minLength={120} rows={12} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Paste the full ad: responsibilities, requirements, conditions." /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy || !title.trim() || description.trim().length < 120}>{busy ? "Adding…" : "Add this job"} <ArrowRight /></button>
    </form>}
    {imported.length > 0 && <section className="panel added-jobs"><h2>Jobs you added</h2>{imported.map((job) => <div key={job.id}><Link href={`/job?job=${encodeURIComponent(job.id)}`}><strong>{job.title}</strong><span>{job.company} · {job.locationText} · added {relativeDate(job.publishedAt).toLowerCase()}</span></Link><button type="button" aria-label={`Remove ${job.title}`} onClick={() => void remove(job.id)}><Trash2 /></button></div>)}</section>}
  </AppContent>;
}
