import { CV_DOWNLOAD_PRICE_CENTS } from "./payment";

export type PaidSession = { id?: string; created?: number; status?: string; payment_status?: string; mode?: string; amount_total?: number; currency?: string; metadata?: { ownerId?: string; jobId?: string; doc?: string } };
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,140}$/.test(value);
const key = (ownerId: string, jobId: string) => `private/${ownerId}/purchases/${jobId}.json`;

export function isPaidCvSession(session: PaidSession | null): boolean {
  return Boolean(session && session.payment_status === "paid" && session.status === "complete" && session.mode === "payment" && session.currency === "eur" && session.amount_total === CV_DOWNLOAD_PRICE_CENTS && session.metadata?.doc === "cv" && validId(session.metadata.ownerId) && validId(session.metadata.jobId));
}

/** Replaying the same Stripe event cannot extend the access period. */
export async function recordCvPurchase(storage: R2Bucket, session: PaidSession): Promise<void> {
  if (!isPaidCvSession(session) || !session.id || !session.created) throw new Error("Invalid paid CV session");
  const ownerId = session.metadata!.ownerId!;
  const jobId = session.metadata!.jobId!;
  const expiresAt = (session.created + 7 * 86400) * 1000;
  const existing = await storage.get(key(ownerId, jobId)) as { json<T>(): Promise<T> } | null;
  if (existing) {
    const previous = await existing.json<{ expiresAt?: number }>();
    if ((previous.expiresAt ?? 0) >= expiresAt) return;
  }
  await storage.put(key(ownerId, jobId), new TextEncoder().encode(JSON.stringify({ ownerId, jobId, sessionId: session.id, expiresAt })), { httpMetadata: { contentType: "application/json" } });
}

export async function hasCvPurchase(storage: R2Bucket | undefined, ownerId: string, jobId: string): Promise<boolean> {
  if (!storage || !validId(ownerId) || !validId(jobId)) return false;
  const object = await storage.get(key(ownerId, jobId)) as { json<T>(): Promise<T> } | null;
  if (!object) return false;
  const record = await object.json<{ ownerId: string; jobId: string; expiresAt: number }>();
  return record.ownerId === ownerId && record.jobId === jobId && record.expiresAt > Date.now();
}

export async function verifyStripeSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const parts = signature.split(",").map(part => part.trim().split("="));
  const timestamp = parts.find(([name]) => name === "t")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  for (const [name, hex] of parts) {
    if (name !== "v1" || !/^[a-f0-9]{64}$/i.test(hex ?? "")) continue;
    const bytes = Uint8Array.from(hex.match(/../g) ?? [], value => parseInt(value, 16));
    if (await crypto.subtle.verify("HMAC", signingKey, bytes, encoder.encode(`${timestamp}.${body}`))) return true;
  }
  return false;
}
