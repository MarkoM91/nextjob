import assert from "node:assert/strict";
import test from "node:test";
import { authSecret, base64UrlDecode, base64UrlEncode, clearSessionCookie, createOAuthStateToken, createSessionToken, parseCookies, readOAuthStateToken, readSessionToken, safeReturnPath, serializeCookie, sessionFromCookieHeader, sha256Base64Url, signPayload, verifyPayload, type SessionUser } from "../lib/auth-session.ts";
import { buildAuthorizeUrl, configuredSocialProviders, findSocialProvider, providerCredentials, SOCIAL_PROVIDERS } from "../lib/auth-providers.ts";
import { normalizeEmail, providerScopedUserId, registerPasswordUser, validatePassword, verifyPasswordUser, AuthStoreError } from "../lib/auth-users.ts";

const SECRET = "test-secret-value-at-least-16-chars";
const user: SessionUser = { id: "user-1", email: "candidate@example.com", fullName: "Marco Rossi", displayName: "Marco Rossi", provider: "google", picture: null };

test("base64url survives a round trip without padding characters", () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
  const encoded = base64UrlEncode(bytes);
  assert.doesNotMatch(encoded, /[+/=]/);
  assert.deepEqual([...(base64UrlDecode(encoded) ?? [])], [...bytes]);
});

test("a signed session round-trips and carries the identity", async () => {
  const token = await createSessionToken(user, SECRET);
  const restored = await readSessionToken(token, SECRET);
  assert.equal(restored?.id, "user-1");
  assert.equal(restored?.email, "candidate@example.com");
  assert.equal(restored?.provider, "google");
});

test("a tampered or foreign-signed session is refused", async () => {
  const token = await createSessionToken(user, SECRET);
  const [body, signature] = token.split(".");
  const forgedBody = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ v: 1, ...user, id: "someone-else", iat: 1, exp: 4_000_000_000 })));
  assert.equal(await readSessionToken(`${forgedBody}.${signature}`, SECRET), null);
  assert.equal(await readSessionToken(token, "a-completely-different-secret"), null);
  assert.equal(await readSessionToken(`${body}.`, SECRET), null);
  assert.equal(await readSessionToken(null, SECRET), null);
});

