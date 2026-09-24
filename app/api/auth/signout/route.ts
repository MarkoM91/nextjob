/**
 * Ends the session by expiring the cookie. A hosted ChatGPT identity is not
 * NextJOB's to revoke, so that sign-out is handed back to the dispatch route.
 */

import { chatGPTSignOutPath } from "../../../chatgpt-auth";
import { clearSessionCookie, safeReturnPath, sessionFromCookieHeader } from "../../../../lib/auth-session";
import { assertSameOrigin } from "../../../../lib/security";
import { redirectTo } from "../shared";

async function signOut(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"), "/");
  const hadSession = await sessionFromCookieHeader(request.headers.get("cookie"));
  const headers = new Headers({ "set-cookie": clearSessionCookie(request) });
  if (!hadSession) return redirectTo(request, chatGPTSignOutPath(returnTo), headers);
  return redirectTo(request, returnTo, headers);
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  return signOut(request);
}

export async function GET(request: Request) {
  return signOut(request);
}
