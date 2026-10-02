"use client";

import { useEffect, useState, type ReactNode } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Render the watermarked export as pages, without browser PDF download controls. */
export function CvPdfPreview({ jobId, design, revision, fallback }: { jobId: string; design: string; revision: string; fallback: ReactNode }) {
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
  return <div className="cv-export-preview" aria-label="CV design preview" aria-busy={!pages.length && !error}>
    {pages.length ? <><div className="cv-page-controls"><div><button className="secondary-action" aria-label="Previous CV page" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}>Previous</button><span role="status">Page {pageIndex + 1} of {pages.length}</span><button className="secondary-action" aria-label="Next CV page" disabled={pageIndex === pages.length - 1} onClick={() => setPageIndex(pageIndex + 1)}>Next</button></div><label>Zoom<select aria-label="CV preview zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value={100}>Fit width</option><option value={125}>125%</option><option value={150}>150%</option><option value={200}>200%</option></select></label></div><p className="cv-preview-caption">Free preview · The watermark is removed from your €1.50 download</p><div className="cv-page-viewport"><img className="cv-preview-page" style={{ width: `${zoom}%`, maxWidth: "none" }} src={pages[pageIndex]} alt={`Your CV in the selected design, page ${pageIndex + 1}`} /></div><details className="cv-preview-text"><summary>Read CV text and edit summary</summary>{fallback}</details></>
      : <><p className={error ? "form-error" : "cv-preview-caption"} role={error ? "alert" : "status"}>{error || "Loading your selected CV design…"}{error && <button className="secondary-action" onClick={() => setAttempt((current) => current + 1)}>Retry preview</button>}</p>{fallback}</>}
  </div>;
}
