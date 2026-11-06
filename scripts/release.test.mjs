import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRelease, writeRelease } from "./release.mjs";
import { verifyPages } from "./verify-pages-release.mjs";

const gitSha = "a".repeat(40);
test("release binds full checkout SHA to workflow and gives every build a distinct identity", () => {
  const env = { GITHUB_SHA: gitSha, GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2", NEXT_PUBLIC_APP_MODE: "supabase-dev" };
  const release = createRelease({ gitSha }, env);
  assert.equal(release.gitSha, gitSha);
  assert.equal(release.runId, "123");
  assert.equal(release.runAttempt, "2");
  assert.notEqual(createRelease({ gitSha }, env).buildId, release.buildId);
  assert.throws(() => createRelease({ gitSha }, { GITHUB_SHA: "b".repeat(40) }), /checked-out/);
  assert.throws(() => createRelease({ gitSha, sourceDirty: true }, { GITHUB_ACTIONS: "true" }), /uncommitted/);
  assert.equal(createRelease({ gitSha, sourceDirty: true }, {}).sourceDirty, true);
  assert.throws(() => createRelease({ gitSha: "short" }, {}), /full Git/);
});
test("release generation rejects invalid mode/base path and stamps worker, manifest and public metadata consistently", async () => {
  assert.throws(() => createRelease({ gitSha }, { NEXT_PUBLIC_APP_MODE: "production" }), /mode/);
  assert.throws(() => createRelease({ gitSha }, { NEXT_PUBLIC_BASE_PATH: "/../other" }), /base path/);
  const directory = await mkdtemp(path.join(tmpdir(), "ff-release-"));
  try {
    const release = createRelease({ gitSha }, {});
    await writeFile(path.join(directory, "sw.js"), 'const CACHE = "__FF_RELEASE__";');
    await writeFile(path.join(directory, "manifest.webmanifest"), JSON.stringify({ id: "/app/", description: "DEV" }));
    await writeRelease(directory, release);
    assert.match(await readFile(path.join(directory, "sw.js"), "utf8"), new RegExp(release.buildId));
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, "release.json"), "utf8")), release);
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.webmanifest"), "utf8"));
    assert.equal(manifest.id, "/app/");
    assert.ok(manifest.description.includes(release.buildId));
    await assert.rejects(writeRelease(directory, release), /placeholder/);
  } finally { await rm(directory, { recursive: true }); }
});
test("published proof checks the expected artifact identity and every served file, not just a green deployment", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ff-pages-proof-"));
  try {
    const release = createRelease({ gitSha }, {});
    const files = new Map([["release.json", JSON.stringify(release)], ["index.html", "<html>DEV</html>"], ["app.js", "verified"]]);
    for (const [name, body] of files) await writeFile(path.join(directory, name), body);
    const url = "https://n00b31.github.io/feuerwehr-odenthal-app/";
    const request = async (target) => {
      assert.ok(target.searchParams.has("_ff_verify"));
      return new Response(files.get(target.pathname.slice("/feuerwehr-odenthal-app/".length) || "index.html"));
    };
    assert.equal((await verifyPages(directory, url, release.buildId, gitSha, request)).files, 3);
    await assert.rejects(verifyPages(directory, url, "older-build", gitSha, request), /expected clean/);
    await assert.rejects(verifyPages(directory, url, release.buildId, gitSha, async () => new Response("stale")), /differs/);
    await assert.rejects(verifyPages(directory, "https://n00b31.github.io/feuerwehr-odenthal-demo/", release.buildId, gitSha, request), /target/);
  } finally { await rm(directory, { recursive: true }); }
});
