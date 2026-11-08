import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorMessage, callbackUrl, emailSchema, passwordPairSchema, recoveryUrl, registrationSchema } from "./validation";
import { readAuthCallback } from "./callback";
import { parseAppMode } from "../config/mode";
import { accessSchema } from "../data/supabase-repository";

test("DEV is the default and invalid modes never select the demo", () => {
  assert.equal(parseAppMode(), "supabase-dev");
  assert.equal(parseAppMode("demo"), "demo");
  assert.throws(() => parseAppMode("production"));
});
test("registration accepts only the exact fire department domain", () => {
  assert.equal(emailSchema.safeParse("test@FEUERWEHR-ODENTHAL.DE").success, true);
  for (const email of ["test@example.test", "test@sub.feuerwehr-odenthal.de", "test@feuerwehr-odenthal.de.evil.test", "x@@feuerwehr-odenthal.de"]) {
    assert.equal(emailSchema.safeParse(email).success, false);
  }
});
test("registration validates display name and password without assigning roles", () => {
  const valid = { email: "synthetic@feuerwehr-odenthal.de", password: "SyntheticTest!123", passwordConfirmation: "SyntheticTest!123", displayName: " Synthetic Test ", role: "GLOBAL_ADMIN" };
  const result = registrationSchema.parse(valid);
  assert.equal(result.displayName, "Synthetic Test");
  assert.equal("role" in result, false);
  assert.equal(registrationSchema.safeParse({ ...valid, password: "short" }).success, false);
});
test("password confirmation is exact, never trimmed and covers both registration and recovery", () => {
  const input = { password: "SyntheticTest!123", passwordConfirmation: "SyntheticTest!123" };
  assert.equal(passwordPairSchema.safeParse(input).success, true);
  for (const passwordConfirmation of ["", "SyntheticTest!124", " SyntheticTest!123", "SyntheticTest!123 "]) {
    assert.equal(passwordPairSchema.safeParse({ ...input, passwordConfirmation }).success, false);
  }
  for (const length of [1, 11, 129]) {
    assert.equal(passwordPairSchema.safeParse({ password: "x".repeat(length), passwordConfirmation: "x".repeat(length) }).success, false);
  }
  for (const length of [12, 128]) {
    assert.equal(passwordPairSchema.safeParse({ password: "x".repeat(length), passwordConfirmation: "x".repeat(length) }).success, true);
  }
});
test("recovery callback requires a credential, rejects wrong OTP types and preserves the PKCE flow ID", () => {
  const url = new URL(recoveryUrl("https://n00b31.github.io"));
  assert.match(url.pathname, /\/auth\/recovery\/$/);
  assert.equal(readAuthCallback(url).kind, "invalid");
  url.search = "?token_hash=synthetic-hash&type=recovery&next=https://evil.test";
  assert.deepEqual(readAuthCallback(url), { kind: "hash", token: "synthetic-hash" });
  url.searchParams.set("type", "signup");
  assert.equal(readAuthCallback(url).kind, "invalid");
  url.search = "?code=synthetic-code&sb_flow_id=synthetic-flow";
  assert.deepEqual(readAuthCallback(url), { kind: "pkce", code: "synthetic-code", flowId: "synthetic-flow", recovery: true });
  url.hash = "#access_token=synthetic";
  assert.equal(readAuthCallback(url).kind, "invalid");
});
test("callback always stays inside the application; user next URLs are not used", () => {
  const result = new URL(callbackUrl("https://n00b31.github.io"));
  assert.equal(result.origin, "https://n00b31.github.io");
  assert.match(result.pathname, /\/auth\/callback\/$/);
  assert.equal(result.search, "");
});
test("credential-bearing fallback routes are rejected rather than silently ignored", () => {
  for (const suffix of ["?code=synthetic-code", "?token_hash=synthetic-hash", "#access_token=synthetic", "#refresh_token=synthetic"]) {
    assert.equal(readAuthCallback(new URL(`https://example.test/not-a-callback${suffix}`)).kind, "invalid");
  }
  assert.equal(readAuthCallback(new URL("https://example.test/not-a-callback")).kind, "none");
});
test("mail limits and unauthorized recipients have actionable errors without echoing secrets", () => {
  assert.match(authErrorMessage({ code: "over_email_send_rate_limit", status: 429 }), /Limit|limit/);
  assert.match(authErrorMessage({ code: "email_address_not_authorized" }), /nicht autorisiert/);
  assert.match(authErrorMessage({ code: "email_not_confirmed" }), /verifizieren/);
  assert.doesNotMatch(authErrorMessage(new Error("secret-credentials")), /secret-credentials/);
});
test("invalid or inconsistent server access responses do not unlock the UI", () => {
  const base = {
    user_id: "10000000-0000-4000-8000-000000000001", display_name: "Synthetic",
    account_status: "pending", access_granted: false, unit_id: null, unit_name: null, roles: [],
  };
  assert.equal(accessSchema.safeParse(base).success, true);
  assert.equal(accessSchema.safeParse({ ...base, access_granted: true }).success, false);
  assert.equal(accessSchema.safeParse({ ...base, account_status: "approved", access_granted: true }).success, false);
  assert.equal(accessSchema.safeParse({ ...base, roles: ["INVENTED_ADMIN"] }).success, false);
  assert.equal(accessSchema.safeParse({ ...base, account_status: "approved", access_granted: true,
    unit_id: "20000000-0000-4000-8000-000000000001", unit_name: "Scheuren", roles: ["MEMBER"] }).success, true);
});
