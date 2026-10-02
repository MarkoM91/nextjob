"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateProfile, CandidateExperience } from "../../lib/domain";
import { reviewFields } from "../../lib/profile-review";
import { OnboardingFrame } from "./onboarding";

export function ProfileReview() {
  const router = useRouter();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [languageDetail, setLanguageDetail] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/cv/profile", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Your CV could not be loaded. Refresh and try again.");
      const body = await response.json();
      if (body.source === "reactive-resume") { setProfile(body.profile); setLanguageDetail((body.resume?.sections?.languages?.items ?? []).map((item: { language: string; fluency?: string }) => [item.language, item.fluency].filter(Boolean).join(" ")).join(" · ")); }
      setLoaded(true);
    }).catch((reason) => { if (!controller.signal.aborted) { setError(reason.message); setLoaded(true); } });
    return () => controller.abort();
  }, []);
  const change = (patch: Partial<CandidateProfile>) => { setApproved(false); setProfile((current) => current ? { ...current, ...patch } : current); };
  const changeExperience = (id: string, patch: Partial<CandidateExperience>) => change({ experiences: profile!.experiences.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const save = async () => {
    if (!profile || !approved || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/cv/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmAll: true, profile: reviewFields(profile) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your profile could not be saved.");
      router.push("/preferences");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your profile could not be saved."); setBusy(false); }
  };
  return <OnboardingFrame step={2}><div className="review-wrap"><p className="eyebrow">Check your CV</p><h1>Confirm your experience</h1><p className="onboarding-lead">Correct anything we read incorrectly. These details will be used for your matches and applications.</p>
    {!loaded ? <p role="status">Reading your profile…</p> : !profile ? <p>{error || "Upload your CV to review your own experience."} <Link href="/upload">Upload CV</Link></p> : <>
      <section className="review-section"><h2>Your profile</h2><div className="profile-fields">
        <label>Name<input value={profile.fullName} onChange={(event) => change({ fullName: event.target.value })} maxLength={160} /></label>
        <label>Current role<input value={profile.currentRole} onChange={(event) => change({ currentRole: event.target.value })} maxLength={180} /></label>
        <label>City or area<input value={profile.location} onChange={(event) => change({ location: event.target.value })} maxLength={240} /></label>
        <label>Years of experience<input type="number" min="0" max="70" step="0.5" value={profile.yearsOfExperience} onChange={(event) => change({ yearsOfExperience: Number(event.target.value) })} /><small>Estimated from dates in your CV. Adjust if needed.</small></label>
        <label>Email for your CV<input type="email" value={profile.email} onChange={(event) => change({ email: event.target.value })} /></label>
        <label>Phone for your CV<input type="tel" value={profile.phone} onChange={(event) => change({ phone: event.target.value })} /></label>
      </div></section>
      <section className="review-section"><h2>Work history</h2><p>Check your employers, roles and dates. Expand a role to correct its details.</p>{profile.experiences.map((item) => <details className="experience-review" key={item.id}><summary><strong>{item.role}</strong><span>{item.company} · {item.startDate} — {item.endDate || "Present"}</span></summary><div className="profile-fields">
        <label>Employer<input value={item.company} onChange={(event) => changeExperience(item.id, { company: event.target.value })} /></label>
        <label>Role<input value={item.role} onChange={(event) => changeExperience(item.id, { role: event.target.value })} /></label>
        <label>Start date<input value={item.startDate} onChange={(event) => changeExperience(item.id, { startDate: event.target.value })} placeholder="July 2026" /></label>
        <label>End date<input value={item.endDate ?? ""} onChange={(event) => changeExperience(item.id, { endDate: event.target.value || undefined })} placeholder="Leave empty for your current role" /></label>
        <label className="wide-field">Responsibilities<textarea value={item.bullets.map((bullet) => bullet.text).join("\n")} onChange={(event) => changeExperience(item.id, { bullets: event.target.value.split("\n").map((text, index) => ({ id: item.bullets[index]?.id ?? `${item.id}-review-${index}`, text })) })} rows={5} /></label>
      </div></details>)}</section>
      <section className="review-section"><h2>Skills and languages</h2><p>Keep only what you can explain from experience. Use one skill per line.</p><label className="field-label">Skills<textarea rows={6} value={profile.skills.join("\n")} onChange={(event) => change({ skills: event.target.value.split("\n") })} /></label><label className="field-label">Languages<input value={profile.languages.join(", ")} onChange={(event) => change({ languages: event.target.value.split(",").map((value) => value.trim()) })} /></label>
        {languageDetail && <p>Levels stated in your CV: {languageDetail}. Include any corrected level in the language field.</p>}
        <details className="advanced-preferences"><summary>Skill levels (optional)</summary><p>Leave a level unspecified unless you want to state it yourself.</p><div className="skill-editor">{profile.skills.filter(Boolean).map((skill, index) => <label key={`${index}-${skill}`}><span>{skill}</span><select aria-label={`${skill} level`} value={profile.skillLevels?.[skill] ?? "unspecified"} onChange={(event) => change({ skillLevels: { ...profile.skillLevels, [skill]: event.target.value as "unspecified" | "beginner" | "intermediate" | "advanced" } })}><option value="unspecified">Unspecified</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>)}</div></details>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="review-confirmation"><label className="consent-check"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><span>I checked these details and confirm they describe my experience.</span></label><button className="button" disabled={!approved || busy} onClick={() => void save()}>{busy ? "Saving your profile…" : "Save profile and continue"}</button><p>Matching and CV previews are free. Download a tailored CV for €1.50.</p></div>
    </>}
  </div></OnboardingFrame>;
}
