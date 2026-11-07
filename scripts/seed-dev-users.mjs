import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const PROJECT = "orxinqhhbtjpkzwlfaxq";
const ORIGIN = `https://${PROJECT}.supabase.co`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PLAN = [
  ["max.test", "Max Mustermann", "UNIT_ADMIN", "scheuren"],
  ["anna.test", "Anna Becker", "UNIT_ADMIN", "scheuren"],
  ["thomas.test", "Thomas Weber", "MEMBER", "scheuren"],
  ["lisa.test", "Lisa M\u00fcller", "MEMBER", "scheuren"],
  ["peter.test", "Peter Schneider", "UNIT_ADMIN", "scherf"],
  ["sarah.test", "Sarah Fischer", "MEMBER", "scherf"],
].map(([local, display_name, role, unit_code]) => ({
  email: `${local}@feuerwehr-odenthal.de`, display_name, role, unit_code,
}));

export class SeedError extends Error {}
function requireSeed(value, message) {
  if (!value) throw new SeedError(message);
}
function keyRole(key) {
  try { return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")); }
  catch { return {}; }
}
export function readConfig(env, mode) {
  requireSeed(["check", "seed"].includes(mode), "Choose --check or --apply.");
  let url;
  try { url = new URL(env.SUPABASE_DEV_URL); } catch { throw new SeedError("Invalid SUPABASE_DEV_URL."); }
  requireSeed(url.origin === ORIGIN && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password,
    "Only the pinned Supabase DEV URL is allowed.");
  requireSeed(env.SUPABASE_DEV_SEED_ENVIRONMENT === "isolated-dev" && env.SUPABASE_DEV_SEED_CONFIRM_PROJECT === PROJECT,
    "Explicit isolated-dev environment and project confirmation required.");
  requireSeed(UUID.test(env.SUPABASE_DEV_SEED_APPROVER_ID ?? ""), "An explicit GLOBAL_ADMIN approver UUID is required.");
  const key = env.SUPABASE_DEV_SERVICE_ROLE_KEY ?? "";
  const claims = keyRole(key);
  requireSeed(/^sb_secret_[A-Za-z0-9_-]{10,}$/.test(key) || (claims.role === "service_role" && claims.ref === PROJECT),
    "A server-only DEV secret/service-role credential is required.");
  if (env.GITHUB_ACTIONS === "true") {
    requireSeed(env.GITHUB_REPOSITORY === "n00b31/feuerwehr-odenthal-app" &&
      env.GITHUB_REF === "refs/heads/main" && env.GITHUB_EVENT_NAME === "workflow_dispatch",
    "GitHub seeding is restricted to manual runs from this repository's main.");
  }
  if (mode === "seed") {
    requireSeed(typeof env.SUPABASE_DEV_TEST_PASSWORD === "string" &&
      env.SUPABASE_DEV_TEST_PASSWORD.length >= 12 && env.SUPABASE_DEV_TEST_PASSWORD.length <= 128,
    "SUPABASE_DEV_TEST_PASSWORD must contain 12-128 characters; stricter Auth policy still applies.");
    const publicKey = env.SUPABASE_DEV_PUBLISHABLE_KEY ?? "";
    const publicClaims = keyRole(publicKey);
    requireSeed(/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(publicKey) ||
      (publicClaims.role === "anon" && publicClaims.ref === PROJECT),
    "The DEV publishable/anon key is required for real user-level RLS checks.");
  }
  return Object.freeze({ url: ORIGIN, key, approver: env.SUPABASE_DEV_SEED_APPROVER_ID,
    password: env.SUPABASE_DEV_TEST_PASSWORD, publicKey: env.SUPABASE_DEV_PUBLISHABLE_KEY, mode });
}

export function pinnedFetch(fetcher) {
  return (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    requireSeed(url.origin === ORIGIN && !url.username && !url.password,
      "Refusing to send credentials outside the pinned DEV origin.");
    return fetcher(input, { ...init, redirect: "error" });
  };
}
function result(data, error, stage) {
  if (error) {
    const reason = ["weak_password", "email_exists", "user_already_exists", "42501", "PGRST202"].includes(error.code)
      ? error.code : "request_failed";
    throw new SeedError(`${stage} failed (${reason}). No automatic retry or cleanup; inspect DEV privately.`);
  }
  requireSeed(data != null, `${stage} returned no confirmed result.`);
  return data;
}
function validateReport(report) {
  requireSeed(report?.policy_project_ref === PROJECT && report.environment === "isolated-dev" &&
    typeof report.protected_fingerprint === "string" && report.members?.length === 6,
  "DEV seed policy/migration 009 report is invalid.");
  requireSeed(new Set(report.members.map((m) => m.email)).size === 6, "Duplicate seed manifest entries.");
  for (const wanted of PLAN) {
    const item = report.members.find((m) => m.email === wanted.email);
    requireSeed(item && Object.entries(wanted).every(([key, value]) => item[key] === value) &&
      UUID.test(item.unit_id) && ["missing", "ready", "conflict"].includes(item.state) &&
      (item.state === "missing" ? item.user_id === null : UUID.test(item.user_id)),
    "The database manifest differs from the fixed six-account plan.");
  }
  return report;
}
async function reportFor(client, config) {
  const response = await client.rpc("ff_dev_seed_report", { approver_id: config.approver });
  return validateReport(result(response.data, response.error, "Read-only DEV preflight"));
}
async function authInventory(client) {
  const wanted = new Map();
  for (let page = 1; page <= 100; page++) {
    const response = await client.auth.admin.listUsers({ page, perPage: 100 });
    const data = result(response.data, response.error, "Auth inventory");
    requireSeed(Array.isArray(data.users), "Invalid Auth inventory.");
    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (PLAN.some((item) => item.email === email)) {
        requireSeed(!wanted.has(email) && UUID.test(user.id), "Ambiguous existing Auth identity.");
        wanted.set(email, user.id);
      }
    }
    if (data.users.length < 100) return wanted;
  }
  throw new SeedError("Auth pagination safety limit reached; no writes performed.");
}

