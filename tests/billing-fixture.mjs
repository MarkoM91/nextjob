import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

/** Execute real SQLite SQL, including unique indexes and atomic D1 batches. */
export function billingDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  const prepare = (query) => {
    let values = [];
    return {
      bind(...input) { values = input; return this; },
      async first(column) { const row = sqlite.prepare(query).get(...values) ?? null; return column ? row?.[column] ?? null : row; },
      async all() { return { success: true, results: sqlite.prepare(query).all(...values) }; },
      async run() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
      execute() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
  };
  return { sqlite, prepare, async batch(statements) { sqlite.exec("BEGIN IMMEDIATE"); try { const results = statements.map((statement) => statement.execute()); sqlite.exec("COMMIT"); return results; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
}
