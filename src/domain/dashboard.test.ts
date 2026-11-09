import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardCanReply, dashboardEventHref, dashboardGreeting, dashboardSchema, type DashboardEvent } from "./dashboard";

const id = "a0640000-0000-4000-8000-000000000001";
const item: DashboardEvent = { id, title: "Synthetic duty", starts_at: "2026-11-10T18:00:00Z",
  ends_at: "2026-11-10T20:00:00Z", location: "Synthetic CI", scope_name: "Synthetic unit",
  can_reply: true, own_response: null, response_deadline: null };
for (const [hour, greeting] of [[4, "Guten Abend"], [5, "Guten Morgen"], [10, "Guten Morgen"],
  [11, "Guten Tag"], [17, "Guten Tag"], [18, "Guten Abend"]] as const) {
  test(`cockpit greeting at ${hour} uses the current first name`, () =>
    assert.equal(dashboardGreeting("  Synthetic Member ", hour), `${greeting}, Synthetic`));
}
test("cockpit response is enabled before the server start boundary", () =>
  assert.equal(dashboardCanReply(item, Date.parse(item.starts_at) - 1), true));
test("cockpit response is disabled at the exact start boundary", () =>
  assert.equal(dashboardCanReply(item, Date.parse(item.starts_at)), false));
test("cockpit response is disabled after the start boundary", () =>
  assert.equal(dashboardCanReply(item, Date.parse(item.starts_at) + 1), false));
test("server denial cannot be overridden by an earlier device time", () =>
  assert.equal(dashboardCanReply({ ...item, can_reply: false }, 0), false));
test("cockpit honors the response deadline boundary", () =>
  assert.equal(dashboardCanReply({ ...item, response_deadline: "2026-11-09T18:00:00Z" }, Date.parse("2026-11-09T18:00:00Z")), false));
test("service links retain original IDs and target the existing module", () =>
  assert.equal(dashboardEventHref(id), `/termine/?bereich=dienste&termin=${id}#event-${id}`));
test("vehicle links target the existing reservation detail", () =>
  assert.equal(dashboardEventHref(id, "fahrzeuge"), `/termine/?bereich=fahrzeuge&vorgang=${id}`));
test("information links use the shared calendar", () =>
  assert.equal(dashboardEventHref(id, "kalender"), `/termine/?bereich=kalender&termin=${id}`));
test("attendance links target the existing attendance panel", () =>
  assert.match(dashboardEventHref(id, "dienste", "attendance"), /&aufgabe=attendance#event-/));
test("untrusted IDs cannot become outbound dashboard links", () =>
  assert.throws(() => dashboardEventHref("https://invalid.test")));
test("malformed dashboard payload never becomes an empty success state", () =>
  assert.equal(dashboardSchema.safeParse({ actor_id: id }).success, false));
