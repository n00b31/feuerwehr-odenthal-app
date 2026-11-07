import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readConfig, runSeed, pinnedFetch, PROJECT, verifyNewUser } from "./seed-dev-users.mjs";

const password = randomUUID();
const env = () => ({
  SUPABASE_DEV_URL: `https://${PROJECT}.supabase.co`,
  SUPABASE_DEV_SEED_ENVIRONMENT: "isolated-dev", SUPABASE_DEV_SEED_CONFIRM_PROJECT: PROJECT,
  SUPABASE_DEV_SEED_APPROVER_ID: randomUUID(), SUPABASE_DEV_SERVICE_ROLE_KEY: "sb_secret_SYNTHETIC_NOT_A_REAL_KEY",
  SUPABASE_DEV_PUBLISHABLE_KEY: "sb_publishable_SYNTHETIC_NOT_A_REAL_KEY", SUPABASE_DEV_TEST_PASSWORD: password,
});
const names = ["Max Mustermann", "Anna Becker", "Thomas Weber", "Lisa M\u00fcller", "Peter Schneider", "Sarah Fischer"];
const locals = ["max", "anna", "thomas", "lisa", "peter", "sarah"];
function fixture() {
  const units = [randomUUID(), randomUUID()];
  const members = locals.map((local, i) => ({
    email: `${local}.test@feuerwehr-odenthal.de`, display_name: names[i],
    role: [0, 1, 4].includes(i) ? "UNIT_ADMIN" : "MEMBER",
    unit_code: i < 4 ? "scheuren" : "scherf", unit_id: units[i < 4 ? 0 : 1],
    state: "missing", user_id: null,
  }));
  const users = [];
  const created = [];
  const provisioned = [];
  const verified = [];
  const logs = [];
  const report = { policy_project_ref: PROJECT, environment: "isolated-dev", protected_fingerprint: "baseline", members };
  const client = {
    auth: { admin: {
      listUsers: async () => ({ data: { users: [...users] }, error: null }),
      createUser: async (attributes) => {
        created.push(attributes);
        const user = { id: randomUUID(), email: attributes.email, email_confirmed_at: "synthetic", app_metadata: attributes.app_metadata };
        users.push(user);
        const member = members.find((m) => m.email === user.email);
        Object.assign(member, { state: "conflict", user_id: user.id });
        return { data: { user }, error: null };
      },
    } },
    rpc: async (name, args) => {
      if (name === "ff_dev_seed_report") return { data: structuredClone(report), error: null };
      assert.equal(name, "ff_dev_seed_member");
      provisioned.push(args);
      members.find((m) => m.user_id === args.target_user).state = "ready";
      return { data: null, error: null };
    },
  };
  const args = { env: env(), mode: "seed", createClient: () => client, log: (line) => logs.push(line),
    pause: async () => {}, verify: async (_client, member) => verified.push(member.email) };
  return { args, client, report, members, users, created, provisioned, verified, logs };
}
test("wrong project, environment, approval, public credential or CI context aborts before any client", async () => {
  for (const change of [
    { SUPABASE_DEV_URL: "https://other.supabase.co" },
    { SUPABASE_DEV_URL: `https://${PROJECT}.supabase.co/auth/v1` },
    { SUPABASE_DEV_URL: `https://${PROJECT}.supabase.co?token=synthetic` },
    { SUPABASE_DEV_SEED_ENVIRONMENT: "production" },
    { SUPABASE_DEV_SEED_CONFIRM_PROJECT: "other" },
    { SUPABASE_DEV_SERVICE_ROLE_KEY: "sb_publishable_SYNTHETIC_NOT_A_REAL_KEY" },
    { SUPABASE_DEV_SEED_APPROVER_ID: "" }, { SUPABASE_DEV_TEST_PASSWORD: "" },
    { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "n00b31/feuerwehr-odenthal-demo" },
    { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "n00b31/feuerwehr-odenthal-app",
      GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "push" },
  ]) {
    let calls = 0;
    await assert.rejects(runSeed({ ...fixture().args, env: { ...env(), ...change },
      createClient: () => { calls++; } }));
    assert.equal(calls, 0);
  }
});
test("strict password check has no secret-bearing diagnostics", () => {
  const secret = "short";
  assert.throws(() => readConfig({ ...env(), SUPABASE_DEV_TEST_PASSWORD: secret }, "seed"),
    (error) => !error.message.includes(secret) && /12-128/.test(error.message));
});
test("pinned fetch refuses foreign origin and disables redirects", async () => {
  let init;
  const fetcher = pinnedFetch(async (_url, options) => { init = options; });
  assert.throws(() => fetcher("https://other.supabase.co", {}), /pinned/);
  await fetcher(`https://${PROJECT}.supabase.co/auth/v1/admin/users`, { method: "POST" });
  assert.equal(init.redirect, "error");
});
test("check is read-only and needs neither test password nor public key", async () => {
  const f = fixture();
  delete f.args.env.SUPABASE_DEV_TEST_PASSWORD;
  delete f.args.env.SUPABASE_DEV_PUBLISHABLE_KEY;
  const outcome = await runSeed({ ...f.args, mode: "check" });
  assert.deepEqual(outcome, { created: 0, existing: 0, checkedOnly: true });
  assert.equal(f.created.length + f.provisioned.length + f.verified.length, 0);
});
test("six Admin API creations have verified email, protected run marker and exact roles; rerun does not touch them", async () => {
  const f = fixture();
  assert.deepEqual(await runSeed(f.args), { created: 6, existing: 0, checkedOnly: false });
  assert.equal(f.created.length, 6);
  assert.equal(f.provisioned.length, 6);
  assert.equal(f.verified.length, 6);
  assert(f.created.every((item) => item.email_confirm === true && item.password === password &&
    item.app_metadata.ff_dev_seed.project_ref === PROJECT));
  assert.equal(new Set(f.created.map((m) => m.app_metadata.ff_dev_seed.run_id)).size, 1);
  assert(!f.logs.join().includes(password));
  assert(!f.logs.join().includes(f.args.env.SUPABASE_DEV_SERVICE_ROLE_KEY));
  assert.deepEqual(await runSeed(f.args), { created: 0, existing: 6, checkedOnly: false });
  assert.equal(f.created.length, 6);
  assert.equal(f.provisioned.length, 6);
  assert.equal(f.verified.length, 6, "existing accounts are not even signed into on rerun");
});
test("same-email collisions, drift and malformed manifests fail before creation", async () => {
  for (const scenario of ["collision", "drift", "manifest"]) {
    const f = fixture();
    if (scenario === "collision") f.users.push({ id: randomUUID(), email: f.members[0].email });
    if (scenario === "drift") Object.assign(f.members[0], { state: "conflict", user_id: randomUUID() });
    if (scenario === "manifest") f.members[0].role = "GLOBAL_ADMIN";
    await assert.rejects(runSeed(f.args));
    assert.equal(f.created.length + f.provisioned.length, 0);
  }
});
test("initialization failure stops; no deletion, password reset or automatic pending-account adoption", async () => {
  const f = fixture();
  const original = f.client.rpc;
  f.client.rpc = (name, args) => name === "ff_dev_seed_member"
    ? { data: null, error: { code: "42501", message: password } } : original(name, args);
  await assert.rejects(runSeed(f.args), (error) => /pending/.test(error.message) && !error.message.includes(password));
  assert.equal(f.created.length, 1);
  await assert.rejects(runSeed(f.args), /collision\/drift/);
  assert.equal(f.created.length, 1);
});
test("Auth rate limits and weak-password errors are not retried or logged verbatim", async () => {
  for (const code of ["over_request_rate_limit", "weak_password"]) {
    const f = fixture();
    let attempts = 0;
    f.client.auth.admin.createUser = async () => {
      attempts++;
      return { data: null, error: { code, message: password } };
    };
    await assert.rejects(runSeed(f.args), (error) => !error.message.includes(password));
    assert.equal(attempts, 1);
    assert.equal(f.provisioned.length, 0);
  }
});
test("live verifier uses user login, profile RLS and member/event RPCs, never service-role authorization", async () => {
  for (const index of [0, 2]) {
    const f = fixture();
    await runSeed(f.args);
    const member = f.members[index];
    const visible = f.members.filter((m) => m.user_id === member.user_id ||
      (member.role === "UNIT_ADMIN" && m.unit_id === member.unit_id));
    const client = {
      auth: { signInWithPassword: async () => ({ data: { user: { id: member.user_id }, session: {} } }),
        signOut: async (options) => { assert.equal(options.scope, "local"); return { error: null }; } },
      from: (table) => {
        assert.equal(table, "profiles");
        return { select: () => ({ in: async () => ({ data: visible.map((m) => ({ id: m.user_id })) }) }) };
      },
      rpc: async (name) => {
        if (name === "ff_my_access") return { data: [{ user_id: member.user_id, access_granted: true,
          account_status: "approved", unit_id: member.unit_id,
          roles: member.role === "MEMBER" ? ["MEMBER"] : ["MEMBER", "UNIT_ADMIN"] }] };
        if (name === "ff_members_workspace") return member.role === "MEMBER"
          ? { error: { code: "42501" } }
          : { data: { global_admin: false, units: [{ id: member.unit_id }], members: visible } };
        assert.equal(name, "ff_events_workspace");
        return { data: { manageable_units: member.role === "MEMBER" ? [] : [{ id: member.unit_id }] } };
      },
    };
    await verifyNewUser(client, member, f.members, password);
    client.from = () => ({ select: () => ({ in: async () => ({ data: f.members.map((m) => ({ id: m.user_id })) }) }) });
    await assert.rejects(verifyNewUser(client, member, f.members, password), /RLS/);
  }
});
test("server manifest and manual-only workflow are pinned; no seed on merge or Pages permissions", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261103000900_dev_test_members.sql", import.meta.url), "utf8");
  for (const member of fixture().members) {
    assert(sql.includes(`'${member.email}', '${member.display_name}', '${member.role}'::public.ff_role, '${member.unit_code}'`));
  }
  const workflow = await readFile(new URL("../.github/workflows/seed-dev-test-users.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule|workflow_run):/m);
  assert.doesNotMatch(workflow, /pages:|deploy-pages|contents: write/);
  assert.match(workflow, /environment: supabase-dev-seed/);
});
