import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { reportCsv, reportMetricsSchema, reportQuerySchema, reportRate, yearReportSchema, type YearReport } from "./dev-reports";
import { readYearReport } from "@/data/supabase-reports";

const unit = "20000000-0000-4000-8000-000000000001";
const person = "10000000-0000-4000-8000-000000000001";
const metrics = {
  services: 1, practices: 1, training_services: 1, eligible: 1,
  present: 1, absent: 0, training_present: 1, training_absent: 0, unknown: 0,
  training_hours: 2, service_hours: 2, participant_hours: 2, rate: 100,
  average_attendance: 1,
  pending: 0, excluded: 0, missing_roster: 0,
};
const fixture: YearReport = {
  year: 2026, scope: "personal", target: null, scope_name: "Mein Dienstbuch",
  summary: { ...metrics, members: 1 }, members: [], units: [], page: 0, has_more: false, event_count: 1,
  events: [{
    event_id: "30000000-0000-4000-8000-000000000001", title: " \t=HYPERLINK(\"unsafe\")",
    event_type: "regular", scope_name: "Scheuren", unit_name: "Scheuren",
    starts_at: "2026-11-06T17:00:00Z", ends_at: "2026-11-06T19:00:00Z",
    hours: 2, training: true, confirmed_at: "2026-11-06T19:01:00Z", corrected_at: null,
    own_status: "present", metrics,
  }],
};
const query = { wanted_year: 2026, report_scope: "personal" as const, target_scope: null,
  wanted_type: null, page_number: 0, export_all: false };

test("reports distinguish no denominator from real zero attendance", () => {
  assert.equal(reportRate(null), "Nicht berechenbar");
  assert.equal(reportRate(0), "0 %");
  assert.equal(reportRate(80), "80 %");
  assert.equal(reportMetricsSchema.parse({ ...metrics, rate: null }).rate, null);
  assert.throws(() => reportMetricsSchema.parse({ ...metrics, rate: 101 }));
  assert.throws(() => reportMetricsSchema.parse({ ...metrics, training_hours: -1 }));
});
test("report selection validates year, scope, page and required unit", () => {
  assert.deepEqual(reportQuerySchema.parse(query), query);
  for (const invalid of [{ ...query, wanted_year: null }, { ...query, wanted_year: 2200 },
    { ...query, report_scope: "unit" }, { ...query, page_number: -1 }, { ...query, report_scope: "foreign-user" }]) {
    assert.throws(() => reportQuerySchema.parse(invalid));
  }
});
test("report schema rejects malformed final data instead of inventing statistics", () => {
  assert.equal(yearReportSchema.parse(fixture).summary.training_hours, 2);
  assert.throws(() => yearReportSchema.parse({ ...fixture, summary: { ...metrics, members: 1, rate: "unknown" } }));
  assert.throws(() => yearReportSchema.parse({ ...fixture, events: [{ ...fixture.events[0], confirmed_at: null }] }));
});
test("Excel CSV has BOM, semicolons, German Berlin dates and protected formula cells", () => {
  const output = reportCsv(fixture, "events");
  assert.ok(output.startsWith("\uFEFF"));
  assert.ok(output.includes('"Mein Dienstbuch";"2026";"06.11.2026"'));
  assert.ok(output.includes('"18:00";"20:00";"2"'));
  assert.ok(output.includes("\"' \t=HYPERLINK(\"\"unsafe\"\")\""));
  assert.ok(output.includes('"Anwesend";"Abgeschlossen"'));
});
test("member CSV exports only the authorized RPC payload and no unprovided identities", () => {
  const report: YearReport = { ...fixture, scope: "unit", target: unit, scope_name: "Scheuren",
    members: [{ user_id: person, name: "Synthetic approved member", metrics }] };
  const output = reportCsv(report, "members");
  assert.ok(output.includes('"Scheuren";"2026";"Synthetic approved member"'));
  assert.ok(!output.includes("foreign"));
  assert.throws(() => reportCsv(fixture, "members"));
  assert.throws(() => reportCsv(fixture, "units"));
});
test("summary CSV explains unknowns and does not export a fabricated zero rate", () => {
  const output = reportCsv({ ...fixture, summary: { ...fixture.summary, rate: null, unknown: 1 } }, "summary");
  assert.ok(output.includes('"Anwesenheitsquote";"Nicht berechenbar"'));
  assert.ok(output.includes('"Ungeklärte Anwesenheiten";"1"'));
});
test("repository requests a scoped annual aggregation, never raw attendance or another user", async () => {
  const calls: { url: string; input: Record<string, unknown> }[] = [];
  const client = createClient("https://syntheticci.supabase.co", "sb_publishable_SYNTHETIC_CI_ONLY", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      calls.push({ url: String(url), input: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(fixture), { headers: { "content-type": "application/json" } });
    } },
  });
  assert.equal((await readYearReport(client, query)).summary.training_hours, 2);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/rest/v1/rpc/ff_year_report"));
  assert.deepEqual(calls[0].input, query);
  assert.ok(!("target_user" in calls[0].input));
});
test("repository rejects mismatched and partial export responses", async () => {
  let response = { ...fixture, year: 2025 };
  const client = createClient("https://syntheticci.supabase.co", "sb_publishable_SYNTHETIC_CI_ONLY", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => new Response(JSON.stringify(response), { headers: { "content-type": "application/json" } }) },
  });
  test("synthetic report uses its dedicated readonly RPC and verifies the returned synthetic subject", async () => {
    let response: YearReport = { ...fixture, scope_name: "DEV TEST | Testmitglied Scheuren 01", seed_member: person };
    let url = "";
    let body: Record<string, unknown> = {};
    const client = createClient("https://syntheticci.supabase.co", "sb_publishable_SYNTHETIC_CI_ONLY", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        url = String(input); body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(response), { headers: { "content-type": "application/json" } });
      } },
    });
    const result = await readYearReport(client, { ...query, seed_member: person });
    assert.ok(url.endsWith("/rpc/ff_dev_personal_report"));
    assert.equal(body.target_user, person);
    assert.ok(!("report_scope" in body) && !("seed_member" in body));
    assert.ok(reportCsv(result, "events").includes('"DEV TEST | Testmitglied Scheuren 01"'));
    response = { ...response, seed_member: unit };
    await assert.rejects(() => readYearReport(client, { ...query, seed_member: person }), /Identität/);
    assert.throws(() => reportQuerySchema.parse({ ...query, report_scope: "unit", target_scope: unit, seed_member: person }));
  });
  await assert.rejects(() => readYearReport(client, query), /stimmt nicht/);
  response = { ...fixture, has_more: true };
  await assert.rejects(() => readYearReport(client, { ...query, export_all: true }), /Unvollständiger Export/);
});
