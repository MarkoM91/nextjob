import { env } from "cloudflare:workers";
import { z } from "zod";
import { candidate } from "../../../../lib/demo-data";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";

const MAX_FILE_SIZE = Number(process.env.CV_MAX_BYTES ?? 10 * 1024 * 1024);
const allowedTypes = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);
const allowedExtensions = new Set(["pdf", "docx", "txt"]);
const fileNameSchema = z.string().min(1).max(180).regex(/^[^\\/:*?\"<>|]+$/);

async function scanForMalware(bytes: ArrayBuffer): Promise<{ clean: true; engine: string }> {
  if (bytes.byteLength === 0) throw new Error("Empty file");
  return { clean: true, engine: "demo-scan-hook-v1" };
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`cv:${clientKey(request)}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Upload limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const form = await request.formData();
  const file = form.get("cv");
  const consent = form.get("aiProcessingConsent") === "true";
  if (!(file instanceof File) || !consent) return Response.json({ error: "A CV and explicit AI-processing consent are required" }, { status: 400 });
  const parsedName = fileNameSchema.safeParse(file.name);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!parsedName.success || !allowedTypes.has(file.type) || !allowedExtensions.has(extension)) return Response.json({ error: "Unsupported file. Use PDF, DOCX, or TXT." }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return Response.json({ error: "The CV must be between 1 byte and 10 MB." }, { status: 413 });
  const bytes = await file.arrayBuffer();
  const scan = await scanForMalware(bytes);
  const objectKey = `private/demo-user/cv/${crypto.randomUUID()}.${extension}`;
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  if (storage) await storage.put(objectKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { ownerId: "demo-user", scanEngine: scan.engine } });
  return Response.json({ id: crypto.randomUUID(), status: "completed", objectKey: storage ? objectKey : null, scan, profile: candidate, demoMode: !storage }, { status: 201 });
}
