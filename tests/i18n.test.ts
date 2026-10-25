import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, languagePreference, preferredLanguages, resolveLocale } from "../lib/i18n.ts";
import { catalogs, translate } from "../lib/ui-translations.ts";

test("country selects the interface independently of device language", () => {
  assert.equal(resolveLocale({country: "IT", acceptLanguage: "en-US,en;q=0.9"}).locale, "it");
  assert.equal(resolveLocale({country: "FR", acceptLanguage: "it"}).locale, "fr");
  assert.equal(resolveLocale({country: "DE"}).locale, "de");
  assert.equal(resolveLocale({country: "BR"}).locale, "pt");
});
test("manual preference wins over country, including travel", () => {
  assert.equal(resolveLocale({preference: "en", country: "IT", acceptLanguage: "it"}).locale, "en");
  assert.equal(resolveLocale({preference: "it", country: "DE"}).source, "manual");
  assert.equal(resolveLocale({preference: "auto", country: "ES"}).locale, "es");
});
test("multilingual countries respect supported device preferences", () => {
  assert.equal(resolveLocale({country: "CH", acceptLanguage: "it-IT,fr;q=0.8,de;q=0.5"}).locale, "it");
  assert.equal(resolveLocale({country: "BE", acceptLanguage: "en,fr;q=0.9,nl;q=0.8"}).locale, "fr");
  assert.equal(resolveLocale({country: "CA", acceptLanguage: "fr-CA,en;q=0.8"}).locale, "fr");
});
test("unsupported countries and invalid inputs safely fall back", () => {
  assert.equal(resolveLocale({country: "JP", acceptLanguage: "ja,en;q=0.8"}).locale, "en");
  assert.equal(resolveLocale({country: "XX", acceptLanguage: "pl-PL"}).locale, "pl");
  assert.equal(resolveLocale({country: "<script>", preference: "__proto__"}).locale, "en");
  assert.equal(resolveLocale({country: "IT", preference: "constructor"}).locale, "it");
  assert.deepEqual(preferredLanguages("it;q=0,fr;q=0.8,de;q=0.9,en;q=oops"), ["de","fr"]);
});
test("cookie parsing cannot mistake another cookie for a language override", () => {
  assert.equal(languagePreference("a=1; nextjob_language=it; b=2"), "it");
  assert.equal(languagePreference("other_nextjob_language=it"), "auto");
  assert.equal(languagePreference("nextjob_language=__proto__"), "auto");
});
test("all supported catalogs contain the same UI keys and placeholders", () => {
  const keys = Object.keys(catalogs.en).sort();
  for (const {code} of LANGUAGES) {
    assert.deepEqual(Object.keys(catalogs[code]).sort(), keys, code);
    for (const key of keys) {
      assert.ok(catalogs[code][key].trim(), `${code}: ${key}`);
      assert.deepEqual([...catalogs[code][key].matchAll(/\{\d+\}/g)].map(x=>x[0]).sort(), [...key.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort(), `${code}: ${key}`);
    }
  }
});
test("translation substitutes values without translating names, skills, or markup", () => {
  assert.equal(translate("it", "Job matches"), "Offerte per te");
  assert.equal(translate("it", "Within {0} km of {1}", {0: 50, 1: "Milano"}).includes("Milano"), true);
  assert.equal(translate("fr", "Unknown company name"), "Unknown company name");
  assert.ok(translate("de", "Near {0}", {0: "$& <script>"}).includes("$& <script>"));
  assert.equal(translate("en", " View job "), " View job ");
});
