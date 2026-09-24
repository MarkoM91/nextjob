/**
 * Begins a social sign-in. NextJOB mints a one-time state token (with a PKCE
 * verifier where the provider supports it), stores it in a short-lived signed
 * cookie, and redirects the browser to the provider's consent screen.
 * Nothing is written to the account store until the callback verifies the code.
 */

import { buildAuthorizeUrl, findSocialProvider, providerCredentials } from "../../../../../lib/auth-providers";
import { authSecret, createOAuthStateToken, oauthStateCookie, randomToken, safeReturnPath, sha256Base64Url } from "../../../../../lib/auth-session";
import { clientKey, rateLimit } from "../../../../../lib/security";
import { callbackRedirectUri, signInErrorRedirect } from "../../shared";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const limit = rateLimit(`auth-start:${clientKey(request)}`, 20);
  if (!limit.allowed) return signInErrorRedirect(request, "Too many sign-in attempts. Try again in a minute.");

  const { provider: providerId } = await params;
  const provider = findSocialProvider(providerId);
  if (!provider) return signInErrorRedirect(request, "That sign-in provider is not available.");

  const secret = authSecret();
  if (!secret) return signInErrorRedirect(request, "Sign-in is not configured on this server yet.");

  const credentials = providerCredentials(provider.id);
  if (!credentials) return signInErrorRedirect(request, `${provider.name} sign-in is not configured on this server yet.`);

  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));
  const state = randomToken();
  const nonce = randomToken(16);
  const codeVerifier = provider.pkce ? randomToken(48) : null;
  const codeChallenge = codeVerifier ? await sha256Base64Url(codeVerifier) : null;

  const authorizeUrl = buildAuthorizeUrl(provider, {
    clientId: credentials.clientId,
    redirectUri: callbackRedirectUri(request, provider.id),
    state,
    nonce,
    codeChallenge,
  });

  const stateToken = await createOAuthStateToken({ provider: provider.id, state, codeVerifier, nonce, returnTo }, secret);
  return new Response(null, { status: 302, headers: { location: authorizeUrl, "set-cookie": oauthStateCookie(stateToken, request), "cache-control": "no-store" } });
}
