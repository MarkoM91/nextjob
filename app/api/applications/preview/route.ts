import { env } from "cloudflare:workers";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { userFromRequest } from "../../../auth";
import { safeOwnerId, tailoredResumeKey } from "../../../../lib/resume-storage";
import { clientKey, rateLimit } from "../../../../lib/security";

/** The free preview is watermarked; the original file remains payment-gated. */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "Open your CV workspace to preview this document." }, { status: 401 });
  const jobId = new URL(request.url).searchParams.get("job") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(jobId)) return Response.json({ error: "A valid job is required." }, { status: 400 });
  const limit = rateLimit(`cv-preview:${clientKey(request)}`, 120, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Please wait before loading another preview." }, { status: 429 });
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  if (!storage) return Response.json({ error: "CV previews are temporarily unavailable." }, { status: 503 });
  try {
    const object = await storage.get(tailoredResumeKey(safeOwnerId(user.id), jobId)) as { size?: number; arrayBuffer(): Promise<ArrayBuffer> } | null;
    if (!object) return Response.json({ error: "Create your tailored CV before previewing its design." }, { status: 404 });
    if ((object.size ?? 0) > 12 * 1024 * 1024) return Response.json({ error: "This CV is too large to preview." }, { status: 413 });
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength > 12 * 1024 * 1024) return Response.json({ error: "This CV is too large to preview." }, { status: 413 });
    const document = await PDFDocument.load(bytes);
    if (document.getPageCount() > 20) return Response.json({ error: "This CV has too many pages to preview." }, { status: 413 });
    const font = await document.embedFont(StandardFonts.HelveticaBold);
    for (const page of document.getPages()) {
      const { width, height } = page.getSize();
      page.drawText("NEXTJOB PREVIEW", { x: width * .12, y: height * .35, size: Math.min(54, width / 11), font, color: rgb(.75, .12, .16), rotate: degrees(35), opacity: .22 });
      page.drawText("PREVIEW - Finished CV download: EUR 1.50", { x: 22, y: 12, size: 8, font, color: rgb(.75, .12, .16) });
    }
    const preview = await document.save();
    return new Response(new Uint8Array(preview), { headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="nextjob-preview.pdf"', "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return Response.json({ error: "The design preview could not be loaded. Your CV is still saved; try again." }, { status: 503 });
  }
}
