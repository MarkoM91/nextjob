"use client";
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
    <Link href={jobId ? `/workspace?job=${encodeURIComponent(jobId)}` : "/upload"} className="back-link"><ArrowLeft /> Back to your CV</Link>
    <PageIntro eyebrow="Free preview · Pay only to download" title={unlocked ? "Your CV is ready to download" : "Download your CV"} subtitle={access?.job ? `${access.job.title} · ${access.job.company}` : "Creating and previewing your CV is free. Download when you’re ready."} />
    <div className="checkout-layout"><section className="panel checkout-card">
      <div className="checkout-card-head"><span className="checkout-icon"><FileText /></span><div><h2>{unlocked ? "Download access active" : "One-time download"}</h2><p>{unlocked ? "No further payment is needed for this saved CV." : "Creating and previewing your CV is free. Pay once for the finished file."}</p></div></div>
      <div className="checkout-price"><span>{access?.subscription.active ? "Included in your subscription" : access?.purchased ? "Already purchased" : "One-time CV download"}</span><strong>{unlocked ? "Unlocked" : price ?? "Checking price…"}</strong></div>
      <div className="checkout-format"><span>Choose a format</span><div>{formats.map((item) => <button key={item} type="button" className={selectedFormat === item ? "active" : ""} aria-pressed={selectedFormat === item} onClick={() => setSelectedFormat(item)}>{item.toUpperCase()}</button>)}</div></div>
      {payment && notices[payment] && <p className={unlocked ? "billing-success" : "billing-notice"} role="status">{payment === "successful" && !unlocked ? "Checking your payment. Your download will unlock after confirmation." : notices[payment]}</p>}
      {access?.purchased && payment !== "successful" && <p className="billing-success" role="status">You’ve already purchased this CV. Download it again at no extra cost{access.expiresAt ? ` until ${new Date(access.expiresAt).toLocaleDateString()}` : ""}.</p>}
      {access?.subscription.active && <p className="billing-success" role="status">Subscription active{access.subscription.cancelAtPeriodEnd ? "; ends" : " until"} {new Date(access.subscription.periodEndsAt!).toLocaleDateString()}. Your CV download is included.</p>}
      {access && ["expired", "cancelled"].includes(access.subscription.status) && !unlocked && <p className="billing-notice" role="status">Your subscription is {access.subscription.status}. You can still pay once for this CV.</p>}
      {access && !access.available && <p className="billing-notice" role="status">{access.code === "PLAY_BILLING_NOT_CONFIGURED" ? "Android payments are not available yet. Creating and previewing your CV is still free." : access.code === "CV_NOT_READY" ? "Finish and save your CV preview first." : "Payments are temporarily unavailable. Your CV is saved and its preview remains free."}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button full" type="button" disabled={!access?.available || starting} onClick={() => void start()}>{unlocked ? <Download /> : <CreditCard />}{starting ? unlocked ? "Opening your download…" : "Opening secure checkout…" : unlocked ? "Download your CV" : access?.available ? `Pay ${price} and download` : access || error ? "Download unavailable" : "Checking download access…"}</button>
      <ul className="checkout-points"><li><Check /> PDF, DOCX and TXT included</li><li><Check /> {access?.redownloadDays ?? catalog?.download.redownloadDays ?? "Several"} days to re-download this same CV</li><li><Check /> No account or subscription required</li></ul>
      {(error || payment === "pending" || payment === "not-confirmed" || access && !access.available) && <button className="secondary-action" type="button" onClick={() => setCheck((value) => value + 1)}>Check again</button>}
      {catalog?.subscription.enabled && !unlocked && platform === "web" && <div className="billing-optional"><h3>Optional monthly plan</h3><p>{catalog.subscription.label}/month for unlimited CV downloads. The one-time download is always available.</p><button className="secondary-action" disabled={!access?.available || starting} onClick={() => void start("monthly_subscription")}>Choose monthly plan</button></div>}
      <p className="checkout-fineprint"><LockKeyhole /> Your purchased copy stays unchanged. After payment, save a private recovery link to keep access if you change browsers.</p>
      <Link className="secondary-action" href="/billing">Your purchased downloads</Link>
      {access?.purchased && <div className="billing-optional"><button className="secondary-action" type="button" onClick={() => void saveLink()}>Copy private recovery link</button><p>Save this link to re-download this purchased CV if you change browsers or lose this workspace. Keep it private: anyone with the link can download this CV until access expires.</p>{recovery && <p role="status">{recovery.copied ? "Private link copied. Save it somewhere safe." : <a href={recovery.url}>Open your recovery download and save its link</a>}</p>}</div>}
    </section>{access?.job && <aside className="checkout-summary"><div className="checkout-job"><CompanyMark name={access.job.company} large /><div><strong>{access.job.title}</strong><span>{access.job.company} · {access.job.locationText}</span></div></div><SourceNotice job={access.job} /></aside>}</div>
  </AppContent>;
}
