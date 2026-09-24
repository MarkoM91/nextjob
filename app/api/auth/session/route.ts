/**
 * Who is signed in, and which sign-in methods this server can actually offer.
 * The browser uses this to render the account menu and the social buttons, so
 * it never advertises a provider that has no credentials configured.
 */

import { configuredSocialProviders } from "../../../../lib/auth-providers";
import { authSecret } from "../../../../lib/auth-session";
import { userFromRequest } from "../../../auth";

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  const providers = authSecret() ? configuredSocialProviders() : [];
  return Response.json({
    signedIn: Boolean(user),
    user: user ? { email: user.email, displayName: user.displayName, fullName: user.fullName, provider: user.provider, picture: user.picture } : null,
    providers,
    passwordEnabled: Boolean(authSecret()),
    // `/signin-with-chatgpt` is served by the hosting dispatch, not by this app.
    // Offering it where it does not exist sends people to a dead end, so it is
    // advertised only when the deployment says it is wired up.
    chatgptEnabled: process.env.AUTH_CHATGPT_ENABLED === "true",
  }, { headers: { "cache-control": "private, no-store" } });
}
