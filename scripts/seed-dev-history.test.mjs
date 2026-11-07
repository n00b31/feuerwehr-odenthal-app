import { test } from "node:test";
import assert from "node:assert/strict";
import { historyConfig, runHistory } from "./seed-dev-history.mjs";

const project = "orxinqhhbtjpkzwlfaxq";
const actor = "44000000-0000-4000-8000-000000000001";
const claims = { sub: actor, iss: `https://${project}.supabase.co/auth/v1`,
  role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now()/1000)+3600 };
const token = (value=claims) => `synthetic.${Buffer.from(JSON.stringify(value)).toString("base64url")}.signature-fixture`;
const env = { SUPABASE_DEV_PROJECT_REF: project, SUPABASE_DEV_URL: `https://${project}.supabase.co`,
  SUPABASE_DEV_ENVIRONMENT: "isolated-dev", SUPABASE_DEV_PUBLISHABLE_KEY: "sb_publishable_SYNTHETIC_CI_ONLY",
  SUPABASE_DEV_GLOBAL_ACCESS_TOKEN: token(), SUPABASE_DEV_HISTORY_CONFIRM: "SEED DEV041-HISTORY-V1" };

test("history runner validates pinned environment, public key and session before any client or write", () => {
  assert.equal(historyConfig(env, "check").actor, actor);
  for (const bad of [
    { SUPABASE_DEV_PROJECT_REF: "foreign" }, { SUPABASE_DEV_URL: "https://foreign.supabase.co" },
    { SUPABASE_DEV_ENVIRONMENT: "production" }, { SUPABASE_DEV_PUBLISHABLE_KEY: "service-role-fixture" },
    { SUPABASE_DEV_GLOBAL_ACCESS_TOKEN: token({ ...claims, role: "service_role" }) },
    { SUPABASE_DEV_GLOBAL_ACCESS_TOKEN: token({ ...claims, iss: "foreign" }) },
    { SUPABASE_DEV_GLOBAL_ACCESS_TOKEN: token({ ...claims, exp: 1 }) },
    { SUPABASE_DEV_HISTORY_CONFIRM: "" },
  ]) assert.throws(() => historyConfig({ ...env, ...bad }, "seed"));
  assert.throws(() => historyConfig(env, "cleanup"));
});
test("manual history check is readonly; seed verifies Auth and inventory before exactly one guarded RPC", async () => {
  const calls = [];
  const report = { project_ref: project, fixture_key: "DEV041-HISTORY-V1", members: 50, events: 262 };
  const createClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
    rpc: async (name, input) => { calls.push({ name, input }); return { data: report, error: null }; },
  });
  await runHistory({ env, mode: "check", createClient, log: () => {} });
  assert.ok(calls.every((call) => call.name==="ff_dev_history_inventory"));
  calls.length = 0;
  await runHistory({ env, mode: "seed", createClient, log: () => {} });
  assert.deepEqual(calls.map((call) => call.name), ["ff_dev_history_inventory", "ff_dev_seed_history"]);
  assert.equal(calls[1].input.confirmation, "SEED DEV041-HISTORY-V1");
  await assert.rejects(() => runHistory({ env, mode: "seed", createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: { code: "invalid" } }) },
    rpc: async () => { throw new Error("must not run"); },
  }), log: () => {} }), /did not confirm/);
});
