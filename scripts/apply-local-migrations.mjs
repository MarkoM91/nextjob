/**
 * Applies the Drizzle migrations to the local Miniflare D1 database that
 * `npm run dev` uses, so features backed by tables (accounts, sign-in) work
 * against a real database during development.
 *
 * Production databases are migrated by the hosting control plane; this script
 * deliberately touches only the local `.wrangler/state` file.
 */

import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const D1_STATE_DIR = join(".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
const MIGRATIONS_DIR = "drizzle";

function findLocalDatabase() {
  if (!existsSync(D1_STATE_DIR)) return null;
  const candidates = readdirSync(D1_STATE_DIR).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  return candidates.length === 1 ? join(D1_STATE_DIR, candidates[0]) : null;
}

const databasePath = findLocalDatabase();
if (!databasePath) {
  console.error(`No local D1 database found in ${D1_STATE_DIR}. Start the dev server once (npm run dev) so it is created, then run this again.`);
  process.exit(1);
}

const migrations = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
const db = new DatabaseSync(databasePath);
let applied = 0;
let skipped = 0;

for (const migration of migrations) {
  const statements = readFileSync(join(MIGRATIONS_DIR, migration), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    try {
      db.exec(statement);
      applied += 1;
    } catch (error) {
      // Re-running is expected: only an object that already exists may be skipped.
      if (/already exists/i.test(String(error.message))) {
        skipped += 1;
        continue;
      }
      console.error(`${migration}: ${error.message}`);
      process.exit(1);
    }
  }
}

const tables = db.prepare("SELECT count(*) AS total FROM sqlite_master WHERE type = 'table'").get();
db.close();
console.log(`Local D1 ready: ${applied} statement(s) applied, ${skipped} already present, ${tables.total} tables in ${databasePath}`);
