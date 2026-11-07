import { pathToFileURL } from "node:url";
import { PROJECT, pinnedFetch } from "./seed-dev-users.mjs";

const origin = `https://${PROJECT}.supabase.co`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireValid(value, message) {
  if (!value) throw new Error(message);
}
export function historyConfig(env, mode) {
  requireValid(["check", "seed"].includes(mode), "Only check or seed is supported; cleanup is intentionally separate.");
  requireValid(env.SUPABASE_DEV_PROJECT_REF===PROJECT && env.SUPABASE_DEV_URL===origin
    && env.SUPABASE_DEV_ENVIRONMENT==="isolated-dev", "Pinned DEV project and explicit environment are required.");
  const key = env.SUPABASE_DEV_PUBLISHABLE_KEY;
  requireValid(typeof key==="string" && key.startsWith("sb_publishable_"), "A public publishable key is required, never a service-role key.");
  const token = env.SUPABASE_DEV_GLOBAL_ACCESS_TOKEN;
  requireValid(typeof token==="string" && token.split(".").length===3, "A short-lived approved GLOBAL_ADMIN session is required.");
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
  catch { throw new Error("Invalid session metadata."); }
  requireValid(claims.iss===`${origin}/auth/v1` && claims.role==="authenticated" && claims.aud==="authenticated"
    && uuid.test(claims.sub) && claims.exp>Date.now()/1000, "Session metadata does not match pinned authenticated DEV access.");
  requireValid(mode!=="seed" || env.SUPABASE_DEV_HISTORY_CONFIRM==="SEED DEV041-HISTORY-V1", "Explicit dataset confirmation is required.");
  return { key, token, actor: claims.sub };
}
export async function runHistory({ env, mode, createClient, log=console.log }) {
  const config = historyConfig(env, mode);
  const client = createClient(origin, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${config.token}` }, fetch: pinnedFetch(fetch) },
  });
  const user = await client.auth.getUser(config.token);
  requireValid(!user.error && user.data.user?.id===config.actor, "Supabase did not confirm this session; no changes performed.");
  const read = async (rpc, args) => {
    const { data, error } = await client.rpc(rpc, args);
    requireValid(!error && data?.project_ref===PROJECT && data?.fixture_key==="DEV041-HISTORY-V1",
      "DEV RPC failed or returned an unexpected dataset. No automatic retry or cleanup.");
    return data;
  };
  await read("ff_dev_history_inventory", { expected_project: PROJECT });
  const report = mode==="seed"
    ? await read("ff_dev_seed_history", { expected_project: PROJECT, confirmation: env.SUPABASE_DEV_HISTORY_CONFIRM })
    : await read("ff_dev_history_inventory", { expected_project: PROJECT });
  log(JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    await runHistory({ env: process.env, mode: process.argv[2] ?? "check", createClient });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
