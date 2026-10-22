import { safeOwnerId } from "./resume-storage";
import { resolveRealJob } from "./job-store";
import { currentCv, readCvVersion, validVersion, freezeCvVersion, versionKey } from "./billing-cv";
import { cvAccess } from "./billing-store";
import { billingCatalog } from "./payment";
import { textToDocx } from "./documents";

export async function downloadCv(request: Request, format: "pdf" | "docx" | "txt", ownerValue: string | undefined, db: D1Database | undefined, storage: R2Bucket | undefined): Promise<Response> {
  const privateHeaders = { "cache-control": "private, no-store" };
  const url = new URL(request.url);
  const requested = url.searchParams.get("version");
  if (requested && !validVersion(requested)) return Response.json({ error: "Invalid CV version." }, { status: 400, headers: privateHeaders });
  const jobId = url.searchParams.get("job")!;
  const job = !requested ? await resolveRealJob(jobId, db, storage) : null;
  if (!requested && !job) return Response.json({ error: "This live job is no longer available." }, { status: 404, headers: privateHeaders });
  if (!ownerValue) return Response.json({ error: "Open your CV workspace first.", code: "CV_REQUIRED" }, { status: 409, headers: privateHeaders });
  const owner = safeOwnerId(ownerValue);
  let snapshot = requested ? await readCvVersion(storage, owner, requested) : null;
  if (!requested) {
    snapshot = job ? await currentCv(storage, owner, job) : null;
  }
  if (!snapshot || snapshot.jobId !== jobId) return Response.json({ error: "Finish your CV preview before downloading it.", code: "CV_NOT_READY" }, { status: 409, headers: privateHeaders });
  const access = await cvAccess(db, owner, snapshot.id);
  if (!access.allowed) {
    const checkout = new URL("/checkout", request.url);
    checkout.searchParams.set("job", jobId); checkout.searchParams.set("format", format);
    if (requested) checkout.searchParams.set("version", requested);
    const price = billingCatalog().download.label;
    if (request.headers.get("accept")?.includes("application/json")) return Response.json({ error: `Creating and previewing your CV is free. Download it for ${price}.`, code: "PAYMENT_REQUIRED", checkoutUrl: checkout.toString(), price }, { status: 402, headers: privateHeaders });
    return new Response(null, { status: 303, headers: { ...privateHeaders, location: checkout.toString() } });
  }
  if (!storage) return Response.json({ error: "Your saved CV is temporarily unavailable." }, { status: 503, headers: privateHeaders });
  await freezeCvVersion(storage, snapshot);
  snapshot = await readCvVersion(storage, owner, snapshot.id) ?? snapshot;
  const filename = `${snapshot.profile.fullName}-${snapshot.job.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 130);
  const headers = { ...privateHeaders, "content-disposition": `attachment; filename="${filename}.${format}"`, "x-content-type-options": "nosniff", "x-nextjob-document-provider": "purchased-cv-version" };
  if (format === "pdf") {
    const file = await storage.get(`${versionKey(owner, snapshot.id)}/cv.pdf`) as { body: ReadableStream } | null;
    if (!file) return Response.json({ error: "Your purchased CV is temporarily unavailable. Please retry; no further payment is needed." }, { status: 503, headers: privateHeaders });
    return new Response(file.body, { headers: { ...headers, "content-type": "application/pdf" } });
  }
  const bytes = format === "docx" ? textToDocx(snapshot.text, { title: `CV — ${snapshot.job.title}`, author: snapshot.profile.fullName }) : new TextEncoder().encode(snapshot.text);
  return new Response(bytes.buffer as ArrayBuffer, { headers: { ...headers, "content-type": format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain; charset=utf-8" } });
}
