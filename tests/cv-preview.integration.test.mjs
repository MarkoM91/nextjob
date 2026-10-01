import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createGuestToken } from "../lib/auth-session.ts";

process.env.AUTH_SECRET = "preview-tests-private-secret-123456789";
process.env.NEXTJOB_DISABLE_LIVE_JOBS = "true";
const { default: worker } = await import("../dist/server/index.js");
const ownerId = "guest_abcdefghijklmnopqrstuvwx";
const jobId = "design-preview-job";
const token = await createGuestToken(ownerId, process.env.AUTH_SECRET);
const document = await PDFDocument.create();
document.addPage([595, 842]).drawText("Verified candidate CV");
const original = await document.save();
const snapshot = original.slice();
let writes = 0;
env.DOCUMENTS = {
  get: async (key) => key === `private/${ownerId}/applications/${jobId}/tailored-cv.pdf` ? { size: original.byteLength, arrayBuffer: async () => original.slice().buffer } : null,
  put: async () => { writes += 1; },
};
const request = (path, cookie = `nextjob_guest=${token}`) => worker.fetch(new Request(`http://localhost${path}`, { headers: { cookie, accept: "application/json" } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });

test("design preview shows the actual PDF with a watermark while preserving the original", async () => {
  const response = await request(`/api/applications/preview?job=${jobId}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const preview = await PDFDocument.load(await response.arrayBuffer());
  assert.equal(preview.getPageCount(), 1);
  const streams = preview.getPages()[0].node.Contents();
  const contents = Array.from({ length: streams.size() }, (_, index) => {
    const stream = preview.context.lookup(streams.get(index));
    return stream instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(stream).decode()) : "";
  }).join("\n");
  assert.match(contents, /4e4558544a4f422050524556494557/i); // NEXTJOB PREVIEW in the PDF's text encoding.
  assert.match(contents, /45555220312e3530/i); // EUR 1.50.
  assert.deepEqual(original, snapshot);
  assert.equal(writes, 0);
});

test("a free preview never grants the original download or another workspace's CV", async () => {
  const other = await createGuestToken("guest_zyxwvutsrqponmlkjihgfedc", process.env.AUTH_SECRET);
  assert.equal((await request(`/api/applications/preview?job=${jobId}`, `nextjob_guest=${other}`)).status, 404);
  assert.equal((await request(`/api/applications/preview?job=${jobId}`, "")).status, 401);
  assert.equal((await request("/api/applications/preview?job=../other")).status, 400);
  assert.equal((await request(`/api/documents/pdf?job=${jobId}`)).status, 404); // No live job, and no download grant was created.
});