export async function verifyNewUser(client, member, allMembers, password) {
  const login = await client.auth.signInWithPassword({ email: member.email, password });
  const identity = result(login.data, login.error, "New test-account login");
  requireSeed(identity.user?.id === member.user_id && identity.session, "Unexpected test-account identity.");
  const access = await client.rpc("ff_my_access");
  const rows = result(access.data, access.error, "Live access RPC");
  const own = rows[0];
  const expectedRoles = member.role === "UNIT_ADMIN" ? ["MEMBER", "UNIT_ADMIN"] : ["MEMBER"];
  requireSeed(rows.length === 1 && own.user_id === member.user_id && own.access_granted &&
    own.account_status === "approved" && own.unit_id === member.unit_id &&
    Array.isArray(own.roles) && [...own.roles].sort().join() === expectedRoles.join(),
  "New account access/role/unit validation failed.");
  const visible = await client.from("profiles").select("id").in("id", allMembers.map((m) => m.user_id));
  const ids = result(visible.data, visible.error, "Actual profile SELECT/RLS").map((row) => row.id).sort();
  const expected = allMembers.filter((m) => m.user_id === member.user_id ||
    (member.role === "UNIT_ADMIN" && m.unit_id === member.unit_id)).map((m) => m.user_id).sort();
  requireSeed(ids.join() === expected.join(), "Cross-unit profile RLS validation failed.");
  const workspace = await client.rpc("ff_members_workspace");
  if (member.role === "MEMBER") {
    requireSeed(workspace.error?.code === "42501", "MEMBER administration denial was not confirmed.");
  } else {
    const data = result(workspace.data, workspace.error, "UNIT_ADMIN member RPC");
    requireSeed(data.global_admin === false && data.units.length === 1 && data.units[0].id === member.unit_id &&
      data.members.every((m) => m.unit_id === member.unit_id || m.unit_id === null),
    "UNIT_ADMIN workspace scope validation failed.");
  }
  const events = await client.rpc("ff_events_workspace");
  const eventData = result(events.data, events.error, "Unchanged event workspace RPC");
  const manageable = eventData.manageable_units.map((unit) => unit.id).sort();
  requireSeed(manageable.join() === (member.role === "UNIT_ADMIN" ? member.unit_id : ""),
    "Event management scope validation failed.");
  // Local-only sign-out discards this new test session; never revoke another account's sessions.
  const logout = await client.auth.signOut({ scope: "local" });
  if (logout.error) result(null, logout.error, "New test-account sign-out");
}

