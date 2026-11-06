import { test } from "node:test";
import assert from "node:assert/strict";
import { readAvailableRelease, releaseSchema, releaseUrl } from "./release";

const current = releaseSchema.parse({
  format: 1, version: "DEV 0.3.4.1", buildId: "current", gitSha: "a".repeat(40), sourceDirty: false,
  mode: "supabase-dev", basePath: "/feuerwehr-odenthal-app", builtAt: "2026-11-06T15:00:00Z",
  repository: "n00b31/feuerwehr-odenthal-app", runId: "123", runAttempt: "1",
});
test("release comparison accepts future versions, retries and intentional rollbacks, not foreign applications", () => {
  assert.equal(readAvailableRelease(current, current), null);
  assert.equal(readAvailableRelease({ ...current, buildId: "next", version: "DEV 0.4" }, current)?.buildId, "next");
  for (const change of [{ repository: "n00b31/feuerwehr-odenthal-demo" }, { mode: "demo" }, { basePath: "/other" }]) {
    assert.throws(() => readAvailableRelease({ ...current, ...change }, current), /dieser Anwendung/);
  }
  assert.throws(() => readAvailableRelease({ version: "broken" }, current));
});
test("controlled release navigation preserves route, existing query and fragment without accumulating version parameters", () => {
  const result = new URL(releaseUrl("https://n00b31.github.io/feuerwehr-odenthal-app/termine/?filter=test&_ff_release=old#main", "new"));
  assert.equal(result.pathname, "/feuerwehr-odenthal-app/termine/");
  assert.equal(result.searchParams.get("filter"), "test");
  assert.deepEqual(result.searchParams.getAll("_ff_release"), ["new"]);
  assert.equal(result.hash, "#main");
});
