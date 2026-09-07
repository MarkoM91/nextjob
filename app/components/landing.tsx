"use client";

import Link from "next/link";
import { ArrowRight, Check, FileCheck2, Lock, MapPin, PlayCircle, Radar, ShieldCheck, Sparkles, UploadCloud, Wallet } from "lucide-react";
import { bandClass, bestMatch, formatSalary, Logo, relativeDate } from "./shared";

export function Landing() {
  const match = bestMatch;
  return <main className="landing">
    <header className="landing-nav">
      <div className="landing-wrap nav-row">
        <Logo />
        <nav aria-label="Landing sections">
          <a href="#how">How it works</a>
          <a href="#different">Why it&rsquo;s different</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <div className="landing-auth">
          <Link href="/sign-in">Log in</Link>
          <Link className="button" href="/upload"><UploadCloud /> Start with your CV</Link>
        </div>
      </div>
    </header>

    <section className="landing-wrap hero">
      <div className="hero-copy">
        <h1>Your job search,<br />brought into <em>focus</em>.</h1>
        <p className="hero-supporting">Upload your CV once. Discover relevant roles from real employer listings and create an ATS-ready application in minutes.</p>
        <div className="hero-actions">
          <Link className="button button-large" href="/upload"><UploadCloud /> Start with your CV</Link>
          <a className="text-button" href="#how"><PlayCircle /> See how it works</a>
        </div>
        <p className="microcopy"><ShieldCheck /> Private by default · Nothing is ever submitted automatically</p>
      </div>

      <div className="hero-product">
        <div className="orbit" aria-hidden />
        <div className="orbit orbit-2" aria-hidden />
        <article className="hero-card" aria-label="Example NextJOB match">
          <p className="hero-card-eyebrow">Your best match today</p>
          <div className="hero-card-title">
            <h2>{match.job.title}</h2>
            <span className={`match-label ${bandClass(match.band)}`}><Sparkles /> {match.band}</span>
          </div>
          <div className="hero-card-company">
            <span className="hero-company-mark" aria-hidden><Radar /></span>
            <div><strong>{match.job.company}</strong><span>{match.job.providerName}</span></div>
            <div className="hero-company-loc"><span><MapPin /> {match.job.locationText}</span><span><Radar /> {match.job.workplace}</span></div>
          </div>
          <div className="hero-card-meta">
            <span><Wallet /><div><strong>{formatSalary(match.job)}</strong><small>From the listing</small></div></span>
            <span><FileCheck2 /><div><strong>{match.matchedSkills.length} requirement{match.matchedSkills.length === 1 ? "" : "s"} met</strong><small>Verified in your profile</small></div></span>
            <span><Sparkles /><div><strong>{relativeDate(match.job.publishedAt)}</strong><small>Live employer listing</small></div></span>
          </div>
          <div className="hero-card-why">
            <p>Why this match?</p>
            <div>{(match.matchedSkills.length ? match.matchedSkills : ["Title fit", "Location fit"]).slice(0, 4).map((skill) => <span key={skill}><Check /> {skill}</span>)}</div>
          </div>
          <Link className="text-button" href="/dashboard">View full role details <ArrowRight /></Link>
        </article>
        <aside className="hero-float" aria-hidden>
          <span className="hero-float-icon"><FileCheck2 /></span>
          <div>
            <strong>Application ready</strong>
            <span><Check /> Grounded in your real CV</span>
            <span><Check /> Nothing submitted automatically</span>
          </div>
        </aside>
      </div>
    </section>

    <section className="trust-bar" aria-label="NextJOB principles">
      <div className="landing-wrap trust-row">
        <p>Built for honest applications</p>
        <span><Lock /> Private by default</span>
        <span><Radar /> Real employer listings only</span>
        <span><ShieldCheck /> Nothing submitted automatically</span>
        <span><FileCheck2 /> Every claim traceable to your CV</span>
      </div>
    </section>

    <section className="landing-wrap steps" id="how">
      <h2>A smarter process in three simple steps</h2>
      <div className="steps-grid">
        <article><span>1</span><div><strong>Upload your CV</strong><p>We extract a factual profile — every fact keeps its source text, and you confirm it before anything is used.</p></div></article>
        <article><span>2</span><div><strong>Discover the right roles</strong><p>Live employer listings, matched against your verified profile and explained requirement by requirement.</p></div></article>
        <article><span>3</span><div><strong>Apply with confidence</strong><p>An ATS-ready CV and cover letter tailored to each role — grounded in your real experience, never invented.</p></div></article>
      </div>
    </section>

    <section className="different" id="different">
      <div className="landing-wrap different-grid">
        <article>
          <p className="eyebrow">Grounded generation</p>
          <h2>Nothing is <em>invented</em>. Ever.</h2>
          <p>Every bullet in a tailored CV traces back to a fact you verified from your own history. If a requirement isn&rsquo;t in your experience, NextJOB says so — it never papers over the gap.</p>
          <div className="evidence-list">
            <span><strong>Verified</strong> Resolved device, software and connectivity issues for 200+ users</span>
            <span><strong>Verified</strong> Microsoft 365 and Active Directory administration</span>
            <span className="warning"><strong>Gap</strong> ServiceNow is not confirmed in your profile — shown honestly</span>
          </div>
        </article>
        <article>
          <p className="eyebrow">Honest tracking</p>
          <h2>Status you can <em>trust</em>.</h2>
          <p>NextJOB separates &ldquo;you opened the form&rdquo;, &ldquo;you reported applying&rdquo; and &ldquo;the employer confirmed it&rdquo;. Your pipeline reflects reality, not wishful thinking.</p>
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
        <h2>Ready to bring your search into focus?</h2>
        <p>One verified profile. Real listings. Applications you can stand behind.</p>
        <Link className="button button-large" href="/upload">Start with your CV <ArrowRight /></Link>
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
