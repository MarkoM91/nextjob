/**
 * Cookie sessions signed with HMAC-SHA256 through Web Crypto, so they run
 * unchanged on Cloudflare Workers, Node tests, and the Vite dev server.
 * No session table is needed: the cookie carries the identity, the signature
 * proves NextJOB issued it, and expiry is enforced on every read.
 */

export type AuthProviderId = "google" | "linkedin" | "github" | "microsoft" | "facebook" | "password" | "chatgpt" | "guest";

export type SessionUser = {
  /** Stable NextJOB user id; owns every private document key. */
  id: string;
  email: string;
  fullName: string | null;
  displayName: string;
  provider: AuthProviderId;
  picture: string | null;
};

type SessionPayload = SessionUser & { v: 1; iat: number; exp: number };

export const SESSION_COOKIE = "nextjob_session";
export const OAUTH_STATE_COOKIE = "nextjob_oauth";
/** Signed browser workspace used before a person chooses to create an account. */
export const GUEST_COOKIE = "nextjob_guest";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60;
const STATE_TTL_SECONDS = 10 * 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

/** The signing secret. Sessions cannot be issued or read without it. */
export function authSecret(): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Serializes and signs any JSON payload as `<base64url body>.<base64url signature>`. */
export async function signPayload(payload: unknown, secret: string): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Returns the payload only when the signature matches; tampering yields null. */
export async function verifyPayload<T>(token: string | null | undefined, secret: string): Promise<T | null> {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const body = token.slice(0, separator);
  const signature = base64UrlDecode(token.slice(separator + 1));
  if (!signature) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), signature as BufferSource, encoder.encode(body));
  if (!valid) return null;
  const bytes = base64UrlDecode(body);
  if (!bytes) return null;
  try {
    return JSON.parse(decoder.decode(bytes)) as T;
  } catch {
    return null;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function createSessionToken(user: SessionUser, secret: string): Promise<string> {
  const iat = nowSeconds();
  const payload: SessionPayload = { v: 1, ...user, iat, exp: iat + SESSION_TTL_SECONDS };
  return signPayload(payload, secret);
}

export async function readSessionToken(token: string | null | undefined, secret: string): Promise<SessionUser | null> {
  const payload = await verifyPayload<SessionPayload>(token, secret);
  if (!payload || payload.v !== 1 || typeof payload.exp !== "number" || payload.exp <= nowSeconds()) return null;
  if (!payload.id || !payload.email || !payload.provider) return null;
  return { id: payload.id, email: payload.email, fullName: payload.fullName ?? null, displayName: payload.displayName || payload.email, provider: payload.provider, picture: payload.picture ?? null };
}

type GuestPayload = { v: 1; id: string; iat: number; exp: number };

/** The identity used for an anonymous workspace. It never contains CV data. */
export function guestUser(id: string): SessionUser {
  return { id, email: `${id}@guest.nextjob.local`, fullName: null, displayName: "Guest workspace", provider: "guest", picture: null };
}

export async function createGuestToken(id: string, secret: string): Promise<string> {
  const iat = nowSeconds();
  return signPayload({ v: 1, id, iat, exp: iat + GUEST_TTL_SECONDS } satisfies GuestPayload, secret);
}

export async function readGuestToken(token: string | null | undefined, secret: string): Promise<string | null> {
  const payload = await verifyPayload<GuestPayload>(token, secret);
  if (!payload || payload.v !== 1 || typeof payload.id !== "string" || !/^guest_[A-Za-z0-9_-]{20,180}$/.test(payload.id) || typeof payload.exp !== "number" || payload.exp <= nowSeconds()) return null;
  return payload.id;
}

export type OAuthState = { provider: string; state: string; codeVerifier: string | null; nonce: string; returnTo: string; exp: number };

export async function createOAuthStateToken(input: Omit<OAuthState, "exp">, secret: string): Promise<string> {
  return signPayload({ ...input, exp: nowSeconds() + STATE_TTL_SECONDS }, secret);
}

export async function readOAuthStateToken(token: string | null | undefined, secret: string): Promise<OAuthState | null> {
  const payload = await verifyPayload<OAuthState>(token, secret);
  if (!payload || typeof payload.exp !== "number" || payload.exp <= nowSeconds()) return null;
  return payload;
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = safeDecode(value);
  }
  return cookies;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Reads the signed-in user from a raw Cookie header, or null when absent, expired, or forged. */
export async function sessionFromCookieHeader(header: string | null | undefined): Promise<SessionUser | null> {
  const secret = authSecret();
  if (!secret) return null;
  return readSessionToken(parseCookies(header)[SESSION_COOKIE], secret);
}

/** Reads a signed guest workspace from a raw Cookie header. */
export async function guestFromCookieHeader(header: string | null | undefined): Promise<SessionUser | null> {
  const secret = authSecret();
  if (!secret) return null;
  const id = await readGuestToken(parseCookies(header)[GUEST_COOKIE], secret);
  return id ? guestUser(id) : null;
}

export function isSecureRequest(request: Request): boolean {
  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    return false;
  }
  return request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

export function serializeCookie(name: string, value: string, options: { maxAge: number; secure: boolean; sameSite?: "Lax" | "Strict" }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", `SameSite=${options.sameSite ?? "Lax"}`, `Max-Age=${options.maxAge}`];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookie(token: string, request: Request): string {
  return serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_SECONDS, secure: isSecureRequest(request) });
}

export async function guestSessionCookie(id: string, request: Request): Promise<string | null> {
  const secret = authSecret();
  if (!secret) return null;
  const token = await createGuestToken(id, secret);
  return serializeCookie(GUEST_COOKIE, token, { maxAge: GUEST_TTL_SECONDS, secure: isSecureRequest(request) });
}

export function clearSessionCookie(request: Request): string {
  return serializeCookie(SESSION_COOKIE, "", { maxAge: 0, secure: isSecureRequest(request) });
}

export function oauthStateCookie(token: string, request: Request): string {
  return serializeCookie(OAUTH_STATE_COOKIE, token, { maxAge: STATE_TTL_SECONDS, secure: isSecureRequest(request) });
}

export function clearOAuthStateCookie(request: Request): string {
  return serializeCookie(OAUTH_STATE_COOKIE, "", { maxAge: 0, secure: isSecureRequest(request) });
}

/** Only same-site relative paths survive; anything else returns the workspace home. */
export function safeReturnPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") return fallback;
    if (url.pathname.startsWith("/api/") || ["/sign-in", "/sign-up", "/forgot-password"].includes(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
