"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CandidateProfile, Workplace } from "../../lib/domain";
import { COUNTRY_SUGGESTIONS, setTargetCountries } from "./shared";
import { OnboardingFrame } from "./onboarding";

export function Preferences() {
  const router = useRouter();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [titles, setTitles] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void fetch("/api/cv/profile", { cache: "no-store" }).then((response) => response.json()).then((body) => {
      if (body.source !== "reactive-resume") return;
      setProfile(body.profile); setTitles(body.profile.targetTitles.join("\n")); setCountries(body.profile.preferences.countries);
    }).catch(() => setError("Your preferences could not be loaded. Refresh and try again.")).finally(() => setLoaded(true));
  }, []);
  const change = (patch: Partial<CandidateProfile["preferences"]>) => setProfile((current) => current ? { ...current, preferences: { ...current.preferences, ...patch } } : current);
  const addCountry = () => { const value = country.trim(); if (value && !countries.includes(value)) setCountries([...countries, value]); setCountry(""); };
  const save = async () => {
    if (!profile || busy) return;
    setBusy(true); setError("");
    try {
      const selectedCountries = country.trim() ? [...new Set([...countries, country.trim()])] : countries;
      const response = await fetch("/api/cv/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences: { ...profile.preferences, countries: selectedCountries, targetTitles: titles.split("\n").map((value) => value.trim()).filter(Boolean) } }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your preferences could not be saved.");
      setTargetCountries(selectedCountries); router.push("/matches");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your preferences could not be saved."); setBusy(false); }
  };
  return <OnboardingFrame step={3}><div className="preferences-wrap"><p className="eyebrow">Your job search</p><h1>What should NextJOB look for?</h1><p className="onboarding-lead">We start near {profile?.location || "your city"}, then widen to your country and Europe. You can choose a country on the Jobs screen.</p>{profile ? <>
    <section className="preference-section"><h2>Roles you’re interested in</h2><label className="field-label">Target titles<textarea rows={3} value={titles} onChange={(event) => setTitles(event.target.value)} /></label><p>One role per line. These start from your CV; remove roles you no longer want.</p></section>
    <section className="preference-section"><h2>Work style</h2><div className="workstyle-options">{(["Remote", "Hybrid", "On-site"] as Workplace[]).map((value) => <label key={value}><input type="checkbox" checked={profile.preferences.workplace.includes(value)} onChange={(event) => change({ workplace: event.target.checked ? [...profile.preferences.workplace, value] : profile.preferences.workplace.filter((item) => item !== value) })} />{value}</label>)}</div></section>
    <details className="advanced-preferences"><summary>More preferences (optional)</summary><h2>Target countries</h2><p>Use these for “My target countries” in the country filter.</p><div className="country-tokens">{countries.map((name) => <button type="button" key={name} aria-label={`Remove ${name}`} onClick={() => setCountries(countries.filter((item) => item !== name))}>{name} ×</button>)}</div><label className="field-label">Add country<input list="preference-country-list" value={country} onChange={(event) => setCountry(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCountry(); } }} /></label><datalist id="preference-country-list">{COUNTRY_SUGGESTIONS.map((name) => <option key={name} value={name} />)}</datalist><button className="secondary-action" type="button" onClick={addCountry} disabled={!country.trim()}>Add country</button><label className="field-label">Minimum annual salary (€)<input type="number" min="0" max="1000000" value={profile.preferences.minimumAnnualSalaryEur || ""} onChange={(event) => change({ minimumAnnualSalaryEur: Number(event.target.value) })} placeholder="No minimum" /></label><p>Listings without a stated salary remain visible.</p><label className="consent-check"><input type="checkbox" checked={profile.preferences.relocation} onChange={(event) => change({ relocation: event.target.checked })} />I am open to relocation</label><label className="consent-check"><input type="checkbox" checked={profile.preferences.visaSponsorshipRequired} onChange={(event) => change({ visaSponsorshipRequired: event.target.checked })} />I need visa sponsorship</label></details>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="review-confirmation"><button className="button" onClick={() => void save()} disabled={busy || !profile.preferences.workplace.length || !titles.trim()}>{busy ? "Saving…" : "Find my matches"}</button><p>Free matching and preview · CV download €1.50 · No account required</p><Link className="secondary-action" href="/profile-review">Back to your profile</Link></div>
  </> : <p role="status">{error || (loaded ? <>Upload your CV to set your preferences. <Link href="/upload">Upload CV</Link></> : "Loading your preferences…")}</p>}</div></OnboardingFrame>;
}
