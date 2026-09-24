/**
 * Completes a social sign-in. The state cookie must match the state the
 * provider echoed back, which is what stops a forged callback from signing
 * anyone in. The one-time code is exchanged server-side, the verified profile
 * is linked to a NextJOB account, and a signed session cookie is issued.
 */

import { env } from "cloudflare:workers";
import { AuthProviderError, exchangeCode, findSocialProvider, providerCredentials } from "../../../../../lib/auth-providers";
import { authSecret, clearOAuthStateCookie, createSessionToken, OAUTH_STATE_COOKIE, parseCookies, readOAuthStateToken, safeReturnPath, sessionCookie } from "../../../../../lib/auth-session";
import { findOrCreateSocialUser } from "../../../../../lib/auth-users";
import { databaseFromEnvironment } from "../../../../../lib/job-store";
import { clientKey, rateLimit } from "../../../../../lib/security";
import { authErrorMessage, callbackRedirectUri, redirectTo, signInErrorRedirect } from "../../shared";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const limit = rateLimit(`auth-callback:${clientKey(request)}`, 20);
  if (!limit.allowed) return signInErrorRedirect(request, "Too many sign-in attempts. Try again in a minute.");

  const clearState = clearOAuthStateCookie(request);
  const { provider: providerId } = await params;
  const provider = findSocialProvider(providerId);
  if (!provider) return signInErrorRedirect(request, "That sign-in provider is not available.", { "set-cookie": clearState });

  const secret = authSecret();
  const credentials = providerCredentials(provider.id);
  if (!secret || !credentials) return signInErrorRedirect(request, `${provider.name} sign-in is not configured on this server yet.`, { "set-cookie": clearState });

  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  if (providerError) {
    const description = url.searchParams.get("error_description");
    // A cancelled consent screen is a normal outcome, not a failure worth alarming about.
    const message = providerError === "access_denied" ? `${provider.name} sign-in was cancelled.` : `${provider.name} refused the sign-in: ${description || providerError}`;
    return signInErrorRedirect(request, message, { "set-cookie": clearState });
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const stored = await readOAuthStateToken(parseCookies(request.headers.get("cookie"))[OAUTH_STATE_COOKIE], secret);
  if (!code || !returnedState || !stored || stored.provider !== provider.id || stored.state !== returnedState) {
    return signInErrorRedirect(request, "That sign-in link has expired or was already used. Please try again.", { "set-cookie": clearState });
  }

  try {
    const accessToken = await exchangeCode(provider, {
      code,
      redirectUri: callbackRedirectUri(request, provider.id),
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      codeVerifier: stored.codeVerifier,
    });
    const profile = await provider.fetchProfile(accessToken);
    if (!profile.emailVerified) throw new AuthProviderError("email-unverified", `Verify your email address with ${provider.name} first, then sign in again.`);

    const account = await findOrCreateSocialUser(databaseFromEnvironment(env), provider.id, profile);
    const token = await createSessionToken({
      id: account.id,
      email: account.email,
      fullName: account.displayName ?? profile.fullName,
      displayName: account.displayName || profile.fullName || account.email,
      provider: provider.id,
      picture: profile.picture,
    }, secret);

    // Two separate Set-Cookie headers: one issues the session, one drops the state cookie.
    const headers = new Headers({ "cache-control": "no-store" });
    headers.append("set-cookie", sessionCookie(token, request));
    headers.append("set-cookie", clearState);
    return redirectTo(request, safeReturnPath(stored.returnTo), headers);
  } catch (error) {
    return signInErrorRedirect(request, authErrorMessage(error, `${provider.name} sign-in could not be completed. Please try again.`), { "set-cookie": clearState });
  }
}
