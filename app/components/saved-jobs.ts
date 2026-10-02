"use client";
import { useCallback, useEffect, useState } from "react";
import type { MatchResult } from "../../lib/domain";

const changedEvent = "nextjob-saved-jobs-changed";
export function useSavedJobs() {
  const [ids, setIds] = useState(new Set<string>());
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/saved-jobs", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Saved jobs could not be loaded.");
      setIds(new Set(body.savedJobIds)); setMatches(body.matches); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Saved jobs could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void reload();
    const refresh = () => { void reload(); };
    window.addEventListener(changedEvent, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(changedEvent, refresh); window.removeEventListener("focus", refresh); };
  }, [reload]);
  const toggle = async (match: MatchResult, saved: boolean) => {
    if (busy || loading) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/saved-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, saved }) });
      const body = await response.json();
      if (!response.ok || !body.persisted) throw new Error(body.error || "Your change could not be saved.");
      setIds((current) => { const next = new Set(current); if (saved) next.add(match.job.id); else next.delete(match.job.id); return next; });
      setMatches((current) => saved ? [match, ...current.filter((item) => item.job.id !== match.job.id)] : current.filter((item) => item.job.id !== match.job.id));
      window.dispatchEvent(new Event(changedEvent));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your change could not be saved."); }
    finally { setBusy(false); }
  };
  return { ids, matches, loading, busy, error, toggle, reload };
}
