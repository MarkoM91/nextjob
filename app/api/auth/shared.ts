/** Helpers shared by the sign-in routes. */

import { AuthProviderError } from "../../../lib/auth-providers";
import { AuthStoreError } from "../../../lib/auth-users";

/**
 * The redirect URI registered with each provider. AUTH_PUBLIC_URL wins when set,
 * because a proxy or tunnel can make the request URL differ from the public one.
 */
export function callbackRedirectUri(request: Request, providerId: string): string {
  const configured = process.env.AUTH_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configured ? new URL(configured) : new URL(request.url);
  return new URL(`/api/auth/${providerId}/callback`, base.origin).toString();
}

function appOrigin(request: Request): string {
  const configured = process.env.AUTH_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

/** Accepts a Headers object so several Set-Cookie headers survive intact. */
function redirectResponse(location: string, extraHeaders: Headers | Record<string, string>): Response {
  const headers = extraHeaders instanceof Headers ? new Headers(extraHeaders) : new Headers(extraHeaders);
  headers.set("location", location);
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
}

/** Sends the browser back to the sign-in page with a message the UI can show. */
export function signInErrorRedirect(request: Request, message: string, extraHeaders: Headers | Record<string, string> = {}): Response {
  const target = new URL("/sign-in", appOrigin(request));
  target.searchParams.set("error", message.slice(0, 200));
  return redirectResponse(target.toString(), extraHeaders);
}

export function redirectTo(request: Request, path: string, extraHeaders: Headers | Record<string, string> = {}): Response {
  return redirectResponse(new URL(path, appOrigin(request)).toString(), extraHeaders);
}

/** Turns a known auth failure into a message worth showing, and hides everything else. */
export function authErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AuthProviderError || error instanceof AuthStoreError) return error.message;
  console.warn(`[auth] ${error instanceof Error ? error.message : String(error)}`);
  return fallback;
}
