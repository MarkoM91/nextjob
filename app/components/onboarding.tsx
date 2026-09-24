"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Check, CheckCircle2, ChevronDown, CircleHelp, FileCheck2, Globe2, Home, MapPin, PencilLine, Radar, ShieldCheck, UploadCloud, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CandidateProfile } from "../../lib/domain";
import { candidate, COUNTRY_SUGGESTIONS, Logo, PanelHead, setTargetCountries, toggleSet, useTargetCountries } from "./shared";

function OnboardingFrame({ step, children }: { step: number; children: React.ReactNode }) {
  return <main className="onboarding"><header><Logo /><Link href="/help">Help</Link></header><div className="onboarding-progress"><span className={step >= 1 ? "active" : ""}>1 <em>Add CV</em></span><i /><span className={step >= 2 ? "active" : ""}>2 <em>Check profile</em></span><i /><span className={step >= 3 ? "active" : ""}>3 <em>Choose jobs</em></span></div>{children}<footer><ShieldCheck /> Private by default. You approve every application.</footer></main>;
}

export function UploadScreen({ stage = "upload" }: { stage?: "upload" | "profile" | "preferences" }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async () => {
    if (!file || !consent || uploading) return;
    setUploading(true); setError("");
    const form = new FormData(); form.set("cv", file); form.set("aiProcessingConsent", "true");
    try {
      const response = await fetch("/api/cv/upload", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
      if (!response.ok) throw new Error(payload.error ?? "We could not upload that file.");
      router.push("/profile-review");
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "We could not upload that file."); setUploading(false); }
  };
  if (stage === "profile") return <ProfileReview />;
  if (stage === "preferences") return <Preferences />;
  return <OnboardingFrame step={1}><div className="upload-layout"><div><p className="eyebrow">Create your verified profile</p><h1>Upload your current CV</h1><p className="onboarding-lead">We&apos;ll extract the work history and skills it contains. You review the record before it is used for matching or documents.</p><div className={`dropzone ${file ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setFile(event.dataTransfer.files?.[0] ?? null); }}><input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{file ? <><FileCheck2 /><strong>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024))} KB · ready to process</span><button type="button" onClick={() => fileInput.current?.click()}>Choose another file</button></> : <><UploadCloud /><strong>Drop your CV here</strong><span>PDF or DOCX · maximum 10 MB</span><button type="button" className="button" onClick={() => fileInput.current?.click()}>Choose file</button></>}</div>{error && <p className="form-error" role="alert">{error}</p>}<label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>I agree to secure document processing</strong><small>Reactive Resume and the configured language model process this file only to extract your profile and prepare applications you request. <Link href="/privacy">Learn more</Link></small></span></label><button disabled={!file || !consent || uploading} className="button full" onClick={() => void upload()}>{uploading ? "Processing your CV…" : "Process CV and continue"}<ArrowRight /></button><p className="upload-privacy">Nothing is matched, written or submitted until you review the extracted record.</p></div></div></OnboardingFrame>;
}

function ProfileReview() {
  const router = useRouter();
  const [profile, setProfile] = useState<CandidateProfile>(candidate);
  const [profileSource, setProfileSource] = useState("nextjob-fallback");
  const [verified, setVerified] = useState(new Set(candidate.facts.filter((fact) => fact.verifiedByUser).map((fact) => fact.id)));
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/cv/profile", { headers: { accept: "application/json" } }).then((response) => response.ok ? response.json() : null).then((payload: { profile?: CandidateProfile; source?: string } | null) => {
      if (!active || !payload?.profile) return;
      setProfile(payload.profile); setProfileSource(payload.source ?? "nextjob-fallback"); setVerified(new Set(payload.profile.facts.filter((fact) => fact.verifiedByUser).map((fact) => fact.id)));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const confirmProfile = async () => {
    if (confirming || verified.size !== profile.facts.length) return;
    if (profileSource !== "reactive-resume") { router.push("/preferences"); return; }
    setConfirming(true); setConfirmError("");
    const response = await fetch("/api/cv/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmAll: true }) }).catch(() => null);
    if (!response?.ok) { const body = await response?.json().catch(() => null) as { error?: string } | null; setConfirmError(body?.error ?? "Your profile could not be confirmed."); setConfirming(false); return; }
    router.push("/preferences");
  };
  return <OnboardingFrame step={2}><div className="review-wrap"><div className="review-heading"><div><p className="eyebrow">Record review</p><h1>Confirm your experience</h1><p>Check each extracted fact. Only approved information is used to tailor applications.</p></div><div className="review-score"><strong>{profileSource === "reactive-resume" ? "CV" : "DEMO"}</strong><span>{profileSource === "reactive-resume" ? "document extraction" : "sample profile"}</span></div></div><section className="review-section"><PanelHead title="Professional profile" subtitle={profileSource === "reactive-resume" ? "Extracted securely from your uploaded CV" : "Sample profile until document processing is configured"} /><div className="fact-list">{profile.facts.map((fact) => <div className="extracted-fact" key={fact.id}><button className={verified.has(fact.id) ? "verified" : ""} onClick={() => setVerified((current) => { const next = new Set(current); if (next.has(fact.id)) next.delete(fact.id); else next.add(fact.id); return next; })}>{verified.has(fact.id) ? <Check /> : <CircleHelp />}</button><div><span>{fact.label}</span><strong>{fact.value}</strong><small>“{fact.sourceText}” · {Math.round(fact.confidence * 100)}% confidence</small></div><button aria-label={`Edit ${fact.label}`}><PencilLine /></button></div>)}</div></section><section className="review-section"><PanelHead title="Skills" subtitle="Choose a level now or leave it unspecified" /><div className="skill-editor">{profile.skills.map((skill, index) => <div key={skill}><span>{skill}</span><select aria-label={`${skill} level`} defaultValue={index < 3 ? "advanced" : "unspecified"}><option value="unspecified">Level not set</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select><CheckCircle2 /></div>)}</div></section>{confirmError && <p className="form-error" role="alert">{confirmError}</p>}<div className="sticky-review"><p><ShieldCheck /> {verified.size} of {profile.facts.length} facts confirmed · confirm each fact before continuing</p><button className="button" disabled={verified.size !== profile.facts.length || confirming} onClick={confirmProfile}>{confirming ? "Saving…" : "Confirm profile"} <ArrowRight /></button></div></div></OnboardingFrame>;
}

function Choice({ icon: Icon, label, selected, onClick }: { icon: LucideIcon; label: string; selected: boolean; onClick: () => void }) {
  return <button className={`choice ${selected ? "selected" : ""}`} onClick={onClick}><Icon /><span>{label}</span>{selected && <CheckCircle2 />}</button>;
}

function TargetLocationsEditor() {
  const countries = useTargetCountries();
  const [draft, setDraft] = useState("");
  const suggestions = COUNTRY_SUGGESTIONS.filter((name) => !countries.includes(name));
  const addCountry = (value: string) => {
    const cleaned = value.trim();
    if (!cleaned) return;
    const canonical = COUNTRY_SUGGESTIONS.find((name) => name.toLowerCase() === cleaned.toLowerCase()) ?? cleaned;
    if (!countries.includes(canonical)) setTargetCountries([...countries, canonical]);
    setDraft("");
  };
  return <>
    <label className="token-input"><Globe2 />
      {countries.map((name) => <span key={name}>{name} <button type="button" aria-label={`Remove ${name}`} onClick={() => setTargetCountries(countries.filter((entry) => entry !== name))}><X /></button></span>)}
      <input
        aria-label="Add country"
        placeholder="Add a country and press Enter"
        list="country-suggestions"
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          const pickedFromList = (event.nativeEvent as InputEvent).inputType === "insertReplacementText" || !("inputType" in event.nativeEvent);
          if (pickedFromList && COUNTRY_SUGGESTIONS.some((name) => name === next)) addCountry(next);
          else setDraft(next);
        }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCountry(draft); } }}
        onBlur={() => { if (draft.trim()) addCountry(draft); }}
      />
      <datalist id="country-suggestions">{suggestions.map((name) => <option key={name} value={name} />)}</datalist>
    </label>
    <p className="token-hint">Remote and Europe-wide roles always stay visible. The Jobs screen filters to these countries by default.</p>
  </>;
}

function Preferences() {
  const [workstyles, setWorkstyles] = useState(new Set(["Remote", "Hybrid", "On-site"]));
  return <OnboardingFrame step={3}><div className="preferences-wrap"><p className="eyebrow">Shape your search</p><h1>What should NextJOB look for?</h1><p className="onboarding-lead">Start simple. You can fine-tune advanced preferences later.</p><section className="preference-section"><h2>Where would you like to work?</h2><div className="choice-grid"><Choice icon={Home} label="Remote" selected={workstyles.has("Remote")} onClick={() => toggleSet(workstyles, setWorkstyles, "Remote")} /><Choice icon={Building2} label="Hybrid" selected={workstyles.has("Hybrid")} onClick={() => toggleSet(workstyles, setWorkstyles, "Hybrid")} /><Choice icon={MapPin} label="On-site" selected={workstyles.has("On-site")} onClick={() => toggleSet(workstyles, setWorkstyles, "On-site")} /></div></section><section className="preference-section"><h2>Target locations</h2><TargetLocationsEditor /></section><section className="preference-section"><h2>Roles you’re interested in</h2><label className="field-label">Target titles<textarea defaultValue={candidate.targetTitles.join("\n")} /></label></section><details className="advanced-preferences"><summary>Advanced preferences <ChevronDown /></summary><div className="advanced-grid"><label>Minimum annual salary<input type="number" defaultValue="34000" /></label><label>Currency<select><option>EUR</option><option>GBP</option><option>USD</option></select></label><label><input type="checkbox" /> I need visa sponsorship</label><label><input type="checkbox" /> I am open to relocation</label></div></details><div className="sticky-review"><p><ShieldCheck /> You can change these preferences anytime.</p><Link className="button" href="/dashboard">Find my matches <Radar /></Link></div></div></OnboardingFrame>;
}
