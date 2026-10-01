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
const request = (params = "") => worker.fetch(new Request(`http://localhost/api/matches?includeIneligible=true${params}`, { headers: { cookie: `nextjob_guest=${token}`, accept: "application/json" } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });

test("initial matches use the verified CV city and include nearby towns", async () => {
  const response = await request();
  assert.equal(response.status, 200);
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
    const payload = await (await request()).json();
    assert.deepEqual(payload.matches.map((match) => match.job.id), ["milan", "monza", "remote-italy", "remote-eu"]);
  } finally { postings.splice(4); }
});
