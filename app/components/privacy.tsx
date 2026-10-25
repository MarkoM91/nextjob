"use client";
import { useI18n } from "./language-provider";
import Link from "next/link";
import type { ReactNode } from "react";
import { NEXTJOB_CONTACT_EMAIL } from "../../lib/contact";
import { AppContent, PageIntro } from "./shared";

function PrivacySection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel privacy-section"><h2>{title}</h2>{children}</section>;
}

export function PrivacyScreen() {
  const { t, locale } = useI18n();
  return <AppContent narrow>
    <PageIntro eyebrow={t("NextJOB · Privacy")} title={t("Your CV and your data")} subtitle={t("How this version of NextJOB handles your information, and how to contact us about it.")} />
    <p className="privacy-updated">{t("Last updated: ")}<time dateTime="2026-10-25">{t("25 October 2026")}</time></p>
    <div className="privacy-sections">
      <PrivacySection title={t("What you provide")}>
        <p>{t("When you upload a CV, NextJOB processes the document and the information it contains: your name, contact details, work history, education, skills, languages and professional links. It also saves the profile details and job-search preferences you review or change, such as roles, city, countries and work style.")}</p>
        <p>{t("When you prepare an application, NextJOB stores the generated CV and related documents. Jobs you add, saved application activity and any download-access records are associated with your workspace.")}</p>
      </PrivacySection>
      <PrivacySection title={t("Why the CV is processed")}>
        <p>{t("Your CV is used to extract a profile for you to review, match relevant job listings and prepare the application documents you request. Uploading requires your agreement to document and language-model processing.")}</p>
        <p>{t("The current language-model provider is OpenAI. The uploaded CV file is sent for extraction. When you request tailored documents, your reviewed professional information and the job posting can be sent to the configured model to prepare the text. Review the result before using it.")}</p>
        <p>{t("Reactive Resume is an optional integration for résumé processing, tailoring and PDF rendering when enabled. That integration can receive résumé content and job information. NextJOB also supports its own CV designs.")}</p>
        <p>{t("Third-party processing has its own service settings and terms. Contact us before uploading if you need more information about the processors used for this test.")}</p>
      </PrivacySection>
      <PrivacySection title={t("Storage and your guest workspace")}>
        <p>{t("NextJOB runs on Cloudflare Workers. Uploaded CVs, parsed profiles and generated documents are stored under workspace-specific keys in Cloudflare R2. Supporting job, application and billing records use Cloudflare D1 when those features are used. Server requests check the workspace identity before returning private CV data.")}</p>
        <p>{t("You can use a guest workspace without creating an account. A signed guest cookie identifies that workspace in your browser or Android app. The cookie contains a workspace identifier and expiry, rather than the CV text. Uploading still stores the information described on this page.")}</p>
        <p>{t("Clearing browser cookies, clearing Android app data or losing the workspace cookie can remove your access to that workspace. These actions do not delete the CV or other records already stored on the server. An expired download link also does not mean that its stored document has been deleted.")}</p>
        <p>{t("NextJOB uses your network country to choose the interface language. The language selector saves your choice in a preference cookie for up to one year. No GPS access is requested.")}</p>
      </PrivacySection>
      <PrivacySection title={t("Job boards, applications and downloads")}>
        <p>{t("Job services receive search details such as role, country and city to find listings. Employer and job-board links open externally, where the destination service handles your visit under its own privacy terms. NextJOB does not submit applications automatically; review your documents and explicitly confirm any supported submission.")}</p>
        <p>{t("Creating and previewing a CV is free. Paid Android exports are disabled during this test, so no in-app charge is made. If web payments are enabled, Stripe handles checkout; NextJOB stores order and download-access records rather than full payment-card details.")}</p>
        <p>{t("A downloaded CV contains the information you chose to include. Keep it and any private recovery link secure. Anyone you give a valid recovery link to can download the CV covered by that link until its access expires.")}</p>
      </PrivacySection>
      <PrivacySection title={t("Request a copy or deletion")}>
        <p>{t("For support, privacy questions, or a request to copy or delete your CV and application data, email ")}<a href={`mailto:${NEXTJOB_CONTACT_EMAIL}?subject=NextJOB%20privacy%20request`}>{NEXTJOB_CONTACT_EMAIL}</a>.</p>
        <p>{t("Requests are handled manually. There is currently no self-service deletion control or stated automatic deletion schedule for this test. We may need information to locate your workspace and verify your request. Contact us before clearing app data if you need help identifying that workspace; you do not need to attach your full CV to the first email.")}</p>
      </PrivacySection>
      <PrivacySection title={t("For closed-test participants")}>
        <p>{t("Use a fictional or anonymized CV while testing. Remove unnecessary sensitive information, government identifiers and other people’s personal details before uploading. The original file is sent for extraction, so removing information only from the later profile does not remove it from the original upload.")}</p>
        <p><Link href="/help">{t("Get help with the test")}</Link> {t("or email ")}<a href={`mailto:${NEXTJOB_CONTACT_EMAIL}`}>{NEXTJOB_CONTACT_EMAIL}</a> {t("if you encounter a problem or want your test data removed.")}</p>
      </PrivacySection>
    </div>
  </AppContent>;
}
