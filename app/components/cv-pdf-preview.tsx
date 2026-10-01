"use client";

import { useEffect, useState, type ReactNode } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Render the watermarked export as pages, without browser PDF download controls. */
export function CvPdfPreview({ jobId, design, revision, fallback }: { jobId: string; design: string; revision: string; fallback: ReactNode }) {
  const [pages, setPages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let destroy: (() => Promise<void>) | undefined;
    setPages([]); setError("");
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
    {pages.length ? <><p className="cv-preview-caption">{pages.length} {pages.length === 1 ? "page" : "pages"} · Preview watermark is removed from the paid download</p>{pages.map((page, index) => <img className="cv-preview-page" key={index} src={page} alt={`Your CV in the selected design, page ${index + 1}`} />)}<details className="cv-preview-text"><summary>Read or edit CV text</summary>{fallback}</details></>
      : <><p className={error ? "form-error" : "cv-preview-caption"} role={error ? "alert" : "status"}>{error || "Loading your selected CV design…"}{error && <button className="secondary-action" onClick={() => setAttempt((current) => current + 1)}>Retry preview</button>}</p>{fallback}</>}
  </div>;
}
