import { authSecret, base64UrlDecode, base64UrlEncode } from "./auth-session";

export class PlayError extends Error { constructor(public code: string, public status = 503) { super(code); } }
export type PlayPurchase = {
  purchaseStateContext?: { purchaseState?: string }; purchaseCompletionTime?: string; orderId?: string;
  obfuscatedExternalAccountId?: string; obfuscatedExternalProfileId?: string; testPurchaseContext?: unknown;
  productLineItem?: Array<{ productId?: string; productOfferDetails?: { quantity?: number; refundableQuantity?: number; consumptionState?: string; purchaseOptionId?: string; rentOfferDetails?: unknown; preorderOfferDetails?: unknown } }>;
};
export const playPackage = () => process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || "com.markom91.nextjob";
export const playProduct = () => process.env.GOOGLE_PLAY_CV_PRODUCT_ID?.trim() || "tailored_cv_download";
export const playOption = () => process.env.GOOGLE_PLAY_PURCHASE_OPTION_ID?.trim() || "download";
export function playConfigured() { return Boolean(authSecret() && process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.GOOGLE_PLAY_PRIVATE_KEY?.trim()); }
export function playSalesReady() { return playConfigured() && ["test", "live"].includes(process.env.GOOGLE_PLAY_BILLING_MODE ?? ""); }
export function billingCapableApp(agent: string) {
  const match = agent.match(/NextJOBAndroid\/(\d+)\.(\d+)\.(\d+)/);
  return Boolean(match && (Number(match[1]) > 0 || Number(match[2]) > 1 || Number(match[2]) === 1 && Number(match[3]) >= 2));
}
export async function playAccountId(owner: string) {
  const secret = authSecret(); if (!secret) throw new PlayError("PLAY_BILLING_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`nextjob:play:workspace:v1:${owner}`))));
}
let cached: { identity: string; token: string; expires: number } | undefined;
async function accessToken() {
  const email = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL?.trim();
  const pem = process.env.GOOGLE_PLAY_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!email || !pem) throw new PlayError("PLAY_BILLING_NOT_CONFIGURED");
  const identity = email + pem;
  if (cached?.identity === identity && cached.expires > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const bytes = base64UrlDecode(pem.replace(/-----[A-Z ]+-----|\s/g, ""));
  if (!bytes) throw new PlayError("PLAY_BILLING_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey("pkcs8", bytes as BufferSource, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = base64UrlEncode(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }), signal: AbortSignal.timeout(10000) });
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) throw new PlayError("PLAY_VERIFICATION_UNAVAILABLE");
  cached = { identity, token: body.access_token, expires: Date.now() + Math.min(body.expires_in ?? 3600, 3600) * 1000 };
  return cached.token;
}
async function google(path: string, method = "GET") {
  const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(playPackage())}/${path}`, { method, headers: { authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new PlayError(response.status === 404 || response.status === 410 ? "PLAY_PURCHASE_NOT_FOUND" : "PLAY_VERIFICATION_UNAVAILABLE", response.status === 404 || response.status === 410 ? 409 : 503);
  return response;
}
export async function getPlayPurchase(token: string): Promise<PlayPurchase> { return (await google(`purchases/productsv2/tokens/${encodeURIComponent(token)}`)).json(); }
export async function consumePlayPurchase(product: string, token: string) { await google(`purchases/products/${encodeURIComponent(product)}/tokens/${encodeURIComponent(token)}:consume`, "POST"); }

/** Tokens are bearer credentials. Store encrypted, with a purpose separate from contacts. */
async function tokenKey() {
  const secret = authSecret(); if (!secret) throw new PlayError("PLAY_BILLING_NOT_CONFIGURED");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nextjob:play:token:v1:${secret}`));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealPlayToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(), new TextEncoder().encode(token));
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(bytes))}`;
}
export async function openPlayToken(value: string) {
  const [iv, bytes] = value.split(".").map(base64UrlDecode);
  if (!iv || !bytes) throw new PlayError("PLAY_VERIFICATION_UNAVAILABLE");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, await tokenKey(), bytes as BufferSource));
}
