import { translate } from "../../../lib/ui-translations";
import { parseCookies } from "../../../lib/auth-session";
import { resolveLocale } from "../../../lib/i18n";
const escape = (value: string) => value.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!);
// GET never changes consent: email link scanners cannot verify or unsubscribe people.
export function tokenPage(title: string, action: string, token: string, status = 200, request?: Request) {
  const locale = resolveLocale({ preference: parseCookies(request?.headers.get("cookie")).nextjob_language, acceptLanguage: request?.headers.get("accept-language") }).locale;
  const t = (key: string) => escape(translate(locale, key));
  return new Response(`<!doctype html><html lang="${locale}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NextJOB</title><style>body{font:17px/1.6 system-ui;color:#183a34;background:#f5f6f1;margin:0;padding:32px}main{max-width:520px;margin:10vh auto;background:white;padding:32px;border:1px solid #d4ddd9;border-radius:12px}button,a{color:#0d7162}button{background:#0d7162;color:white;border:0;border-radius:8px;padding:14px;font:inherit}h1{font-size:26px}</style><main><strong>NextJOB</strong><h1>${t(title)}</h1>${action ? `<form method="post"><input type="hidden" name="token" value="${escape(token)}"><button>${t(action)}</button></form>` : ""}<p><a href="/notifications">${t("Back to notifications")}</a></p></main></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}
