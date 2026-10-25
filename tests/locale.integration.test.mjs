import test from "node:test";
import assert from "node:assert/strict";
const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url));
const send = request => worker.fetch(request, {ASSETS: {fetch: async () => new Response(null, {status: 404})}}, {waitUntil() {}, passThroughOnException() {}});
test("locale endpoint uses the network country without asking for GPS", async () => {
  const request = new Request("http://localhost/api/locale", {headers: {"accept-language": "en-US", "cf-ipcountry": "FR"}});
  Object.defineProperty(request, "cf", {value: {country: "IT"}});
  const response = await send(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {locale: "it", country: "IT", source: "country", preference: "auto"});
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  assert.match(response.headers.get("vary"), /Cookie/);
  assert.equal(response.headers.get("set-cookie"), null);
});
test("saved language overrides network location and invalid values fall back", async () => {
  for (const [cookie, expected] of [["nextjob_language=de", "de"], ["nextjob_language=auto", "it"], ["nextjob_language=__proto__", "it"]]) {
    const response = await send(new Request("http://localhost/api/locale", {headers: {cookie, "cf-ipcountry": "IT", "accept-language": "fr"}}));
    assert.equal((await response.json()).locale, expected);
  }
});
test("locale endpoint safely falls back when country is unavailable", async () => {
  const response = await send(new Request("http://localhost/api/locale", {headers: {"accept-language": "es-ES,en;q=0.8"}}));
  assert.equal((await response.json()).locale, "es");
});
