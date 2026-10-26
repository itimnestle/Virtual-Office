import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Guards for SQL patterns that are correct but were found to be slow. They read
 * the migrations as text, so they run without a database.
 */
const dir = path.resolve(__dirname, "../../supabase/migrations");
const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

function latestDefinition(fn: string): string {
  for (const file of [...migrations].reverse()) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    const start = sql.search(new RegExp(`create (or replace )?function ${fn.replace(".", "\\.")}\\(`));
    if (start >= 0) return sql.slice(start, sql.indexOf("$$;", start));
  }
  throw new Error(`${fn} not found`);
}

describe("migration performance guards", () => {
  it("task_directory computes the access check once per row (no flattened LATERAL)", () => {
    const body = latestDefinition("public.task_directory");
    // Without "offset 0" the planner inlines the subquery and re-runs
    // can_view_task() for every reference to v.ok (≈20× per row).
    expect(body).toMatch(/cross join lateral \(select private\.can_view_task\(t\.id\) as ok offset 0\) v/);
  });
});
