import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureGuestUser } from "../../../auth";
import { resumeProfileKey, safeOwnerId, type StoredResumeProfile } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { candidateFromReactiveResume, parseAndImportReactiveResume, reactiveResumeConfiguration, ReactiveResumeApiError } from "../../../../lib/reactive-resume";

const MAX_FILE_SIZE = Number(process.env.CV_MAX_BYTES ?? 10 * 1024 * 1024);
const allowedTypes = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const allowedExtensions = new Set(["pdf", "docx"]);
const fileNameSchema = z.string().min(1).max(180).regex(/^[^\\/:*?\"<>|]+$/);

function hasExpectedSignature(bytes: ArrayBuffer, extension: string): boolean {
  const header = new Uint8Array(bytes.slice(0, 8));
  if (extension === "pdf") return new TextDecoder().decode(header.slice(0, 5)) === "%PDF-";
  if (extension === "docx") return header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  return false;
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`cv:${clientKey(request)}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Upload limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const { user, setCookie } = await ensureGuestUser(request);
  if (!user) return Response.json({ error: "A private workspace is not available yet. Please try again later.", code: "ANONYMOUS_WORKSPACE_NOT_CONFIGURED" }, { status: 503 });
  const form = await request.formData();
  const file = form.get("cv");
  const consent = form.get("aiProcessingConsent") === "true";
  if (!(file instanceof File) || !consent) return Response.json({ error: "A CV and explicit AI-processing consent are required" }, { status: 400 });
  const parsedName = fileNameSchema.safeParse(file.name);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!parsedName.success || !allowedTypes.has(file.type) || !allowedExtensions.has(extension)) return Response.json({ error: "Unsupported file. Use PDF or DOCX." }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return Response.json({ error: "The CV must be between 1 byte and 10 MB." }, { status: 413 });
  const bytes = await file.arrayBuffer();
  if (!hasExpectedSignature(bytes, extension)) return Response.json({ error: "The file contents do not match its PDF or DOCX extension." }, { status: 415 });

  const provider = reactiveResumeConfiguration();
  if (!provider.configured) return Response.json({ error: "Résumé analysis is not configured yet.", code: "PROVIDER_NOT_CONFIGURED", missingConfiguration: provider.missing, providerSupported: provider.providerSupported }, { status: 503 });

  const ownerId = safeOwnerId(user.id);
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  if (!storage) return Response.json({ error: "Private document storage is not available.", code: "DOCUMENT_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  const objectKey = `private/${ownerId}/cv/${crypto.randomUUID()}.${extension}`;
  await storage.put(objectKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { ownerId, validation: "signature-and-type-v1" } });
  try {
    const imported = await parseAndImportReactiveResume(bytes, file.name, file.type);
    const profile = candidateFromReactiveResume(imported.content, ownerId);
    if (!profile.facts.length) throw new ReactiveResumeApiError("The CV did not contain enough structured information to review", 422, "EMPTY_PROFILE");
    const stored: StoredResumeProfile = { provider: "reactive-resume", externalResumeId: imported.resumeId, parsedAt: new Date().toISOString(), content: imported.content, profile };
    await storage.put(resumeProfileKey(ownerId), new TextEncoder().encode(JSON.stringify(stored)), { httpMetadata: { contentType: "application/json" }, customMetadata: { ownerId, provider: "reactive-resume", externalResumeId: imported.resumeId } });
    const headers = new Headers({ "cache-control": "private, no-store" });
    if (setCookie) headers.set("set-cookie", setCookie);
    return Response.json({ id: crypto.randomUUID(), status: "completed", objectKey, profile, parsingProvider: "reactive-resume", providerConfigured: true, parsedAt: stored.parsedAt, demoMode: false }, { status: 201, headers });
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    const requestId = crypto.randomUUID();
    if (error instanceof ReactiveResumeApiError) console.error("[cv-upload] résumé processing failed", { requestId, stage: error.stage, status: error.status, code: error.code });
    else console.error("[cv-upload] résumé processing failed", { requestId, code: "PARSING_FAILED" });
    const providerUnavailable = error instanceof ReactiveResumeApiError && error.status >= 500;
    const message = providerUnavailable
      ? "We couldn't finish reading this CV. Your file was not saved. Please try again in a moment."
      : error instanceof ReactiveResumeApiError ? error.message : "The CV parser is temporarily unavailable";
    const code = error instanceof ReactiveResumeApiError ? error.code : "PARSING_FAILED";
    const status = error instanceof ReactiveResumeApiError && error.status === 415 ? 415 : error instanceof ReactiveResumeApiError && error.status === 422 ? 422 : 502;
    return Response.json({ error: message, code, requestId }, { status, headers: { "cache-control": "private, no-store" } });
  }
}
