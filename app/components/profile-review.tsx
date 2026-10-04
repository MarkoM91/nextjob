"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateProfile, CandidateExperience, Workplace } from "../../lib/domain";
import { reviewFields } from "../../lib/profile-review";
import { OnboardingFrame } from "./onboarding";
import { COUNTRY_SUGGESTIONS, setTargetCountries } from "./shared";

export function ProfileReview({ preferencesOnly = false }: { preferencesOnly?: boolean }) {
  const router = useRouter();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [edited, setEdited] = useState(false);
  const [role, setRole] = useState("");
  const [additionalRoles, setAdditionalRoles] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [languageDetail, setLanguageDetail] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/cv/profile", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Your CV could not be loaded. Refresh and try again.");
      const body = await response.json();
      if (body.source === "reactive-resume") {
        const candidate = body.profile as CandidateProfile;
        setProfile(candidate); setRole(candidate.targetTitles[0] || candidate.currentRole); setAdditionalRoles(candidate.targetTitles.slice(1).join("\n")); setCity(candidate.location); setCountries(candidate.preferences.countries);
        setLanguageDetail((body.resume?.sections?.languages?.items ?? []).map((item: { language: string; fluency?: string }) => [item.language, item.fluency].filter(Boolean).join(" ")).join(" · "));
      }
      setLoaded(true);
    }).catch((reason) => { if (!controller.signal.aborted) { setError(reason.message); setLoaded(true); } });
    return () => controller.abort();
  }, []);
  const change = (patch: Partial<CandidateProfile>) => { setEdited(true); setProfile((current) => current ? { ...current, ...patch } : current); };
  const changePreferences = (patch: Partial<CandidateProfile["preferences"]>) => setProfile((current) => current ? { ...current, preferences: { ...current.preferences, ...patch } } : current);
  const addCountry = () => { const value = country.trim(); if (value) setCountries((current) => [...new Set([...current, value])]); setCountry(""); };
  const changeExperience = (id: string, patch: Partial<CandidateExperience>) => change({ experiences: profile!.experiences.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const save = async () => {
    if (!profile || !role.trim() || !city.trim() || !profile.preferences.workplace.length || busy) return;
    setBusy(true); setError("");
    try {
      const selectedCountries = [...new Set([...countries, ...(country.trim() ? [country.trim()] : [])])];
      const targetTitles = [...new Set([role.trim(), ...additionalRoles.split("\n").map((value) => value.trim()).filter(Boolean)])];
      const response = await fetch("/api/cv/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(!preferencesOnly ? { confirmAll: true } : {}), ...(edited ? { profile: reviewFields(profile) } : {}), preferences: { ...profile.preferences, countries: selectedCountries, targetTitles } }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your profile could not be saved.");
      setTargetCountries(selectedCountries); router.push(`/matches?location=${encodeURIComponent(city.trim())}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your profile could not be saved."); setBusy(false); }
  };
  return <OnboardingFrame step={2}><div className="review-wrap quick-review"><div className="quick-review-heading"><h1>{preferencesOnly ? "Your job search" : "Ready to find your next job?"}</h1><p className="onboarding-lead">{preferencesOnly ? "Update what you’re looking for. Your CV details stay the same." : "Take a quick look at your CV details, then tell us where to search."}</p></div>
    {!loaded ? <p role="status">Reading your profile…</p> : !profile ? <p>{error || "Upload your CV to review your own experience."} <Link href="/upload">Upload CV</Link></p> : <>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} onInvalidCapture={(event) => { let parent = event.target as HTMLElement | null; while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; } }}>
      {!preferencesOnly && <section className="cv-summary-card" aria-label="CV summary"><div className="cv-summary-heading"><span className="eyebrow">From your CV</span><Link href="/upload">Replace CV</Link></div><h2>{profile.fullName}</h2><p className="cv-summary-role">{profile.currentRole} <span>· {profile.location}</span></p><p className="cv-summary-contact">{[profile.email, profile.phone].filter(Boolean).join(" · ")}</p><div className="cv-summary-counts"><span>{profile.experiences.length} roles</span><span>{profile.skills.filter(Boolean).length} skills</span><span>{profile.languages.join(" · ")}</span></div>
      <details className="cv-details-edit"><summary>Edit CV details</summary>
      <section className="review-section"><h3>Personal details</h3><div className="profile-fields">
        <label>Name<input value={profile.fullName} onChange={(event) => change({ fullName: event.target.value })} maxLength={160} required /></label>
        <label>Current role<input value={profile.currentRole} onChange={(event) => change({ currentRole: event.target.value })} maxLength={180} required /></label>
        <label>Home city or area<input value={profile.location} onChange={(event) => change({ location: event.target.value })} maxLength={240} required /></label>
        <label>Years of experience<input type="number" min="0" max="70" step="any" value={profile.yearsOfExperience} onChange={(event) => change({ yearsOfExperience: Number(event.target.value) })} /><small>Estimated from dates in your CV. Adjust if needed.</small></label>
        <label>Email for your CV<input type="email" value={profile.email} onChange={(event) => change({ email: event.target.value })} maxLength={240} /></label>
        <label>Phone for your CV<input type="tel" value={profile.phone} onChange={(event) => change({ phone: event.target.value })} /></label>
      </div></section>
      <section className="review-section"><h3>Work history</h3><p>Expand a role to correct its details.</p>{profile.experiences.map((item) => <details className="experience-review" key={item.id}><summary><strong>{item.role}</strong><span>{item.company} · {item.startDate} — {item.endDate || "Present"}</span></summary><div className="profile-fields">
        <label>Employer<input value={item.company} onChange={(event) => changeExperience(item.id, { company: event.target.value })} /></label>
        <label>Role<input value={item.role} onChange={(event) => changeExperience(item.id, { role: event.target.value })} /></label>
        <label>Start date<input value={item.startDate} onChange={(event) => changeExperience(item.id, { startDate: event.target.value })} placeholder="July 2026" /></label>
        <label>End date<input value={item.endDate ?? ""} onChange={(event) => changeExperience(item.id, { endDate: event.target.value || undefined })} placeholder="Leave empty for your current role" /></label>
        <label className="wide-field">Responsibilities<textarea value={item.bullets.map((bullet) => bullet.text).join("\n")} onChange={(event) => changeExperience(item.id, { bullets: event.target.value.split("\n").map((text, index) => ({ id: item.bullets[index]?.id ?? `${item.id}-review-${index}`, text })) })} rows={5} /></label>
      </div></details>)}</section>
      <section className="review-section"><h3>Skills and languages</h3><p>Use one skill per line.</p><label className="field-label">Skills<textarea rows={6} value={profile.skills.join("\n")} onChange={(event) => change({ skills: event.target.value.split("\n") })} /></label><label className="field-label">Languages<input value={profile.languages.join(", ")} onChange={(event) => change({ languages: event.target.value.split(",").map((value) => value.trim()) })} /></label>
        {languageDetail && <p>Levels stated in your CV: {languageDetail}. Include any corrected level in the language field.</p>}
        <details className="advanced-preferences"><summary>Skill levels (optional)</summary><p>Leave a level unspecified unless you want to state it yourself.</p><div className="skill-editor">{profile.skills.filter(Boolean).map((skill, index) => <label key={`${index}-${skill}`}><span>{skill}</span><select aria-label={`${skill} level`} value={profile.skillLevels?.[skill] ?? "unspecified"} onChange={(event) => change({ skillLevels: { ...profile.skillLevels, [skill]: event.target.value as "unspecified" | "beginner" | "intermediate" | "advanced" } })}><option value="unspecified">Unspecified</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>)}</div></details>
      </section>
      </details></section>}
      <section className="quick-search"><h2>What are you looking for?</h2><div className="profile-fields"><label>Role<input value={role} onChange={(event) => setRole(event.target.value)} maxLength={180} required placeholder="e.g. IT Help Desk" /></label><label>City or area<input value={city} onChange={(event) => setCity(event.target.value)} maxLength={80} required placeholder="e.g. Milano" /></label></div><p className="search-start-note">Nearby jobs first, then your region, country and Europe. Change the country filter on the Jobs page whenever you like.</p>
      <details className="advanced-preferences search-options"><summary>More search options <span>Work style, countries, salary</span></summary><h3>Work style</h3><div className="workstyle-options">{(["Remote", "Hybrid", "On-site"] as Workplace[]).map((value) => <label key={value}><input type="checkbox" checked={profile.preferences.workplace.includes(value)} onChange={(event) => changePreferences({ workplace: event.target.checked ? [...profile.preferences.workplace, value] : profile.preferences.workplace.filter((item) => item !== value) })} />{value}</label>)}</div>{!profile.preferences.workplace.length && <p className="form-error" role="alert">Select at least one work style.</p>}<label className="field-label">Other roles (optional)<textarea rows={2} value={additionalRoles} onChange={(event) => setAdditionalRoles(event.target.value)} placeholder="One related role per line" /></label><h3>Target countries</h3><p>These are saved for the “My target countries” filter.</p><div className="country-tokens">{countries.map((name) => <button type="button" key={name} aria-label={`Remove ${name}`} onClick={() => setCountries(countries.filter((item) => item !== name))}>{name} ×</button>)}</div><label className="field-label">Add country<input list="review-country-list" value={country} onChange={(event) => setCountry(event.target.value)} maxLength={80} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCountry(); } }} /></label><datalist id="review-country-list">{COUNTRY_SUGGESTIONS.map((name) => <option key={name} value={name} />)}</datalist><button className="secondary-action" type="button" onClick={addCountry} disabled={!country.trim()}>Add country</button><label className="field-label">Minimum annual salary (€)<input type="number" min="0" max="1000000" step="1" value={profile.preferences.minimumAnnualSalaryEur || ""} onChange={(event) => changePreferences({ minimumAnnualSalaryEur: Number(event.target.value) })} placeholder="No minimum" /></label><p>Listings without a stated salary remain visible.</p><label className="consent-check"><input type="checkbox" checked={profile.preferences.relocation} onChange={(event) => changePreferences({ relocation: event.target.checked })} />I am open to relocation</label><label className="consent-check"><input type="checkbox" checked={profile.preferences.visaSponsorshipRequired} onChange={(event) => changePreferences({ visaSponsorshipRequired: event.target.checked })} />I need visa sponsorship</label></details></section>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="quick-review-action">{!preferencesOnly && <p>By continuing, you confirm that your CV details are accurate. You can edit them later.</p>}<button className="button" type="submit" disabled={busy || !role.trim() || !city.trim() || !profile.preferences.workplace.length}>{busy ? "Saving your choices…" : preferencesOnly ? "Save & show jobs" : "Confirm & show jobs"}</button><p className="quick-review-price">Free matches and preview · CV download €1.50</p></div>
      </form>
    </>}
  </div></OnboardingFrame>;
}
