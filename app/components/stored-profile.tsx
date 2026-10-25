"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FileText, RefreshCw } from "lucide-react";
import type { CandidateProfile } from "../../lib/domain";
import type { ReactiveResumeData } from "../../lib/reactive-resume";
import { AppContent } from "./shared";

export type StoredCvProfile = { profile: CandidateProfile; resume: ReactiveResumeData | null; preferredTemplate: string | null };

/** Personal document views wait for the owner's stored profile; examples never stand in. */
export function useStoredCvProfile() {
  const [profile, setProfile] = useState<StoredCvProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/cv/profile", { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } }).then(async (response) => {
      if (!response.ok) throw new Error("Your CV could not be loaded. Refresh this page to try again.");
      const body = await response.json();
      if (!controller.signal.aborted && body?.profile && ["reactive-resume", "nextjob-parser"].includes(body.source)) setProfile({ profile: body.profile, resume: body.resume ?? null, preferredTemplate: body.preferredTemplate ?? null });
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Your CV could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return { profile, loading, error };
}

export function StoredProfileState({ loading, error = "" }: { loading: boolean; error?: string }) {
  return <AppContent narrow><section className="live-job-state">{loading ? <><RefreshCw className="spin" /><h1>Loading your CV…</h1><p role="status">Checking the profile saved in your private workspace.</p></> : <><FileText /><h1>{error ? "Your CV is temporarily unavailable" : "Start with your CV"}</h1><p>{error || "Upload your CV and review your details before preparing documents for a job."}</p><Link className="button" href="/upload">{error ? "Go to CV upload" : "Upload your CV"}<ArrowRight /></Link></>}</section></AppContent>;
}
