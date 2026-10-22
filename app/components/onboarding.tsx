"use client";
import { DownloadPrice } from "./billing-context";

import Link from "next/link";
import { ProfileReview } from "./profile-review";
import { Preferences } from "./preferences";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, FileCheck2, ShieldCheck, UploadCloud, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CandidateProfile } from "../../lib/domain";
import { Logo } from "./shared";

export function OnboardingFrame({ step, children }: { step: number; children: React.ReactNode }) {
  return <main className="onboarding"><header><Logo /><Link href="/help">Help</Link></header><nav className="onboarding-progress" aria-label="Getting started"><span className={step >= 1 ? "active" : ""} aria-current={step === 1 ? "step" : undefined}>1 <em>Add CV</em></span><i /><span className={step >= 2 ? "active" : ""} aria-current={step >= 2 ? "step" : undefined}>2 <em>Review & find jobs</em></span></nav>{children}<footer><ShieldCheck /> Private by default. You approve every application.</footer></main>;
}

export function UploadScreen({ stage = "upload" }: { stage?: "upload" | "profile" | "preferences" }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [hasSavedCv, setHasSavedCv] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/cv/profile", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(payload => { if (active) setHasSavedCv(["reactive-resume", "nextjob-parser"].includes(payload?.source ?? "")); }).catch(() => undefined);
    return () => { active = false; };
  }, [stage]);

  const upload = async () => {
    if (!file || !consent || uploading) return;
    setUploading(true); setError("");
    const form = new FormData(); form.set("cv", file); form.set("aiProcessingConsent", "true");
    try {
      const response = await fetch("/api/cv/upload", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
      if (!response.ok) throw new Error(payload.error ?? "We could not upload that file.");
      setUploading(false);
      router.push("/profile-review");
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "We could not upload that file."); setUploading(false); }
  };
  if (stage === "profile") return <ProfileReview />;
  if (stage === "preferences") return <Preferences />;
  return <OnboardingFrame step={1}><div className="upload-layout"><div><p className="eyebrow">Create your verified profile</p><h1>Upload your current CV</h1><p className="onboarding-lead">We&apos;ll extract the work history and skills it contains. You review the record before it is used for matching or documents.</p><div className={`dropzone ${file ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setFile(event.dataTransfer.files?.[0] ?? null); }}><input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{file ? <><FileCheck2 /><strong>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024))} KB · ready to process</span><button type="button" onClick={() => fileInput.current?.click()}>Choose another file</button></> : <><UploadCloud /><strong>Drop your CV here</strong><span>PDF or DOCX · maximum 10 MB</span><button type="button" className="button" onClick={() => fileInput.current?.click()}>Choose file</button></>}</div>{error && <div role="alert"><p className="form-error">{error}</p>{hasSavedCv && <p><Link href="/profile-review">Continue with my saved CV <ArrowRight size={16} /></Link></p>}</div>}<label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>I agree to secure document processing</strong><small>The configured language model reads your CV securely, with Reactive Resume used where available, only to extract your profile and prepare applications you request. <Link href="/privacy">Learn more</Link></small></span></label><button disabled={!file || !consent || uploading} className="button full" onClick={() => void upload()}>{uploading ? "Processing your CV…" : error ? "Try processing again" : "Process CV and continue"}<ArrowRight /></button><p className="upload-privacy">Matching and CV previews are free. Download a tailored CV for <DownloadPrice />. Nothing is submitted automatically.</p></div></div></OnboardingFrame>;
}
