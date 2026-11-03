import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorMessage, callbackUrl, emailSchema, registrationSchema } from "./validation";
import { parseAppMode } from "../config/mode";

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
  const valid = { email: "synthetic@feuerwehr-odenthal.de", password: "SyntheticTest!123", displayName: " Synthetic Test ", role: "GLOBAL_ADMIN" };
  const result = registrationSchema.parse(valid);
  assert.equal(result.displayName, "Synthetic Test");
  assert.equal("role" in result, false);
  assert.equal(registrationSchema.safeParse({ ...valid, password: "short" }).success, false);
});
test("callback always stays inside the application; user next URLs are not used", () => {
  const result = new URL(callbackUrl("https://n00b31.github.io"));
  assert.equal(result.origin, "https://n00b31.github.io");
  assert.match(result.pathname, /\/auth\/callback\/$/);
  assert.equal(result.search, "");
});
test("mail limits and unauthorized recipients have actionable errors without echoing secrets", () => {
  assert.match(authErrorMessage({ code: "over_email_send_rate_limit", status: 429 }), /Limit|limit/);
  assert.match(authErrorMessage({ code: "email_address_not_authorized" }), /nicht autorisiert/);
  assert.match(authErrorMessage({ code: "email_not_confirmed" }), /verifizieren/);
  assert.doesNotMatch(authErrorMessage(new Error("secret-credentials")), /secret-credentials/);
});
