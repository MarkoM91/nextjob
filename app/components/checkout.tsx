"use client";
import { useI18n } from "./language-provider";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CreditCard, Download, FileText, LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { Job } from "../../lib/domain";
import type { PaymentModel } from "../../lib/payment";
import { AppContent, CompanyMark, PageIntro, SourceNotice } from "./shared";
import { useBilling } from "./billing-context";

type Access = { available: boolean; purchased: boolean; versionId: string | null; price: string; amountCents: number; redownloadDays: number; expiresAt: number | null; code?: string; job?: Job; subscription: { active: boolean; status: string; periodEndsAt: number | null; cancelAtPeriodEnd: boolean } };
const formats = ["pdf", "docx", "txt"] as const;
const notices: Record<string, string> = {
  successful: "Payment successful. Your CV is unlocked and your download will start shortly.",
  cancelled: "Payment cancelled. Your CV is saved and you can keep previewing it for free.",
  failed: "Payment failed. Your CV is saved. You can try again when you’re ready.",
  pending: "Your payment is being confirmed. Check again shortly; do not pay a second time.",
  "not-confirmed": "We couldn’t confirm your payment yet. Check again before trying another payment.",
  expired: "Your previous download access has expired. Your CV preview is still free.",
};

export function CheckoutScreen({ jobId, format, payment, versionId }: { jobId?: string; format?: string; payment?: string; versionId?: string }) {
  const { t, locale } = useI18n();
  const { catalog, platform, platformReady } = useBilling();
  const [selectedFormat, setSelectedFormat] = useState(() => formats.includes(format as typeof formats[number]) ? format! : "pdf");
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [check, setCheck] = useState(0);
  const [recovery, setRecovery] = useState<{ copied: boolean; url: string } | null>(null);
  const autoDownload = useRef(false);
  useEffect(() => {
    if (!jobId || !platformReady) return;
    const controller = new AbortController();
    setAccess(null); setError("");
    const query = new URLSearchParams({ job: jobId });
    if (versionId) query.set("version", versionId);
    void fetch(`/api/payments/cv-download?${query}`, { cache: "no-store", headers: { "x-nextjob-platform": platform }, signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Download access could not be checked.");
      if (!controller.signal.aborted) setAccess(body);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message || "Download access could not be checked."); });
    return () => controller.abort();
  }, [jobId, versionId, platform, platformReady, check]);
  const unlocked = Boolean(access?.purchased || access?.subscription.active);

  useEffect(() => {
    if (payment !== "successful" || !unlocked || !access?.versionId || autoDownload.current || !jobId) return;
    autoDownload.current = true;
    let preferred = selectedFormat;
    try { const saved = sessionStorage.getItem(`nextjob-download-format:${access.versionId}`); if (formats.includes(saved as typeof formats[number])) preferred = saved!; } catch { /* The return URL remains a safe fallback. */ }
    setSelectedFormat(preferred);
    window.location.assign(`/api/documents/${preferred}?job=${encodeURIComponent(jobId)}&doc=cv&version=${encodeURIComponent(access.versionId)}`);
  }, [payment, unlocked, access?.versionId, jobId, selectedFormat]);

  const start = async (model: PaymentModel = "pay_per_download") => {
    if (!access?.available || starting || !jobId || !platformReady) return;
    setStarting(true); setError("");
    try {
      const response = await fetch("/api/payments/cv-download", { method: "POST", headers: { "content-type": "application/json", "x-nextjob-platform": platform }, body: JSON.stringify({ jobId, format: selectedFormat, model, versionId: access.versionId, expectedAmountCents: model === "pay_per_download" ? access.amountCents : catalog?.subscription.amountCents }) });
      const body = await response.json();
      if (!response.ok) { if (body.code === "PRICE_CHANGED") setCheck((value) => value + 1); throw new Error(body.error || "Checkout could not be started."); }
      const destination = body.downloadUrl || body.checkoutUrl;
      if (!destination) throw new Error("Checkout could not be started.");
      if (body.checkoutUrl && access.versionId) { try { sessionStorage.setItem(`nextjob-download-format:${access.versionId}`, selectedFormat); } catch { /* Checkout still works without browser storage. */ } }
      window.location.assign(destination);
      if (body.downloadUrl) setStarting(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Checkout could not be started."); setStarting(false); }
  };
  const price = access?.price ?? catalog?.download.label;
  const saveLink = async () => {
    if (!access?.purchased || !access.versionId) return;
    try {
      const response = await fetch("/api/payments/recovery-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId: access.versionId }) });
      const body = await response.json();
      if (!response.ok || typeof body.url !== "string") throw new Error(body.error || "Your recovery link could not be created.");
      try { await navigator.clipboard.writeText(body.url); setRecovery({ copied: true, url: body.url }); }
      catch { setRecovery({ copied: false, url: body.url }); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your recovery link could not be created."); }
  };
  return <AppContent narrow>
    <Link href={jobId ? `/workspace?job=${encodeURIComponent(jobId)}` : "/upload"} className="back-link"><ArrowLeft /> {t("Back to your CV")}</Link>
    <PageIntro eyebrow={t("Free preview · Pay only to download")} title={unlocked ? t("Your CV is ready to download") : t("Download your CV")} subtitle={access?.job ? `${access.job.title} · ${access.job.company}` : t("Creating and previewing your CV is free. Download when you’re ready.")} />
    <div className="checkout-layout"><section className="panel checkout-card">
      <div className="checkout-card-head"><span className="checkout-icon"><FileText /></span><div><h2>{unlocked ? t("Download access active") : t("One-time download")}</h2><p>{unlocked ? t("No further payment is needed for this saved CV.") : t("Creating and previewing your CV is free. Pay once for the finished file.")}</p></div></div>
      <div className="checkout-price"><span>{access?.subscription.active ? t("Included in your subscription") : access?.purchased ? t("Already purchased") : t("One-time CV download")}</span><strong>{unlocked ? t("Unlocked") : price ?? t("Checking price…")}</strong></div>
      <div className="checkout-format"><span>{t("Choose a format")}</span><div>{formats.map((item) => <button key={item} type="button" className={selectedFormat === item ? "active" : ""} aria-pressed={selectedFormat === item} onClick={() => setSelectedFormat(item)}>{item.toUpperCase()}</button>)}</div></div>
      {payment && notices[payment] && <p className={unlocked ? "billing-success" : "billing-notice"} role="status">{payment === "successful" && !unlocked ? t("Checking your payment. Your download will unlock after confirmation.") : t(notices[payment])}</p>}
      {access?.purchased && payment !== "successful" && <p className="billing-success" role="status">{t("You’ve already purchased this CV. Download it again at no extra cost")}{access.expiresAt ? t(" until {0}", {"0": new Date(access.expiresAt).toLocaleDateString()}) : ""}.</p>}
      {access?.subscription.active && <p className="billing-success" role="status">{t("Subscription active")}{access.subscription.cancelAtPeriodEnd ? t("; ends") : t(" until")} {new Date(access.subscription.periodEndsAt!).toLocaleDateString()}{t(". Your CV download is included.")}</p>}
      {access && ["expired", "cancelled"].includes(access.subscription.status) && !unlocked && <p className="billing-notice" role="status">{t("Your subscription is ")}{access.subscription.status}{t(". You can still pay once for this CV.")}</p>}
      {access && !access.available && <p className="billing-notice" role="status">{access.code === "PAYMENT_PENDING" ? t(notices.pending) : access.code === "PLAY_BILLING_NOT_CONFIGURED" ? t("Android payments are not available yet. Creating and previewing your CV is still free.") : access.code === "CV_NOT_READY" ? t("Finish and save your CV preview first.") : t("Payments are temporarily unavailable. Your CV is saved and its preview remains free.")}</p>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <button className="button full" type="button" disabled={!access?.available || starting} onClick={() => void start()}>{unlocked ? <Download /> : <CreditCard />}{starting ? unlocked ? t("Opening your download…") : t("Opening secure checkout…") : unlocked ? t("Download your CV") : access?.available ? t("Pay {0} and download", {"0": price}) : access || error ? t("Download unavailable") : t("Checking download access…")}</button>
      <ul className="checkout-points"><li><Check /> {t("PDF, DOCX and TXT included")}</li><li><Check /> {access?.redownloadDays ?? catalog?.download.redownloadDays ?? t("Several")} {t("days to re-download this same CV")}</li><li><Check /> {t("No account or subscription required")}</li></ul>
      {(error || payment === "pending" || payment === "not-confirmed" || access && !access.available) && <button className="secondary-action" type="button" onClick={() => setCheck((value) => value + 1)}>{t("Check again")}</button>}
      {catalog?.subscription.enabled && !unlocked && platform === "web" && <div className="billing-optional"><h3>{t("Optional monthly plan")}</h3><p>{catalog.subscription.label}{t("/month for unlimited CV downloads. The one-time download is always available.")}</p><button className="secondary-action" disabled={!access?.available || starting} onClick={() => void start("monthly_subscription")}>{t("Choose monthly plan")}</button></div>}
      <p className="checkout-fineprint"><LockKeyhole /> {t("Your purchased copy stays unchanged. After payment, save a private recovery link to keep access if you change browsers.")}</p>
      <Link className="secondary-action" href="/billing">{t("Your purchased downloads")}</Link>
      {access?.purchased && <div className="billing-optional"><button className="secondary-action" type="button" onClick={() => void saveLink()}>{t("Copy private recovery link")}</button><p>{t("Save this link to re-download this purchased CV if you change browsers or lose this workspace. Keep it private: anyone with the link can download this CV until access expires.")}</p>{recovery && <p role="status">{recovery.copied ? t("Private link copied. Save it somewhere safe.") : <a href={recovery.url}>{t("Open your recovery download and save its link")}</a>}</p>}</div>}
    </section>{access?.job && <aside className="checkout-summary"><div className="checkout-job"><CompanyMark name={access.job.company} large /><div><strong>{access.job.title}</strong><span>{access.job.company} · {access.job.locationText}</span></div></div><SourceNotice job={access.job} /></aside>}</div>
  </AppContent>;
}
