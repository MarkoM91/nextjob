"use client";
import { useI18n } from "./language-provider";
import { DownloadPrice } from "./billing-context";

import { useEffect, useState, type ReactNode } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Render the watermarked export as pages, without browser PDF download controls. */
export function CvPdfPreview({ jobId, design, revision, fallback }: { jobId: string; design: string; revision: string; fallback: ReactNode }) {
  const { t, locale } = useI18n();
  const [pages, setPages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let destroy: (() => Promise<void>) | undefined;
    setPages([]); setError(""); setPageIndex(0);
    void (async () => {
      const response = await fetch(`/api/applications/preview?job=${encodeURIComponent(jobId)}&design=${encodeURIComponent(design)}&v=${encodeURIComponent(revision)}`, { signal: controller.signal });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "The CV preview could not be loaded.");
      }
      const data = new Uint8Array(await response.arrayBuffer());
      const pdfjs = await import("pdfjs-dist");
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const task = pdfjs.getDocument({ data, useSystemFonts: true });
      destroy = () => task.destroy();
      const document = await task.promise;
      const images: string[] = [];
      for (let number = 1; number <= document.numPages && active; number += 1) {
        const page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser could not display the CV preview.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        images.push(canvas.toDataURL("image/png"));
        page.cleanup();
      }
      if (active) setPages(images);
    })().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "The CV preview could not be loaded."); })
      .finally(() => { if (destroy) void destroy(); });
    return () => { active = false; controller.abort(); if (destroy) void destroy(); };
  }, [jobId, design, revision, attempt]);
  return <div className="cv-export-preview" aria-label={t("CV design preview")} aria-busy={!pages.length && !error}>
    {pages.length ? <><div className="cv-page-controls"><div><button className="secondary-action" aria-label={t("Previous CV page")} disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}>{t("Previous")}</button><span role="status">{t("Page ")}{pageIndex + 1} {t("of ")}{pages.length}</span><button className="secondary-action" aria-label={t("Next CV page")} disabled={pageIndex === pages.length - 1} onClick={() => setPageIndex(pageIndex + 1)}>{t("Next")}</button></div><label>{t("Zoom")}<select aria-label={t("CV preview zoom")} value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value={100}>{t("Fit width")}</option><option value={125}>125%</option><option value={150}>150%</option><option value={200}>200%</option></select></label></div><p className="cv-preview-caption">{t("Free preview · The watermark is removed from your ")}<DownloadPrice /> {t("download")}</p><div className="cv-page-viewport"><img className="cv-preview-page" style={{ width: `${zoom}%`, maxWidth: "none" }} src={pages[pageIndex]} alt={t("Your CV in the selected design, page {0}", {"0": pageIndex + 1})} /></div><details className="cv-preview-text"><summary>{t("Read CV text and edit summary")}</summary>{fallback}</details></>
      : <><p className={error ? "form-error" : "cv-preview-caption"} role={error ? "alert" : "status"}>{error || t("Loading your selected CV design…")}{error && <button className="secondary-action" onClick={() => setAttempt((current) => current + 1)}>{t("Retry preview")}</button>}</p>{fallback}</>}
  </div>;
}
