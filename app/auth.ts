/**
 * The one place that answers "who is signed in?".
 *
 * Two identity sources are supported and checked in order:
 *   1. A NextJOB session cookie, issued by social sign-in or an email/password
 *      account and signed with AUTH_SECRET.
 *   2. The hosted ChatGPT identity headers, when NextJOB runs inside a
 *      dispatch that authenticates the user upstream.
 *
 * Everything else in the app reads identity through `getCurrentUser`, so
 * private document keys, matches, and applications stay owner-scoped
 * regardless of which sign-in the person used.
 */

import { headers } from "next/headers";
import { getChatGPTUser } from "./chatgpt-auth";
import { authSecret, guestFromCookieHeader, guestSessionCookie, guestUser, randomToken, sessionFromCookieHeader, type AuthProviderId, type SessionUser } from "../lib/auth-session";

export type AppUser = SessionUser;
export type { AuthProviderId };

export async function getCurrentUser(): Promise<AppUser | null> {
  const requestHeaders = await headers();
  const session = await sessionFromCookieHeader(requestHeaders.get("cookie"));
  if (session) return session;

  const guest = await guestFromCookieHeader(requestHeaders.get("cookie"));
  if (guest) return guest;
  const chatgpt = await getChatGPTUser();
  if (chatgpt) return { id: chatgpt.id, email: chatgpt.email, fullName: chatgpt.fullName, displayName: chatgpt.displayName, provider: "chatgpt", picture: null };
  return guestFromCookieHeader(requestHeaders.get("cookie"));
}

/** Identity for a route handler that already holds the Request. */
export async function userFromRequest(request: Request): Promise<AppUser | null> {
  const session = await sessionFromCookieHeader(request.headers.get("cookie"));
  if (session) return session;
  const guest = await guestFromCookieHeader(request.headers.get("cookie"));
  if (guest) return guest;
  return getCurrentUser();
}

/** Returns an authenticated user or mints one isolated signed guest workspace. */
export async function ensureGuestUser(request: Request): Promise<{ user: AppUser | null; setCookie?: string }> {
  const current = await userFromRequest(request);
  if (current) return { user: current };
  if (!authSecret()) return { user: null };
  const user = guestUser(`guest_${randomToken(18)}`);
  const setCookie = await guestSessionCookie(user.id, request);
  return setCookie ? { user, setCookie } : { user: null };
}
