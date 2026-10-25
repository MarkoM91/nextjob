import { languagePreference, resolveLocale } from "../../../lib/i18n";
export async function GET(request: Request) {
  const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? request.headers.get("x-nextjob-country") ?? request.headers.get("cf-ipcountry");
  const detected = resolveLocale({ preference: languagePreference(request.headers.get("cookie") ?? ""), country, acceptLanguage: request.headers.get("accept-language") });
  return Response.json({ ...detected, preference: languagePreference(request.headers.get("cookie") ?? "") }, {
    headers: { "cache-control": "private, no-store", "vary": "Accept-Language, CF-IPCountry, Cookie" },
  });
}
