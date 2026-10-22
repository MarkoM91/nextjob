"use client";
import { DownloadPrice } from "./billing-context";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, FileCheck2, Lock, MapPin, Radar, ShieldCheck, UploadCloud, Wallet } from "lucide-react";
import { bandClass, bestMatch, formatSalary, Logo, relativeDate } from "./shared";

export function Landing() {
  const match = bestMatch;
  return <main className="landing">
    <header className="landing-nav">
      <div className="landing-wrap nav-row">
        <Logo />
        <nav aria-label="Landing sections">
          <a href="#how">Process</a>
          <a href="#different">Standards</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <div className="landing-auth"><Link className="button" href="/upload"><UploadCloud /> Upload CV</Link></div>
      </div>
    </header>

    <section className="landing-wrap hero">
      <div className="hero-copy">
        <p className="eyebrow light">Career workspace · Private by design</p>
        <h1>One place to find, assess and apply for the right roles.</h1>
        <p className="hero-supporting">NextJOB turns your verified CV into a focused search: current employer vacancies, explainable fit and application documents you control.</p>
        <div className="hero-actions">
          <Link className="button button-large" href="/upload"><UploadCloud /> Upload your CV</Link>
          <a className="text-button" href="#how">Review the process <ArrowRight /></a>
        </div>
        <p className="microcopy"><ShieldCheck /> No account required · Preview at no cost · <DownloadPrice /> per CV export</p>
      </div>

      <div className="hero-product">
        <article className="hero-card" aria-label="Example NextJOB match">
          <div className="hero-card-status"><p className="hero-card-eyebrow">Example role brief</p><span><i /> Sample assessment</span></div>
          <div className="hero-card-title">
            <h2>{match.job.title}</h2>
            <span className={`match-label ${bandClass(match.band)}`}><BadgeCheck /> {match.band}</span>
          </div>
          <div className="hero-card-company">
            <span className="hero-company-mark" aria-hidden><Radar /></span>
            <div><strong>{match.job.company}</strong><span>{match.job.providerName}</span></div>
            <div className="hero-company-loc"><span><MapPin /> {match.job.locationText}</span><span><Radar /> {match.job.workplace}</span></div>
          </div>
          <div className="hero-card-meta">
            <span><Wallet /><div><strong>{formatSalary(match.job)}</strong><small>From the listing</small></div></span>
            <span><FileCheck2 /><div><strong>{match.matchedSkills.length} requirement{match.matchedSkills.length === 1 ? "" : "s"} met</strong><small>Verified in your profile</small></div></span>
            <span><BadgeCheck /><div><strong>{relativeDate(match.job.publishedAt)}</strong><small>Example posting</small></div></span>
          </div>
          <div className="hero-card-why">
            <p>Why this match?</p>
            <div>{(match.matchedSkills.length ? match.matchedSkills : ["Title fit", "Location fit"]).slice(0, 4).map((skill) => <span key={skill}><Check /> {skill}</span>)}</div>
          </div>
          <Link className="text-button" href="/dashboard">Open sample assessment <ArrowRight /></Link>
        </article>
      </div>
    </section>

    <section className="trust-bar" aria-label="NextJOB principles">
      <div className="landing-wrap trust-row">
        <p>Operating standards</p>
        <span><Lock /> Private by default</span>
        <span><Radar /> Employer listings only</span>
        <span><ShieldCheck /> You control submission</span>
        <span><FileCheck2 /> Claims linked to your CV</span>
      </div>
    </section>

    <section className="landing-wrap steps" id="how">
      <p className="eyebrow">A controlled workflow</p>
      <h2>From CV to application, with checks at every step.</h2>
      <div className="steps-grid">
        <article><span>01</span><div><strong>Establish your record</strong><p>Upload your CV and approve the facts that can be used in applications.</p></div></article>
        <article><span>02</span><div><strong>Assess current roles</strong><p>Compare live vacancies against your verified experience, requirement by requirement.</p></div></article>
        <article><span>03</span><div><strong>Prepare the application</strong><p>Review a tailored CV and cover letter before you decide where and when to apply.</p></div></article>
      </div>
    </section>

    <section className="different" id="different">
      <div className="landing-wrap different-grid">
        <article>
          <p className="eyebrow">Evidence standard</p>
          <h2>Every claim has a source.</h2>
          <p>Each tailored statement is linked to experience you approved. Missing evidence stays visible instead of being filled with assumptions.</p>
          <div className="evidence-list">
            <span><strong>Verified</strong> Resolved device, software and connectivity issues for 200+ users</span>
            <span><strong>Verified</strong> Microsoft 365 and Active Directory administration</span>
            <span className="warning"><strong>Gap</strong> ServiceNow is not confirmed in your profile — shown honestly</span>
          </div>
        </article>
        <article>
          <p className="eyebrow">Status standard</p>
          <h2>A record you can trust.</h2>
          <p>NextJOB separates an opened form, a submission you report and a receipt confirmed by the employer. Your application record always shows which is which.</p>
          <div className="evidence-list">
            <span><strong>Opened</strong> Employer form opened in a new tab</span>
            <span><strong>Reported</strong> You confirmed the submission yourself</span>
            <span><strong>Verified</strong> The employer system returned a receipt</span>
          </div>
        </article>
      </div>
    </section>

    <section className="landing-cta">
      <div className="landing-wrap cta-row">
        <h2>Start with the CV you already have.</h2>
        <p>Review the workspace before paying. Export a tailored CV for <DownloadPrice /> when it is ready.</p>
        <Link className="button button-large" href="/upload">Upload CV <ArrowRight /></Link>
      </div>
    </section>

    <footer className="landing-footer">
      <div className="landing-wrap footer-row">
        <Logo compact />
        <span>© 2026 NextJOB</span>
        <nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/help">Help</Link></nav>
      </div>
    </footer>
  </main>;
}
