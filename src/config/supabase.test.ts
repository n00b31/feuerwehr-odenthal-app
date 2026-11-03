import assert from "node:assert/strict";
import test from "node:test";
import { getSupabasePublicConfig, parseSupabasePublicConfig } from "./supabase";

const fixture = { url: "https://configurationtestonly.supabase.co/", publishableKey: "sb_publishable_synthetic_test_value" };

test("Supabase configuration is optional and does not replace the demo repository", () => {
  assert.deepEqual(parseSupabasePublicConfig({}), { status: "not-configured" });
  assert.deepEqual(parseSupabasePublicConfig({ url: "", publishableKey: "" }), { status: "not-configured" });
});
test("public configuration accepts a hosted project URL and publishable key", () => {
  assert.deepEqual(parseSupabasePublicConfig(fixture), { ...fixture, status: "configured", url: fixture.url.slice(0, -1) });
});
test("partial configuration fails explicitly", () => {
  assert.throws(() => parseSupabasePublicConfig({ url: fixture.url }), /gemeinsam/);
  assert.throws(() => parseSupabasePublicConfig({ publishableKey: fixture.publishableKey }), /gemeinsam/);
});
test("secret and legacy JWT keys are rejected without including them in errors", () => {
  for (const key of ["sb_secret_synthetic_test_value", "eyJhbGci.synthetic.signature", "invalid value"]) {
    assert.throws(() => parseSupabasePublicConfig({ ...fixture, publishableKey: key }), (error: unknown) =>
      error instanceof Error && !error.message.includes(key) && error.message.includes("sb_publishable_"));
  }
});
test("URLs with credentials, HTTP, misleading hosts, paths or query data are rejected", () => {
  for (const url of ["http://example.supabase.co", "https://example.supabase.co.evil.test", "https://name:password@example.supabase.co", "https://example.supabase.co/auth", "https://example.supabase.co?token=value"]) {
    assert.throws(() => parseSupabasePublicConfig({ ...fixture, url }), /Projekt-HTTPS-URL/);
  }
});
test("environment reader uses only the two explicit public variables", () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = fixture.url;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = fixture.publishableKey;
    assert.equal(getSupabasePublicConfig().status, "configured");
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
