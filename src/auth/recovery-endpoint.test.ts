import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createRecoveryHandler } from "../../supabase/functions/password-recovery/handler";

const id = "10000000-0000-4000-8000-000000000001";
const configuration = {
  url: "https://syntheticci.supabase.co", publicKey: "synthetic-public-only",
  serviceKey: "synthetic-server-only", recoveryUrl: "https://n00b31.github.io/feuerwehr-odenthal-app/auth/recovery/",
  allowedOrigins: ["https://n00b31.github.io"],
};
function fixture() {
  const calls: { path: string; body: unknown; authorization: string | null }[] = [];
  const reports: string[] = [];
  const state = { eligible: true, admin: true, authenticated: true, mailAccepted: true, intake: true, limited: false, mailTimeout: false, mailTransport: false,
    mailDelayMs: 0, verifier: "", claimable: true, grantUser: id };
  const fetcher: typeof fetch = async (resource, options) => {
    const url = new URL(String(resource));
    assert.equal(url.origin, configuration.url);
    const headers = new Headers(options?.headers);
    const body: unknown = options?.body ? JSON.parse(String(options.body)) : null;
    calls.push({ path: url.pathname, body, authorization: headers.get("authorization") });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.pathname === "/auth/v1/user") return json({ id }, state.authenticated ? 200 : 401);
    if (url.pathname.endsWith("ff_allow_self_recovery_request")) return json(state.intake);
    if (url.pathname.endsWith("ff_begin_admin_password_recovery") && !state.admin) return json({}, 403);
    if (url.pathname.includes("/ff_begin_")) return json({
      accepted: state.eligible && !state.limited, reason: state.limited ? "limited" : "ineligible",
      request_id: id, email: "synthetic@feuerwehr-odenthal.de",
    });
    if (url.pathname.endsWith("ff_store_recovery_verifier")) {
      assert(body && typeof body === "object" && "verifier" in body);
      state.verifier = String(body.verifier);
      assert.match(state.verifier, /^[A-Za-z0-9_-]{43}$/);
      return json(null);
    }
    if (url.pathname.endsWith("ff_claim_recovery_verifier")) {
      if (!state.claimable) return json(null);
      state.claimable = false;
      return json({ user_id: id, verifier: state.verifier });
    }
    if (url.pathname === "/auth/v1/token") {
      assert.equal(url.searchParams.get("grant_type"), "pkce");
      assert.deepEqual(body, { auth_code: "synthetic-auth-code", code_verifier: state.verifier });
      return json({ user: { id: state.grantUser }, access_token: "synthetic-access-only", refresh_token: "synthetic-refresh-only" });
    }
    if (url.pathname === "/auth/v1/recover") {
      const redirect = new URL(url.searchParams.get("redirect_to")!);
      assert.equal(redirect.origin + redirect.pathname, configuration.recoveryUrl);
      assert.equal(redirect.searchParams.get("recovery_request"), id);
      assert(body && typeof body === "object" && "code_challenge" in body);
      const expected = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state.verifier))).toString("base64url");
      assert.deepEqual(body, { email: "synthetic@feuerwehr-odenthal.de", code_challenge: expected, code_challenge_method: "s256" });
      if (state.mailDelayMs) await delay(state.mailDelayMs, undefined, { signal: options?.signal ?? undefined });
      if (state.mailTimeout) throw new DOMException("synthetic sensitive upstream detail", "TimeoutError");
      if (state.mailTransport) throw new TypeError("synthetic sensitive upstream detail");
      return json({}, state.mailAccepted ? 200 : 429);
    }
    if (url.pathname.endsWith("ff_finish_password_recovery")) return json(null);
    throw new Error(`Unexpected synthetic endpoint: ${url.pathname}`);
  };
  const handler = createRecoveryHandler(configuration, fetcher, (code) => reports.push(code));
  const send = (input: object, authenticated = false) => handler(new Request("https://synthetic.invalid", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://n00b31.github.io",
      ...(authenticated ? { authorization: "Bearer synthetic-user-only" } : {}) }, body: JSON.stringify(input),
  }));
  return { state, calls, reports, handler, send };
}

test("SMTP-paced Auth response after 10.3 seconds is awaited and recorded without a duplicate send", async () => {
  const f = fixture();
  f.state.mailDelayMs = 10_300;
  const response = await f.send({ mode: "self", email: "synthetic@feuerwehr-odenthal.de" });
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls.filter((call) => call.path.endsWith("ff_finish_password_recovery")).map((call) => call.body),
    [{ request_id: id, result: "auth_accepted" }]);
  assert.equal(f.calls.filter((call) => call.path === "/auth/v1/recover").length, 1);
  assert.deepEqual(f.reports, []);
});

test("the bounded mail deadline aborts the pending request and records an unknown outcome without retry", async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const mailSignals: AbortSignal[] = [];
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    const signal = timeout(milliseconds === 30_000 ? 20 : milliseconds);
    if (milliseconds === 30_000) mailSignals.push(signal);
    return signal;
  });
  const f = fixture();
  f.state.mailDelayMs = 1000;
  const response = await f.send({ mode: "self", email: "synthetic@feuerwehr-odenthal.de" });
  assert.equal(response.status, 200);
  assert.equal(mailSignals.length, 1);
  assert.equal(mailSignals[0].aborted, true);
  assert.deepEqual(f.reports, ["auth_mail_timeout", "recovery_failed"]);
  assert.deepEqual(f.calls.filter((call) => call.path.endsWith("ff_finish_password_recovery")).map((call) => call.body),
    [{ request_id: id, result: "unknown" }]);
  assert.equal(f.calls.filter((call) => call.path === "/auth/v1/recover").length, 1);
});

