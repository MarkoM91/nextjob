/**
 * Account records in Cloudflare D1. A user has one row in `users` and any
 * number of `user_identities` (one per social provider) plus, optionally, one
 * password credential. Identities are matched by provider subject first and
 * by verified email second, so a person who signs in with Google today and
 * LinkedIn tomorrow lands in the same workspace.
 *
 * When the database binding is absent (local previews without migrations),
 * social sign-in still works with a provider-scoped id, and password accounts
 * are refused with a clear error instead of being faked.
 */

import type { SocialProfile, SocialProviderId } from "./auth-providers";

export type AccountRecord = { id: string; email: string; displayName: string | null };

export type AuthStoreErrorCode = "store-unavailable" | "email-taken" | "invalid-credentials" | "weak-password";

export class AuthStoreError extends Error {
  readonly code: AuthStoreErrorCode;
  constructor(code: AuthStoreErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type UserRow = { id: string; email: string; display_name: string | null };
type CredentialRow = { user_id: string; email: string; display_name: string | null; password_hash: string; salt: string; iterations: number };

const PBKDF2_ITERATIONS = 210_000;
export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 200;

function newId(): string {
  return crypto.randomUUID();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Stable id used when no database is bound: the provider's own subject, namespaced. */
export function providerScopedUserId(provider: SocialProviderId, providerUserId: string): string {
  return `${provider}_${providerUserId}`.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120);
}

export async function findOrCreateSocialUser(db: D1Database | undefined, provider: SocialProviderId, profile: SocialProfile): Promise<AccountRecord> {
  const fallback: AccountRecord = { id: providerScopedUserId(provider, profile.providerUserId), email: profile.email, displayName: profile.fullName };
  if (!db) return fallback;
  try {
    const linked = await db.prepare("SELECT u.id, u.email, u.display_name FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.provider_user_id = ? AND u.deleted_at IS NULL").bind(provider, profile.providerUserId).first<UserRow>();
    if (linked) {
      await db.prepare("UPDATE user_identities SET email = ?, display_name = ?, avatar_url = ?, last_sign_in_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_user_id = ?").bind(profile.email, profile.fullName, profile.picture, provider, profile.providerUserId).run();
      if (!linked.display_name && profile.fullName) await db.prepare("UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(profile.fullName, linked.id).run();
      return { id: linked.id, email: linked.email, displayName: linked.display_name ?? profile.fullName };
    }
    // Only a verified address may attach a new provider to an existing account.
    const existing = profile.emailVerified ? await db.prepare("SELECT id, email, display_name FROM users WHERE email = ? AND deleted_at IS NULL").bind(profile.email).first<UserRow>() : null;
    const userId = existing?.id ?? newId();
    const statements: D1PreparedStatement[] = [];
    if (!existing) statements.push(db.prepare("INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").bind(userId, profile.email, profile.fullName));
    statements.push(db.prepare("INSERT INTO user_identities (id, user_id, provider, provider_user_id, email, display_name, avatar_url, last_sign_in_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").bind(newId(), userId, provider, profile.providerUserId, profile.email, profile.fullName, profile.picture));
    await db.batch(statements);
    return { id: userId, email: existing?.email ?? profile.email, displayName: existing?.display_name ?? profile.fullName };
  } catch (error) {
    console.warn(`[auth] account store unavailable, using provider-scoped identity: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16));
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return toHex(bits);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) throw new AuthStoreError("weak-password", `Use at least ${PASSWORD_MIN_LENGTH} characters`);
  if (password.length > PASSWORD_MAX_LENGTH) throw new AuthStoreError("weak-password", `Use at most ${PASSWORD_MAX_LENGTH} characters`);
}

function requireDb(db: D1Database | undefined): D1Database {
  if (!db) throw new AuthStoreError("store-unavailable", "Email and password accounts need the account database, which is not configured on this server. Use a social sign-in instead.");
  return db;
}

export async function registerPasswordUser(db: D1Database | undefined, input: { email: string; password: string; fullName: string | null }): Promise<AccountRecord> {
  const store = requireDb(db);
  validatePassword(input.password);
  const email = normalizeEmail(input.email);
  try {
    const existing = await store.prepare("SELECT id FROM users WHERE email = ? AND deleted_at IS NULL").bind(email).first<{ id: string }>();
    if (existing) throw new AuthStoreError("email-taken", "An account with this email already exists. Sign in instead, or use the same social provider you used before.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePasswordHash(input.password, salt, PBKDF2_ITERATIONS);
    const userId = newId();
    await store.batch([
      store.prepare("INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").bind(userId, email, input.fullName),
      store.prepare("INSERT INTO user_credentials (id, user_id, password_hash, salt, iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").bind(newId(), userId, hash, toHex(salt), PBKDF2_ITERATIONS),
    ]);
    return { id: userId, email, displayName: input.fullName };
  } catch (error) {
    if (error instanceof AuthStoreError) throw error;
    throw new AuthStoreError("store-unavailable", `The account database is not ready: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function verifyPasswordUser(db: D1Database | undefined, input: { email: string; password: string }): Promise<AccountRecord> {
  const store = requireDb(db);
  const email = normalizeEmail(input.email);
  let row: CredentialRow | null;
  try {
    row = await store.prepare("SELECT c.user_id, u.email, u.display_name, c.password_hash, c.salt, c.iterations FROM user_credentials c JOIN users u ON u.id = c.user_id WHERE u.email = ? AND u.deleted_at IS NULL").bind(email).first<CredentialRow>();
  } catch (error) {
    throw new AuthStoreError("store-unavailable", `The account database is not ready: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Hash even when the account is missing so timing does not reveal which emails exist.
  const salt = row ? fromHex(row.salt) : crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(input.password, salt, row?.iterations ?? PBKDF2_ITERATIONS);
  if (!row || !constantTimeEqual(hash, row.password_hash)) throw new AuthStoreError("invalid-credentials", "That email and password do not match.");
  return { id: row.user_id, email: row.email, displayName: row.display_name };
}
