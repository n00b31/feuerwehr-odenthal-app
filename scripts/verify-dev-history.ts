import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAccess, type Access } from "../src/data/supabase-repository";
import { readReportsContext, readYearReport } from "../src/data/supabase-reports";
import { readCalendar } from "../src/data/supabase-calendar";
import { calendarRange, emptyCalendarFilters } from "../src/domain/calendar";

let stage = "configuration";
async function main() {
  const { PLAN, PROJECT, pinnedFetch } = await import("./seed-dev-users.mjs");
  const env = process.env;
  const origin = `https://${PROJECT}.supabase.co`;
  const key = env.SUPABASE_DEV_PUBLISHABLE_KEY;
  const password = env.SUPABASE_DEV_TEST_PASSWORD;
  assert(env.SUPABASE_DEV_SEED_CONFIRM_PROJECT===PROJECT && env.SUPABASE_DEV_URL===origin
    && env.SUPABASE_DEV_SEED_ENVIRONMENT==="isolated-dev", "Pinned isolated DEV confirmation required.");
  assert(typeof key==="string" && key.startsWith("sb_publishable_"), "Public DEV publishable key required.");
  assert(typeof password==="string" && password.length>=8, "Protected runtime test password required.");
  const records: { client: SupabaseClient; access: Access; context: Awaited<ReturnType<typeof readReportsContext>> }[] = [];
  for (const plan of PLAN) {
    stage = "existing test-account Auth sign-in";
    const client = createClient(origin, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: pinnedFetch(fetch) },
    });
    const login = await client.auth.signInWithPassword({ email: plan.email, password });
    assert(!login.error && login.data.user, "Existing DEV test-account login failed; credentials omitted.");
    stage = "ff_my_access and approved identity";
    const access = await readAccess(client);
    assert(access.user_id===login.data.user.id && access.access_granted && access.unit_id);
    assert.deepEqual([...access.roles].sort(), plan.role==="UNIT_ADMIN" ? ["MEMBER","UNIT_ADMIN"] : ["MEMBER"]);
    stage = "ff_reports_context";
    const context = await readReportsContext(client);
    assert(!context.organization && context.seed_people.length===0, "Member/unit context exposed an overseer selector.");
    records.push({ client, access, context });
  }
  let syntheticId: string | undefined;
  for (const { client, access, context } of records) {
    stage = "direct profile SELECT/RLS";
    const profileRows = await client.from("profiles").select("id").in("id", records.map((r) => r.access.user_id));
    assert(!profileRows.error, "Live profile RLS query failed.");
    const visible = z.array(z.object({ id: z.uuid() })).parse(profileRows.data).map((r) => r.id).sort();
    const permitted = records.filter((r) => r.access.user_id===access.user_id
      || context.units.some((u) => u.id===r.access.unit_id)).map((r) => r.access.user_id).sort();
    assert.deepEqual(visible, permitted, "Profile RLS scope differs from actual unit role scopes.");
    for (const year of [2025,2026]) {
      stage = `personal ff_year_report ${year}`;
      const own = await readYearReport(client, { wanted_year: year, report_scope: "personal",
        target_scope: null, wanted_type: null, page_number: 0, export_all: true });
      assert(own.events.every((event) => !event.title.startsWith("DEV TEST")), "Real dutybook inherited synthetic attendance.");
      for (const unit of context.units) {
        stage = `scoped unit ff_year_report ${year}`;
        const report = await readYearReport(client, { wanted_year: year, report_scope: "unit",
          target_scope: unit.id, wanted_type: null, page_number: 0, export_all: true });
        const synthetic = report.members.find((member) => member.name.startsWith("DEV TEST | "));
        assert(synthetic && report.events.length>=25, "Authorized historical unit report lacks seeded history.");
        syntheticId ??= synthetic.user_id;
      }
    }
    stage = "organization report denial";
    const foreign = await client.rpc("ff_year_report", { wanted_year: 2026, report_scope: "organization" });
    assert(foreign.error?.code==="42501", "Organization scope was not denied to existing member/unit accounts.");
    stage = "existing ff_events_workspace";
    const events = await client.rpc("ff_events_workspace");
    assert(!events.error && Array.isArray(events.data?.events), "Existing event compatibility RPC failed.");
    stage = "shared calendar context, range and canonical service identities";
    const range = calendarRange("2026-11-07", "month");
    const calendar = await readCalendar(client, range, emptyCalendarFilters);
    assert(!calendar.context.organization && !calendar.context.configure, "Member/unit calendar gained technical or organization privileges.");
    assert.deepEqual(calendar.context.manageable_units.map((u)=>u.id).sort(), context.units.map((u)=>u.id).sort());
    assert(new Set(calendar.events.map((e)=>e.id)).size===calendar.events.length, "Calendar returned duplicate identities.");
    const legacy = z.array(z.object({ id:z.uuid(), starts_at:z.string(), ends_at:z.string() })).parse(events.data.events);
    for (const event of legacy.filter((e)=>Date.parse(e.starts_at)<Date.parse(range.upper_bound)
      && Date.parse(e.ends_at)>Date.parse(range.lower_bound))) {
      assert(calendar.events.some((e)=>e.id===event.id && e.entry_kind==="participation"), "Visible legacy service lost its canonical calendar identity.");
    }
  }
  assert(syntheticId, "No authorized synthetic report identity discovered.");
  for (const { client } of records) {
    stage = "synthetic personal report denial";
    const denied = await client.rpc("ff_dev_personal_report", { target_user: syntheticId, wanted_year: 2026 });
    assert(denied.error?.code==="42501", "Synthetic personal RPC was not restricted to overseers.");
    stage = "local-only test-session sign-out";
    const logout = await client.auth.signOut({ scope: "local" });
    assert(!logout.error, "Discarding the temporary local test session failed.");
  }
  console.log("PASS: six existing Auth logins; actual profile RLS, annual report RPCs, scoped denials, shared calendar and canonical event compatibility. No new Auth users or business-data writes.");
}
main().catch((error: unknown) => {
  const code = typeof error==="object" && error!==null && "code" in error
    && typeof error.code==="string" && /^[A-Z0-9]{5,12}$/.test(error.code) ? error.code : "unavailable";
  console.error(`Live DEV history verification failed at ${stage} (${error instanceof Error ? error.name : "unknown error"}; code ${code}). Credentials and server payloads are omitted.`);
  process.exitCode = 1;
});