export async function runSeed({ env, mode, createClient, log = console.log, pause = delay, verify = verifyNewUser }) {
  const config = readConfig(env, mode);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: pinnedFetch(globalThis.fetch) } };
  const client = createClient(config.url, config.key, options);
  const baseline = await reportFor(client, config);
  const known = await authInventory(client);
  for (const item of baseline.members) {
    requireSeed(item.state !== "conflict" && (known.get(item.email) ?? null) === item.user_id,
      "Existing account collision/drift found. No overwrite; resolve privately before seeding.");
  }
  for (const member of baseline.members) log(`${member.email}: ${member.state === "ready" ? "existing, unchanged" : "not created yet"}`);
  if (mode === "check") return { created: 0, existing: known.size, checkedOnly: true };
  const created = new Set();
  const runId = randomUUID();
  for (const member of baseline.members.filter((m) => m.state === "missing")) {
    readConfig(env, mode);
    const current = await reportFor(client, config);
    requireSeed(current.protected_fingerprint === baseline.protected_fingerprint,
      "Protected DEV state changed during the run. Stop and review; no automatic cleanup.");
    requireSeed(current.members.every((m) => m.state !== "conflict") &&
      current.members.find((m) => m.email === member.email)?.state === "missing",
    "Concurrent account change detected; existing accounts will not be modified.");
    const response = await client.auth.admin.createUser({
      email: member.email, password: config.password, email_confirm: true,
      user_metadata: { display_name: member.display_name },
      app_metadata: { ff_dev_seed: { version: "032", project_ref: PROJECT, run_id: runId } },
    });
    const data = result(response.data, response.error, "Auth Admin createUser");
    requireSeed(UUID.test(data.user?.id) && data.user.email?.toLowerCase() === member.email &&
      data.user.email_confirmed_at && data.user.app_metadata?.ff_dev_seed?.run_id === runId,
    "Auth creation not fully confirmed. Stop; review the new pending account privately.");
    readConfig(env, mode);
    const provision = await client.rpc("ff_dev_seed_member", {
      target_user: data.user.id, approver_id: config.approver, run_id: runId,
    });
    if (provision.error) result(null, provision.error, "New account initialization (Auth account may remain pending)");
    created.add(data.user.id);
    log(`${member.email}: Auth created; profile, membership, roles and audit initialized`);
    await pause(500);
  }
  const finalReport = await reportFor(client, config);
  const finalInventory = await authInventory(client);
  requireSeed(finalReport.protected_fingerprint === baseline.protected_fingerprint &&
    finalReport.members.every((m) => m.state === "ready" && finalInventory.get(m.email) === m.user_id),
  "Final six-account/state validation failed. Existing accounts were not repaired or overwritten.");
  for (const member of finalReport.members.filter((m) => created.has(m.user_id))) {
    readConfig(env, mode);
    await verify(createClient(config.url, config.publicKey, options), member, finalReport.members, config.password);
    log(`${member.email}: real login, profile RLS and scoped member/event RPC checks passed`);
    await pause(500);
  }
  const afterChecks = await reportFor(client, config);
  requireSeed(afterChecks.protected_fingerprint === baseline.protected_fingerprint &&
    afterChecks.members.every((m) => m.state === "ready"), "DEV state changed during final checks.");
  log(`Complete: ${created.size} created; ${known.size} existing and unchanged. No mail or deployment requested.`);
  return { created: created.size, existing: known.size, checkedOnly: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mode = process.argv[2] === "--apply" ? "seed" : process.argv[2] === "--check" ? "check" : "";
    readConfig(process.env, mode);
    const { createClient } = await import("@supabase/supabase-js");
    await runSeed({ env: process.env, mode, createClient });
  } catch (error) {
    // SDK errors can contain requests/credentials. Only emit our own bounded diagnostics.
    console.error(error instanceof SeedError ? error.message : "DEV seed failed unexpectedly. Inspect privately; no retry or cleanup performed.");
    process.exitCode = 1;
  }
}
