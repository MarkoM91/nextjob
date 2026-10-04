import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureGuestUser } from "../../../auth";
import { readStoredResume, resumeProfileKey, safeOwnerId, type StoredResumeProfile } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { candidateFromReactiveResume, reactiveResumeConfiguration, ReactiveResumeApiError } from "../../../../lib/reactive-resume";
import { CV_PARSER_VERSION, CvParserError, directCvParserConfigured, parseCv } from "../../../../lib/cv-parser";

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
  if ((extension === "pdf") !== (file.type === "application/pdf")) return Response.json({ error: "The file type does not match its extension." }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return Response.json({ error: "The CV must be between 1 byte and 10 MB." }, { status: 413 });
  const bytes = await file.arrayBuffer();
  if (!hasExpectedSignature(bytes, extension)) return Response.json({ error: "The file contents do not match its PDF or DOCX extension." }, { status: 415 });

  const provider = reactiveResumeConfiguration();
  if (!provider.configured && !directCvParserConfigured()) return Response.json({ error: "CV processing is temporarily unavailable. Please try again later.", code: "PROVIDER_NOT_CONFIGURED" }, { status: 503 });

  const ownerId = safeOwnerId(user.id);
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  if (!storage) return Response.json({ error: "Private document storage is not available.", code: "DOCUMENT_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  const sourceHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  const previous = await readStoredResume(storage, ownerId).catch(() => null);
  const headers = new Headers({ "cache-control": "private, no-store" });
  if (setCookie) headers.set("set-cookie", setCookie);
  // Identical uploads preserve reviewed corrections, search choices and the selected design.
  if (previous?.sourceHash === sourceHash && (previous.verifiedAt || previous.parserVersion === CV_PARSER_VERSION)) return Response.json({ status: "completed", profile: previous.profile, parsingProvider: previous.provider, reused: true, demoMode: false }, { headers });
  const objectKey = `private/${ownerId}/cv/${crypto.randomUUID()}.${extension}`;
  try {
    await storage.put(objectKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { ownerId, validation: "signature-and-type-v1" } });
    const imported = await parseCv(bytes, file.name, file.type);
    const profile = candidateFromReactiveResume(imported.content, ownerId);
    if (!profile.facts.length) throw new ReactiveResumeApiError("The CV did not contain enough structured information to review", 422, "EMPTY_PROFILE");
    const stored: StoredResumeProfile = { provider: imported.provider, externalResumeId: imported.resumeId, sourceHash, parserVersion: CV_PARSER_VERSION, parsedAt: new Date().toISOString(), preferredTemplate: previous?.preferredTemplate, content: imported.content, profile };
    await storage.put(resumeProfileKey(ownerId), new TextEncoder().encode(JSON.stringify(stored)), { httpMetadata: { contentType: "application/json" }, customMetadata: { ownerId, provider: stored.provider, externalResumeId: imported.resumeId ?? "" } });
    return Response.json({ id: crypto.randomUUID(), status: "completed", objectKey, profile, parsingProvider: stored.provider, providerConfigured: true, parsedAt: stored.parsedAt, demoMode: false }, { status: 201, headers });
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    const requestId = crypto.randomUUID();
    if (error instanceof ReactiveResumeApiError || error instanceof CvParserError) console.error("[cv-upload] résumé processing failed", { requestId, status: error.status, code: error.code });
    else console.error("[cv-upload] résumé processing failed", { requestId, code: "PARSING_FAILED" });
    const unreadable = (error instanceof ReactiveResumeApiError || error instanceof CvParserError) && error.status === 422;
    const message = unreadable ? "We couldn't read this CV. Check that it isn't password-protected, or try a PDF or DOCX copy with readable text." : "We couldn't finish processing your CV right now. Your selected file is still here. Please try again.";
    const code = error instanceof ReactiveResumeApiError || error instanceof CvParserError ? error.code : "PARSING_FAILED";
    return Response.json({ error: message, code, requestId }, { status: unreadable ? 422 : 502, headers });
  }
}
