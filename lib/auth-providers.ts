/**
 * Social sign-in providers. Each one is plain OAuth 2.0 authorization-code:
 * NextJOB redirects to the provider, receives a one-time code, exchanges it
 * server-side for an access token, and reads the verified profile. Only the
 * profile fields shown here are stored; access tokens are discarded after use.
 *
 * A provider is enabled by `AUTH_<PROVIDER>_CLIENT_ID` and
 * `AUTH_<PROVIDER>_CLIENT_SECRET`. Nothing is offered until both are present.
 */

export type SocialProviderId = "google" | "linkedin" | "github" | "microsoft" | "facebook";

export type SocialProfile = {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  picture: string | null;
};

export type SocialProvider = {
  id: SocialProviderId;
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Proof Key for Code Exchange; sent when the provider accepts it. */
  pkce: boolean;
  extraAuthParams?: Record<string, string>;
  fetchProfile(accessToken: string): Promise<SocialProfile>;
};

export type SocialProviderSummary = { id: SocialProviderId; name: string };

const USER_AGENT = "NextJOB (job application assistant)";

async function readJson<T>(url: string, accessToken: string, extraHeaders: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "user-agent": USER_AGENT, ...extraHeaders } });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return response.json() as Promise<T>;
}

function requireEmail(email: string | null | undefined, providerName: string): string {
  const value = email?.trim().toLowerCase();
  if (!value || !value.includes("@")) throw new AuthProviderError("email-missing", `${providerName} did not share an email address for this account`);
  return value;
}

export type AuthProviderErrorCode = "email-missing" | "email-unverified" | "token-exchange" | "profile";

export class AuthProviderError extends Error {
  readonly code: AuthProviderErrorCode;
  constructor(code: AuthProviderErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type GoogleUser = { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
type LinkedInUser = { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
type GitHubUser = { id: number; login: string; name?: string | null; email?: string | null; avatar_url?: string };
type GitHubEmail = { email: string; primary: boolean; verified: boolean };
type MicrosoftUser = { id: string; displayName?: string; mail?: string | null; userPrincipalName?: string };
type FacebookUser = { id: string; name?: string; email?: string; picture?: { data?: { url?: string } } };

export const SOCIAL_PROVIDERS: SocialProvider[] = [
  {
    id: "google",
    name: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "profile"],
    pkce: true,
    extraAuthParams: { access_type: "online", prompt: "select_account" },
    async fetchProfile(accessToken) {
      const user = await readJson<GoogleUser>("https://openidconnect.googleapis.com/v1/userinfo", accessToken);
      return { providerUserId: user.sub, email: requireEmail(user.email, "Google"), emailVerified: user.email_verified !== false, fullName: user.name ?? null, picture: user.picture ?? null };
    },
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "email"],
    pkce: false,
    async fetchProfile(accessToken) {
      const user = await readJson<LinkedInUser>("https://api.linkedin.com/v2/userinfo", accessToken);
      return { providerUserId: user.sub, email: requireEmail(user.email, "LinkedIn"), emailVerified: user.email_verified !== false, fullName: user.name ?? null, picture: user.picture ?? null };
    },
  },
  {
    id: "github",
    name: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "user:email"],
    pkce: false,
    async fetchProfile(accessToken) {
      const headers = { "x-github-api-version": "2022-11-28" };
      const user = await readJson<GitHubUser>("https://api.github.com/user", accessToken, headers);
      // The public profile email is optional; the verified primary address is authoritative.
      const emails = await readJson<GitHubEmail[]>("https://api.github.com/user/emails", accessToken, headers).catch(() => [] as GitHubEmail[]);
      const primary = emails.find((entry) => entry.primary && entry.verified) ?? emails.find((entry) => entry.verified);
      return { providerUserId: String(user.id), email: requireEmail(primary?.email ?? user.email, "GitHub"), emailVerified: Boolean(primary), fullName: user.name?.trim() || user.login || null, picture: user.avatar_url ?? null };
    },
  },
  {
    id: "microsoft",
    name: "Microsoft",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["openid", "email", "profile", "User.Read"],
    pkce: true,
    async fetchProfile(accessToken) {
      const user = await readJson<MicrosoftUser>("https://graph.microsoft.com/v1.0/me", accessToken);
      return { providerUserId: user.id, email: requireEmail(user.mail ?? user.userPrincipalName, "Microsoft"), emailVerified: true, fullName: user.displayName ?? null, picture: null };
    },
  },
  {
    id: "facebook",
    name: "Facebook",
    authorizeUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scopes: ["email", "public_profile"],
    pkce: false,
    async fetchProfile(accessToken) {
      const user = await readJson<FacebookUser>("https://graph.facebook.com/v19.0/me?fields=id,name,email,picture.type(large)", accessToken);
      return { providerUserId: user.id, email: requireEmail(user.email, "Facebook"), emailVerified: true, fullName: user.name ?? null, picture: user.picture?.data?.url ?? null };
    },
  },
];

export function providerCredentials(id: SocialProviderId): { clientId: string; clientSecret: string } | null {
  const prefix = `AUTH_${id.toUpperCase()}`;
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function findSocialProvider(id: string): SocialProvider | null {
  return SOCIAL_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

/** Providers with credentials present, in display order. */
export function configuredSocialProviders(): SocialProviderSummary[] {
  return SOCIAL_PROVIDERS.filter((provider) => providerCredentials(provider.id)).map(({ id, name }) => ({ id, name }));
}

export function buildAuthorizeUrl(provider: SocialProvider, input: { clientId: string; redirectUri: string; state: string; nonce: string; codeChallenge: string | null }): string {
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", input.state);
  if (provider.scopes.includes("openid")) url.searchParams.set("nonce", input.nonce);
  if (input.codeChallenge) {
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [key, value] of Object.entries(provider.extraAuthParams ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

/** Exchanges the one-time code for an access token. The token never leaves the server. */
export async function exchangeCode(provider: SocialProvider, input: { code: string; redirectUri: string; clientId: string; clientSecret: string; codeVerifier: string | null }): Promise<string> {
  const body = new URLSearchParams({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, client_id: input.clientId, client_secret: input.clientSecret });
  if (input.codeVerifier) body.set("code_verifier", input.codeVerifier);
  const response = await fetch(provider.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": USER_AGENT }, body });
  const payload = await response.json().catch(() => null) as { access_token?: string; error?: string; error_description?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new AuthProviderError("token-exchange", payload?.error_description || payload?.error || `${provider.name} rejected the sign-in code (${response.status})`);
  }
  return payload.access_token;
}
