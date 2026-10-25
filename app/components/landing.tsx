"use client";
import { LanguageSelector, useI18n } from "./language-provider";
import { DownloadPrice } from "./billing-context";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, FileCheck2, Lock, MapPin, Radar, ShieldCheck, UploadCloud, Wallet } from "lucide-react";
import { bandClass, bestMatch, formatSalary, Logo, relativeDate } from "./shared";

export function Landing() {
  const { t, locale } = useI18n();
  const match = bestMatch;
  return <main className="landing">
    <header className="landing-nav">
      <div className="landing-wrap nav-row">
        <Logo />
        <nav aria-label={t("Landing sections")}>
          <a href="#how">{t("Process")}</a>
          <a href="#different">{t("Standards")}</a>
          <Link href="/privacy">{t("Privacy")}</Link>
        </nav>
        <div className="landing-auth"><LanguageSelector compact /><Link className="button" href="/upload"><UploadCloud /> {t("Upload CV")}</Link></div>
      </div>
    </header>

    <section className="landing-wrap hero">
      <div className="hero-copy">
        <p className="eyebrow light">{t("Career workspace · Private by design")}</p>
        <h1>{t("One place to find, assess and apply for the right roles.")}</h1>
        <p className="hero-supporting">{t("NextJOB turns your verified CV into a focused search: current employer vacancies, explainable fit and application documents you control.")}</p>
        <div className="hero-actions">
          <Link className="button button-large" href="/upload"><UploadCloud /> {t("Upload your CV")}</Link>
          <a className="text-button" href="#how">{t("Review the process ")}<ArrowRight /></a>
        </div>
        <p className="microcopy"><ShieldCheck /> {t("No account required · Preview at no cost · ")}<DownloadPrice /> {t("per CV export")}</p>
      </div>

      <div className="hero-product">
        <article className="hero-card" aria-label={t("Example NextJOB match")}>
          <div className="hero-card-status"><p className="hero-card-eyebrow">{t("Example role brief")}</p><span><i /> {t("Sample assessment")}</span></div>
          <div className="hero-card-title">
            <h2>{match.job.title}</h2>
            <span className={`match-label ${bandClass(match.band)}`}><BadgeCheck /> {t(match.band)}</span>
          </div>
          <div className="hero-card-company">
            <span className="hero-company-mark" aria-hidden><Radar /></span>
            <div><strong>{match.job.company}</strong><span>{match.job.providerName}</span></div>
            <div className="hero-company-loc"><span><MapPin /> {match.job.locationText}</span><span><Radar /> {t(match.job.workplace)}</span></div>
          </div>
          <div className="hero-card-meta">
            <span><Wallet /><div><strong>{formatSalary(match.job, locale)}</strong><small>{t("From the listing")}</small></div></span>
            <span><FileCheck2 /><div><strong>{match.matchedSkills.length} {t("requirement")}{match.matchedSkills.length === 1 ? "" : "s"} {t("met")}</strong><small>{t("Verified in your profile")}</small></div></span>
            <span><BadgeCheck /><div><strong>{relativeDate(match.job.publishedAt, locale)}</strong><small>{t("Example posting")}</small></div></span>
          </div>
          <div className="hero-card-why">
            <p>{t("Why this match?")}</p>
            <div>{(match.matchedSkills.length ? match.matchedSkills : ["Title fit", "Location fit"]).slice(0, 4).map((skill) => <span key={skill}><Check /> {skill}</span>)}</div>
          </div>
          <Link className="text-button" href="/dashboard">{t("Open sample assessment ")}<ArrowRight /></Link>
        </article>
      </div>
    </section>

    <section className="trust-bar" aria-label={t("NextJOB principles")}>
      <div className="landing-wrap trust-row">
        <p>{t("Operating standards")}</p>
        <span><Lock /> {t("Private by default")}</span>
        <span><Radar /> {t("Employer listings only")}</span>
        <span><ShieldCheck /> {t("You control submission")}</span>
        <span><FileCheck2 /> {t("Claims linked to your CV")}</span>
      </div>
    </section>

    <section className="landing-wrap steps" id="how">
      <p className="eyebrow">{t("A controlled workflow")}</p>
      <h2>{t("From CV to application, with checks at every step.")}</h2>
      <div className="steps-grid">
        <article><span>01</span><div><strong>{t("Establish your record")}</strong><p>{t("Upload your CV and approve the facts that can be used in applications.")}</p></div></article>
        <article><span>02</span><div><strong>{t("Assess current roles")}</strong><p>{t("Compare live vacancies against your verified experience, requirement by requirement.")}</p></div></article>
        <article><span>03</span><div><strong>{t("Prepare the application")}</strong><p>{t("Review a tailored CV and cover letter before you decide where and when to apply.")}</p></div></article>
      </div>
    </section>

    <section className="different" id="different">
      <div className="landing-wrap different-grid">
        <article>
          <p className="eyebrow">{t("Evidence standard")}</p>
          <h2>{t("Every claim has a source.")}</h2>
          <p>{t("Each tailored statement is linked to experience you approved. Missing evidence stays visible instead of being filled with assumptions.")}</p>
          <div className="evidence-list">
            <span><strong>{t("Verified")}</strong> {t("Resolved device, software and connectivity issues for 200+ users")}</span>
            <span><strong>{t("Verified")}</strong> {t("Microsoft 365 and Active Directory administration")}</span>
            <span className="warning"><strong>{t("Gap")}</strong> {t("ServiceNow is not confirmed in your profile — shown honestly")}</span>
          </div>
        </article>
        <article>
          <p className="eyebrow">{t("Status standard")}</p>
          <h2>{t("A record you can trust.")}</h2>
          <p>{t("NextJOB separates an opened form, a submission you report and a receipt confirmed by the employer. Your application record always shows which is which.")}</p>
          <div className="evidence-list">
            <span><strong>{t("Opened")}</strong> {t("Employer form opened in a new tab")}</span>
            <span><strong>{t("Reported")}</strong> {t("You confirmed the submission yourself")}</span>
            <span><strong>{t("Verified")}</strong> {t("The employer system returned a receipt")}</span>
          </div>
        </article>
      </div>
    </section>

    <section className="landing-cta">
      <div className="landing-wrap cta-row">
        <h2>{t("Start with the CV you already have.")}</h2>
        <p>{t("Review the workspace before paying. Export a tailored CV for ")}<DownloadPrice /> {t("when it is ready.")}</p>
        <Link className="button button-large" href="/upload">{t("Upload CV ")}<ArrowRight /></Link>
      </div>
    </section>

    <footer className="landing-footer">
      <div className="landing-wrap footer-row">
        <Logo compact />
        <span>{t("© 2026 NextJOB")}</span>
        <nav><Link href="/privacy">{t("Privacy")}</Link><Link href="/terms">{t("Terms")}</Link><Link href="/help">{t("Help")}</Link></nav>
      </div>
    </footer>
  </main>;
}
