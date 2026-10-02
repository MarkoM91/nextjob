import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { candidate, jobs } from "../lib/demo-data.ts";
import { createGuestToken } from "../lib/auth-session.ts";

process.env.AUTH_SECRET = "location-tests-private-secret-123456789";
process.env.NEXTJOB_DISABLE_LIVE_JOBS = "true";
const { default: worker } = await import("../dist/server/index.js");
const ownerId = "guest_locationtestsabcdefghijkl";
const token = await createGuestToken(ownerId, process.env.AUTH_SECRET);
const profile = { ...candidate, location: "Milan, Italy", preferences: { ...candidate.preferences, relocation: true } };
const postings = [
  ["milan", "Milano", "Italy", "IT"],
  ["monza", "Monza", "Italy", "IT"],
  ["rome", "Roma", "Italy", "IT"],
  ["paris", "Paris", "France", "FR"],
].map(([id, city, country, countryCode]) => ({ ...jobs[0], id, city, country, countryCode, locationText: `${city}, ${country}`, providerId: "user-import", workplace: "On-site", publishedAt: new Date().toISOString() }));
env.DOCUMENTS = { get: async (key) => {
  const content = key === `private/${ownerId}/profile/latest.json` ? { profile, verifiedAt: new Date().toISOString() }
    : key === `private/${ownerId}/imported-jobs/index.json` ? { jobs: postings } : null;
  return content ? { text: async () => JSON.stringify(content) } : null;
} };
const request = (params = "", includeIneligible = true) => worker.fetch(new Request(`http://localhost/api/matches?includeIneligible=${includeIneligible}${params}`, { headers: { cookie: `nextjob_guest=${token}`, accept: "application/json" } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });

test("a selected nearby radius uses the verified CV city and includes nearby towns", async () => {
  const response = await request("&scope=nearby");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const payload = await response.json();
  assert.equal(payload.near.name, "Milano");
  assert.equal(payload.filters.radiusKm, 50);
  assert.equal(payload.filters.sort, "distance");
  assert.deepEqual(payload.matches.map((match) => match.job.id), ["milan", "monza"]);
  assert.equal(payload.matches[0].distanceKm, 0);
  assert.ok(payload.matches[1].distanceKm > 0 && payload.matches[1].distanceKm < 50);
});

test("Anywhere explicitly widens the search and another city overrides the CV", async () => {
  const wide = await (await request("&scope=anywhere")).json();
  assert.equal(wide.near, null);
  assert.equal(wide.filters.radiusKm, 0);
  assert.equal(wide.matches.length, 4);
  const rome = await (await request("&scope=nearby&area=Roma&radius=25")).json();
  assert.equal(rome.near.name, "Roma");
  assert.deepEqual(rome.matches.map((match) => match.job.id), ["rome"]);
});

test("an unknown location does not silently fall back to Milan, and bad coordinates are rejected", async () => {
  const unknown = await (await request("&location=Unknownville&scope=nearby")).json();
  assert.equal(unknown.near, null);
  assert.equal(unknown.matches.length, 0);
  const unknownArea = await (await request("&area=Unknownville&scope=nearby")).json();
  assert.equal(unknownArea.matches.length, 0);
  for (const near of ["200,9", "45,", "45,9,10"]) assert.equal((await request(`&near=${encodeURIComponent(near)}`)).status, 400);
});

test("local searches do not treat foreign remote work as zero kilometres from Milan", async () => {
  const remote = { ...postings[0], workplace: "Remote" };
  postings.push({ ...remote, id: "remote-italy", company: "Italy remote employer" }, { ...remote, id: "remote-eu", company: "EU remote employer", countryCode: "EU" }, { ...remote, id: "remote-canada", company: "Canada remote employer", countryCode: "CA", country: "Canada" });
  try {
    const payload = await (await request("&scope=nearby")).json();
    assert.deepEqual(payload.matches.map((match) => match.job.id), ["milan", "monza", "remote-italy", "remote-eu"]);
  } finally { postings.splice(4); }
});

test("default feed orders Milan, Northern Italy, Italy, then Europe and never worldwide jobs", async () => {
  const beforeRelocation = profile.preferences.relocation;
  profile.preferences.relocation = false;
  postings.push(
    { ...postings[0], id: "turin", city: "Torino", locationText: "Torino, Piemonte", company: "Northern employer" },
    { ...postings[0], id: "berlin", city: "Berlin", country: "Germany", countryCode: "DE", locationText: "Berlin", company: "European employer" },
    { ...postings[0], id: "us", city: "New York", country: "United States", countryCode: "US", locationText: "New York", workplace: "Remote", company: "US employer" },
  );
  try {
    const payload = await (await request("", false)).json();
    assert.equal(payload.filters.radiusKm, 0, "the default ranks nearby first without discarding wider areas");
    assert.deepEqual(payload.matches.slice(0, 4).map((match) => match.job.id), ["milan", "monza", "turin", "rome"]);
    assert.deepEqual(payload.matches.slice(0, 4).map((match) => match.searchRegion), ["nearby", "nearby", "north-italy", "home-country"]);
    assert.deepEqual(new Set(payload.matches.slice(4).map((match) => match.job.id)), new Set(["paris", "berlin"]));
    assert.equal(payload.matches.some((match) => match.job.id === "us"), false);
    assert.equal(payload.matches.every((match) => match.eligible), true);
    const page = await (await request("&limit=2")).json();
    const next = await (await request(`&limit=2&cursor=${page.nextCursor}`)).json();
    assert.deepEqual(next.matches.map((match) => match.job.id), ["turin", "rome"]);
  } finally { postings.splice(4); profile.preferences.relocation = beforeRelocation; }
});

test("country selection overrides the old city, radius and stored geographic preferences", async () => {
  const beforeRelocation = profile.preferences.relocation;
  profile.preferences.relocation = false;
  try {
    const payload = await (await request("&country=FR&scope=regional&area=Milano&near=45.46,9.19&radius=50", false)).json();
    assert.equal(payload.near, null);
    assert.equal(payload.filters.radiusKm, 0);
    assert.deepEqual(payload.matches.map((match) => match.job.id), ["paris"]);
    assert.equal(payload.matches[0].eligible, true);
  } finally { profile.preferences.relocation = beforeRelocation; }
});

test("a help desk search rejects Toronto remote counsel and unrelated European leadership roles", async () => {
  const originalFetch = globalThis.fetch;
  process.env.NEXTJOB_DISABLE_LIVE_JOBS = "false";
  const timestamp = new Date().toISOString();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("boards-api.greenhouse.io")) return Response.json({ jobs: [
      { id: "helpdesk", title: "Help Desk Technician", content: "Help desk, Windows 11 and Networking. Full-time IT support.", location: { name: "Milano, Italy" }, absolute_url: "https://example.test/jobs/helpdesk", updated_at: timestamp },
      { id: "legal", title: "Senior Legal Counsel", content: "Legal advice to help desk teams. Networking with company leadership.", location: { name: "Toronto, Canada (Remote)" }, absolute_url: "https://example.test/jobs/legal", updated_at: timestamp },
      { id: "director", title: "Director of Marketing", content: "Help desk collaboration and Networking. Marketing leadership.", location: { name: "Berlin, Germany (Remote)" }, absolute_url: "https://example.test/jobs/director", updated_at: timestamp },
    ] });
    if (url.includes("api.lever.co")) return Response.json([]);
    if (url.includes("personio")) return new Response("<workzag-jobs></workzag-jobs>");
    return Response.json({ jobs: [], data: [], content: [], results: [] });
  };
  try {
    for (const scope of ["regional", "nearby"]) {
      const response = await request(`&q=help%20desk&scope=${scope}`, false);
      const payload = await response.json();
      assert.ok(payload.matches.some((match) => match.job.title === "Help Desk Technician"), "the genuine help desk posting remains visible");
      assert.equal(payload.matches.some((match) => /Legal Counsel|Director of Marketing/.test(match.job.title)), false);
      assert.equal(payload.matches.every((match) => scope === "nearby" ? match.job.countryCode === "IT" : match.job.countryCode !== "CA"), true);
    }
  } finally { globalThis.fetch = originalFetch; process.env.NEXTJOB_DISABLE_LIVE_JOBS = "true"; }
});
