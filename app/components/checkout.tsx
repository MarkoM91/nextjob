"use client";

import { useState } from "react";
import { ArrowLeft, Check, CreditCard, FileText, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AppContent, CompanyMark, LiveJobState, PageIntro, SourceNotice, useLiveMatch } from "./shared";

const formats = ["pdf", "docx", "txt"] as const;
type DownloadFormat = (typeof formats)[number];

function validFormat(value?: string): DownloadFormat {
  return formats.includes(value as DownloadFormat) ? value as DownloadFormat : "pdf";
}

export function CheckoutScreen({ jobId, format, payment }: { jobId?: string; format?: string; payment?: string }) {
  const { match, loading, error } = useLiveMatch(jobId);
  const [selectedFormat, setSelectedFormat] = useState<DownloadFormat>(() => validFormat(format));
  const [starting, setStarting] = useState(false);
  const [checkoutError, setCheckoutError] = useState(() => payment === "cancelled" ? "Payment cancelled. Your CV is still ready to preview." : payment === "not-confirmed" ? "We could not confirm that payment. If you were charged, please contact support before trying again." : "");

  if (!match) return <LiveJobState loading={loading} error={error} />;

  const startCheckout = async () => {
    if (starting) return;
    setStarting(true); setCheckoutError("");
    try {
      const response = await fetch("/api/payments/cv-download", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ jobId: match.job.id, format: selectedFormat }) });
      const payload = await response.json().catch(() => ({})) as { checkoutUrl?: string; downloadUrl?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Checkout could not be started.");
      const destination = payload.checkoutUrl ?? payload.downloadUrl;
      if (!destination) throw new Error("Checkout could not be started.");
      window.location.assign(destination);
    } catch (startError) {
      setCheckoutError(startError instanceof Error ? startError.message : "Checkout could not be started.");
      setStarting(false);
    }
  };

  return <AppContent narrow>
    <Link href={`/workspace?job=${encodeURIComponent(match.job.id)}`} className="back-link"><ArrowLeft /> Back to your CV</Link>
    <PageIntro eyebrow="One-time download" title="Your tailored CV is ready" subtitle={`${match.job.title} · ${match.job.company}`} />
    <div className="checkout-layout">
      <section className="panel checkout-card">
        <div className="checkout-card-head"><span className="checkout-icon"><FileText /></span><div><p className="kicker">Download access</p><h2>Take your CV with you</h2><p>Keep the preview free. Pay once when you want the file for an application.</p></div></div>
        <div className="checkout-price"><span>One-time download</span><strong>€1.50</strong></div>
        <div className="checkout-format"><span>Choose a format</span><div>{formats.map((item) => <button key={item} type="button" className={selectedFormat === item ? "active" : ""} aria-pressed={selectedFormat === item} onClick={() => setSelectedFormat(item)}>{item.toUpperCase()}</button>)}</div></div>
        <ul className="checkout-points"><li><Check /> Your verified facts and tailored design</li><li><Check /> Download immediately after payment</li><li><Check /> No account or subscription required</li></ul>
        {checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}
        <button className="button full" type="button" disabled={starting} onClick={() => void startCheckout()}><CreditCard />{starting ? "Opening secure checkout…" : "Pay €1.50 and download"}</button>
        <p className="checkout-fineprint"><LockKeyhole /> Includes all three formats for this role and repeat downloads for 7 days in this browser. Keep your browser cookies to retain access.</p>
      </section>
      <aside className="checkout-summary"><div className="checkout-job"><CompanyMark name={match.job.company} large /><div><strong>{match.job.title}</strong><span>{match.job.company} · {match.job.locationText}</span></div></div><div className="checkout-preview"><div><ShieldCheck /><span>Free preview included</span></div><Link href={`/workspace?job=${encodeURIComponent(match.job.id)}`}>Review before you buy</Link></div><SourceNotice job={match.job} /></aside>
    </div>
  </AppContent>;
}