test("mail timeout and transport errors are classified without secrets, retries or discarded unknown outcomes", async () => {
  for (const [failure, diagnostic] of [["mailTimeout", "auth_mail_timeout"], ["mailTransport", "auth_mail_transport_failed"]] as const) {
    for (const admin of [false, true]) {
      const f = fixture();
      f.state[failure] = true;
      const response = await f.send(admin ? { mode: "admin", target_user: id }
        : { mode: "self", email: "synthetic@feuerwehr-odenthal.de" }, admin);
      assert.equal(response.status, admin ? 503 : 200);
      assert.deepEqual(f.calls.filter((call) => call.path.endsWith("ff_finish_password_recovery")).map((call) => call.body),
        [{ request_id: id, result: "unknown" }]);
      assert.equal(f.calls.filter((call) => call.path === "/auth/v1/recover").length, 1);
      assert.deepEqual(f.reports, [diagnostic, "recovery_failed"]);
      assert(!await response.text().then((text) => /synthetic|timeout|transport|sensitive/.test(text)));
    }
  }
});

test("known, unknown, unverified, quota-limited and SMTP-rejected self requests have identical public responses", async () => {
  const f = fixture();
  const input = { mode: "self", email: " Synthetic@Feuerwehr-Odenthal.de " };
  const known = await f.send(input);
  assert.equal(known.status, 200);
  const text = await known.text();
  for (const condition of ["unknown", "limited", "mail_rejected", "mail_timeout"]) {
    f.state.eligible = condition !== "unknown";
    f.state.limited = condition === "limited";
    f.state.mailAccepted = condition !== "mail_rejected";
    f.state.mailTimeout = condition === "mail_timeout";
    const response = await f.send(input);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), text);
  }
  assert(f.reports.includes("auth_mail_rejected"));
  assert(!JSON.stringify(f.reports).includes("sensitive upstream"));
  assert(f.calls.some((call) => call.path.endsWith("ff_finish_password_recovery") && JSON.stringify(call.body).includes("unknown")));
});
test("server PKCE recovery works without the initiating browser, consumes the verifier once and returns only the user's session", async () => {
  const f = fixture();
  await f.send({ mode: "self", email: "synthetic@feuerwehr-odenthal.de" });
  const input = { mode: "exchange", request_id: id, code: "synthetic-auth-code" };
  const response = await f.send(input);
  assert.equal(response.status, 200);
  const proof = await response.text();
  assert(proof.includes('"status":"verified"'));
  assert(!proof.includes(f.state.verifier));
  assert(!proof.includes(configuration.serviceKey));
  assert.equal((await f.send(input)).status, 400);
  const forged = fixture();
  forged.state.grantUser = "10000000-0000-4000-8000-000000000002";
  await forged.send({ mode: "self", email: "synthetic@feuerwehr-odenthal.de" });
  const mismatch = await forged.send(input);
  assert.equal(mismatch.status, 503);
  assert(!await mismatch.text().then((text) => text.includes("synthetic-access-only")));
});
test("administrative recovery verifies Auth and live exact role before any recovery call", async () => {
  const f = fixture();
  const input = { mode: "admin", target_user: id };
  assert.equal((await f.send(input)).status, 401);
  f.state.authenticated = false;
  assert.equal((await f.send(input, true)).status, 401);
  f.state.authenticated = true; f.state.admin = false;
  assert.equal((await f.send(input, true)).status, 403);
  assert.equal(f.calls.filter((call) => call.path === "/auth/v1/recover").length, 0);
  f.state.admin = true;
  assert.equal((await f.send(input, true)).status, 200);
  assert.equal(f.calls.filter((call) => call.path === "/auth/v1/recover").length, 1);
  assert(f.calls.find((call) => call.path.endsWith("ff_begin_admin_password_recovery"))?.authorization?.includes("synthetic-user-only"));
  assert(f.calls.find((call) => call.path.endsWith("ff_finish_password_recovery"))?.authorization?.includes("synthetic-server-only"));
});
test("administrative failure is explicit and server outcome contains no password or reset token", async () => {
  const f = fixture();
  f.state.mailAccepted = false;
  assert.equal((await f.send({ mode: "admin", target_user: id }, true)).status, 503);
  const result = f.calls.find((call) => call.path.endsWith("ff_finish_password_recovery"));
  assert.deepEqual(result?.body, { request_id: id, result: "auth_rejected" });
  assert(!/password|token_hash|access_token|refresh_token/.test(JSON.stringify(result?.body)));
});
test("extra password/redirect parameters, wrong domains and oversized bodies are rejected before any server call", async () => {
  const f = fixture();
  for (const input of [
    { mode: "self", email: "synthetic@example.test" },
    { mode: "self", email: "synthetic@feuerwehr-odenthal.de", password: "must-not-be-transmitted" },
    { mode: "admin", target_user: id, redirectTo: "https://evil.test" },
    { mode: "self", email: "x".repeat(1100) },
  ]) assert.equal((await f.send(input)).status, 400);
  assert.deepEqual(f.calls, []);
});
test("anonymous intake has an atomic global server limit, not a spoofable claimed IP limit", async () => {
  const f = fixture();
  f.state.intake = false;
  const response = await f.send({ mode: "self", email: "synthetic@feuerwehr-odenthal.de" });
  assert.equal(response.status, 429);
  assert.equal(f.calls.length, 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
