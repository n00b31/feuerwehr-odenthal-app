import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("DEV export guard permits SDK format checks but rejects secret values and synthetic builds", () => {
  const script = resolve("scripts", "check-dev-export.mjs");
  const directory = mkdtempSync(join(tmpdir(), "ff-export-policy-"));
  try {
    mkdirSync(join(directory, "out"));
    function check(content: string, mode = "supabase-dev") {
      writeFileSync(join(directory, "out", "bundle.js"), content);
      return spawnSync(process.execPath, [script], { cwd: directory, env: { ...process.env, NEXT_PUBLIC_APP_MODE: mode }, encoding: "utf8" });
    }
    assert.equal(check('key.startsWith("sb_secret_") || key.startsWith("sb_publishable_")').status, 0);
    for (const value of ["sb_secret_SYNTHETIC_TEST_VALUE_NOT_REAL", "sb_publishable_SYNTHETIC_CI_ONLY", "https://syntheticci.supabase.co"]) {
      const result = check(JSON.stringify(value));
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Non-publishable/);
      assert.equal(result.stderr.includes(value), false);
    }
    assert.notEqual(check("plain static content", "demo").status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