test("an expired session is refused even though its signature is valid", async () => {
  const expired = await signPayload({ v: 1, ...user, iat: 1, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
  assert.equal(await verifyPayload(expired, SECRET) !== null, true);
  assert.equal(await readSessionToken(expired, SECRET), null);
});

test("sessions cannot be read when AUTH_SECRET is unset", async () => {
  const previous = process.env.AUTH_SECRET;
  delete process.env.AUTH_SECRET;
  assert.equal(authSecret(), null);
  const token = await createSessionToken(user, SECRET);
  assert.equal(await sessionFromCookieHeader(`nextjob_session=${token}`), null);
  process.env.AUTH_SECRET = SECRET;
  assert.equal(authSecret(), SECRET);
  assert.equal((await sessionFromCookieHeader(`nextjob_session=${encodeURIComponent(token)}`))?.id, "user-1");
  if (previous === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previous;
});

test("cookies are parsed and issued with the flags a session needs", () => {
  const cookies = parseCookies("a=1; nextjob_session=abc%20def; empty");
  assert.equal(cookies.a, "1");
  assert.equal(cookies.nextjob_session, "abc def");
  const secure = serializeCookie("nextjob_session", "value", { maxAge: 60, secure: true });
  assert.match(secure, /HttpOnly/);
  assert.match(secure, /SameSite=Lax/);
  assert.match(secure, /Secure/);
  assert.doesNotMatch(serializeCookie("nextjob_session", "value", { maxAge: 60, secure: false }), /Secure/);
  assert.match(clearSessionCookie(new Request("http://localhost/api/auth/signout")), /Max-Age=0/);
});

test("only same-site paths survive the return-to check", () => {
  assert.equal(safeReturnPath("/matches?country=it"), "/matches?country=it");
  assert.equal(safeReturnPath("https://evil.example/steal"), "/dashboard");
  assert.equal(safeReturnPath("//evil.example/steal"), "/dashboard");
  assert.equal(safeReturnPath("/api/auth/session"), "/dashboard");
  assert.equal(safeReturnPath("/sign-in"), "/dashboard");
  assert.equal(safeReturnPath(null), "/dashboard");
  assert.equal(safeReturnPath(undefined, "/upload"), "/upload");
});

test("oauth state expires and is bound to its provider", async () => {
  const token = await createOAuthStateToken({ provider: "google", state: "abc", codeVerifier: "verifier", nonce: "n", returnTo: "/matches" }, SECRET);
  const state = await readOAuthStateToken(token, SECRET);
  assert.equal(state?.provider, "google");
  assert.equal(state?.returnTo, "/matches");
  assert.equal(await readOAuthStateToken(token, "another-secret-entirely"), null);
  const stale = await signPayload({ provider: "google", state: "abc", codeVerifier: null, nonce: "n", returnTo: "/", exp: Math.floor(Date.now() / 1000) - 5 }, SECRET);
  assert.equal(await readOAuthStateToken(stale, SECRET), null);
});

test("every social provider declares a usable OAuth configuration", () => {
  assert.deepEqual(SOCIAL_PROVIDERS.map((provider) => provider.id), ["google", "linkedin", "github", "microsoft", "facebook"]);
  for (const provider of SOCIAL_PROVIDERS) {
    assert.equal(new URL(provider.authorizeUrl).protocol, "https:", provider.id);
    assert.equal(new URL(provider.tokenUrl).protocol, "https:", provider.id);
    assert.ok(provider.scopes.length > 0, provider.id);
  }
  assert.equal(findSocialProvider("google")?.name, "Google");
  assert.equal(findSocialProvider("myspace"), null);
});

test("a provider is offered only when both its credentials are present", () => {
  const previousId = process.env.AUTH_GOOGLE_CLIENT_ID;
  const previousSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET;
  delete process.env.AUTH_GOOGLE_CLIENT_ID;
  delete process.env.AUTH_GOOGLE_CLIENT_SECRET;
  assert.equal(providerCredentials("google"), null);
  assert.equal(configuredSocialProviders().some((provider) => provider.id === "google"), false);
  process.env.AUTH_GOOGLE_CLIENT_ID = "client-id";
  assert.equal(providerCredentials("google"), null, "an id without a secret is not enough");
  process.env.AUTH_GOOGLE_CLIENT_SECRET = "client-secret";
  assert.deepEqual(providerCredentials("google"), { clientId: "client-id", clientSecret: "client-secret" });
  assert.deepEqual(configuredSocialProviders().find((provider) => provider.id === "google"), { id: "google", name: "Google" });
  if (previousId === undefined) delete process.env.AUTH_GOOGLE_CLIENT_ID; else process.env.AUTH_GOOGLE_CLIENT_ID = previousId;
  if (previousSecret === undefined) delete process.env.AUTH_GOOGLE_CLIENT_SECRET; else process.env.AUTH_GOOGLE_CLIENT_SECRET = previousSecret;
});

test("the authorize URL carries state, scopes and PKCE where the provider supports it", async () => {
  const google = findSocialProvider("google")!;
  const challenge = await sha256Base64Url("verifier");
  const url = new URL(buildAuthorizeUrl(google, { clientId: "id", redirectUri: "https://app.example/api/auth/google/callback", state: "state-token", nonce: "nonce", codeChallenge: challenge }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "state-token");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.example/api/auth/google/callback");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.equal(url.searchParams.get("nonce"), "nonce");

  const github = findSocialProvider("github")!;
  const withoutPkce = new URL(buildAuthorizeUrl(github, { clientId: "id", redirectUri: "https://app.example/api/auth/github/callback", state: "s", nonce: "n", codeChallenge: null }));
  assert.equal(withoutPkce.searchParams.get("code_challenge"), null);
  assert.equal(withoutPkce.searchParams.get("nonce"), null, "GitHub is not an OpenID provider");
});

test("emails are normalized and provider ids stay filesystem-safe", () => {
  assert.equal(normalizeEmail("  Marco@Example.COM "), "marco@example.com");
  assert.equal(providerScopedUserId("google", "108/44:aa"), "google_108_44_aa");
});

test("password rules are enforced before anything is stored", () => {
  assert.throws(() => validatePassword("short"), /at least 12/);
  assert.doesNotThrow(() => validatePassword("a-long-enough-password"));
});

test("password accounts refuse to work without the account database", async () => {
  await assert.rejects(registerPasswordUser(undefined, { email: "a@b.com", password: "a-long-enough-password", fullName: null }), (error: unknown) => error instanceof AuthStoreError && error.code === "store-unavailable");
  await assert.rejects(verifyPasswordUser(undefined, { email: "a@b.com", password: "a-long-enough-password" }), (error: unknown) => error instanceof AuthStoreError && error.code === "store-unavailable");
});
