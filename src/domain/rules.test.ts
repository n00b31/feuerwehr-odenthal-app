import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeed } from "../data/seed";
import { execute } from "./service";
import { belongs, manages, responseBlock, seesDocument, seesEvent } from "./permissions";
import { personalStatistics, yearEvents } from "./statistics";
import { berlinParts, fromBerlin, recurrenceInstant } from "./time";
import { stateSchema, type EventInput } from "./model";
import { csv } from "./export";

const now = new Date("2026-11-02T18:42:00.000Z");
const member = "person-0-0", unitAdmin = "person-0-1", functionAdmin = "person-0-2", globalAdmin = "person-0-3";
const input: EventInput = {
  title: "Testdienst", description: "Test", type: "regular",
  startsAt: "2026-11-10T18:00:00.000Z", endsAt: "2026-11-10T20:00:00.000Z",
  location: "Gerätehaus", scope: { kind: "unit", id: "unit-0" },
};

test("seed contains 250 schema-valid fictitious users and five units with 50 members", () => {
  const state = stateSchema.parse(createSeed(now));
  assert.equal(state.users.length, 250);
  for (const unit of state.units) assert.equal(state.users.filter((u) => u.unitId === unit.id).length, 50);
  assert.equal(state.seedDate, "2026-11-02");
  assert.equal(berlinParts(state.events.find((e) => e.id === "unit-0-next")!.startsAt).year, 2026);
});
test("seed works at year beginning and uses current Berlin year", () => {
  const state = stateSchema.parse(createSeed(new Date("2026-12-31T23:15:00Z")));
  assert.equal(state.seedDate, "2027-01-01");
  assert.equal(state.events.filter((e) => e.id.includes("past")).length, 0);
});
test("scoped permissions isolate member, unit, function and global rights", () => {
  const state = createSeed(now);
  const [m, a, f, g] = state.users;
  assert.equal(manages(m, { kind: "unit", id: "unit-0" }), false);
  assert.equal(manages(a, { kind: "unit", id: "unit-0" }), true);
  assert.equal(manages(a, { kind: "unit", id: "unit-1" }), false);
  assert.equal(manages(f, { kind: "function", id: "breathing" }), true);
  assert.equal(manages(f, { kind: "function", id: "equipment" }), false);
  assert.equal(manages(f, { kind: "unit", id: "unit-0" }), false);
  assert.equal(manages(g, { kind: "organization" }), true);
  assert.equal(belongs(m, { kind: "function", id: "equipment" }), true);
});
test("member visibility hides other unit events and administrative documents", () => {
  const state = createSeed(now);
  assert.equal(seesEvent(state.users[0], state.events.find((e) => e.id === "unit-1-next")!), false);
  assert.equal(seesDocument(state.users[0], state.documents.find((d) => d.visibility === "admins")!), false);
  assert.equal(seesDocument(state.users[1], state.documents.find((d) => d.visibility === "admins")!), true);
});
test("response may be changed before start and state is immutable", () => {
  const state = createSeed(now);
  const next = execute(state, member, { type: "respond", eventId: "unit-0-next", response: "yes" }, now);
  const changed = execute(next, member, { type: "respond", eventId: "unit-0-next", response: "no" }, now);
  assert.equal(changed.events.find((e) => e.id === "unit-0-next")!.responses[member], "no");
  assert.equal(state.events.find((e) => e.id === "unit-0-next")!.responses[member], undefined);
});
test("exact start boundary blocks response in domain, including admin's own planning", () => {
  const state = createSeed(now);
  const event = state.events.find((e) => e.id === "unit-0-next")!;
  const before = new Date(Date.parse(event.startsAt) - 1);
  assert.equal(responseBlock(state.users[0], event, before), null);
  for (const actor of [member, unitAdmin]) {
    assert.throws(() => execute(state, actor, { type: "respond", eventId: event.id, response: "yes" }, new Date(event.startsAt)), /Seit Dienstbeginn/);
  }
});
test("deadline exact boundary and cancelled event block response", () => {
  const state = createSeed(now);
  const event = state.events.find((e) => e.id === "unit-0-next")!;
  event.deadline = now.toISOString();
  assert.throws(() => execute(state, member, { type: "respond", eventId: event.id, response: "yes" }, now), /Anmeldeschluss/);
  event.status = "cancelled";
  assert.throws(() => execute(state, member, { type: "respond", eventId: event.id, response: "yes" }, now), /abgesagt/);
});
test("non-roster persons cannot respond even if they can administrate", () => {
  const state = createSeed(now);
  assert.throws(() => execute(state, globalAdmin, { type: "respond", eventId: "unit-1-next", response: "yes" }, now), /nicht in der Teilnehmerliste/);
});
test("attendance requires admin in exact scope and start instant", () => {
  const state = createSeed(now);
  const command = { type: "attendance" as const, eventId: "unit-0-live", userId: member, value: "present" as const, reason: "" };
  assert.throws(() => execute(state, member, command, now), /Keine Berechtigung/);
  assert.throws(() => execute(state, "person-1-1", command, now), /Keine Berechtigung/);
  assert.throws(() => execute(state, unitAdmin, { ...command, eventId: "unit-0-next" }, now), /erst ab Dienstbeginn/);
  assert.throws(() => execute(state, unitAdmin, { ...command, userId: "person-1-0" }, now), /nicht in der Teilnehmerliste/);
  const event = state.events.find((e) => e.id === command.eventId)!;
  const next = execute(state, unitAdmin, command, new Date(event.startsAt));
  assert.equal(next.events.find((e) => e.id === command.eventId)!.attendance[member], "present");
});
test("attendance finalization preserves unknown entries, corrections require reason and log before/after", () => {
  let state = createSeed(now);
  state = execute(state, unitAdmin, { type: "finalize", eventId: "unit-0-live" }, now);
  assert.deepEqual(state.events.find((e) => e.id === "unit-0-live")!.attendance, {});
  const command = { type: "attendance" as const, eventId: "unit-0-live", userId: member, value: "present" as const, reason: "" };
  assert.throws(() => execute(state, unitAdmin, command, now), /Korrekturgrund/);
  state = execute(state, unitAdmin, { ...command, reason: "Nachweis des Ausbilders" }, now);
  assert.equal(state.audit[0].action, "Anwesenheit korrigiert");
  assert.match(state.audit[0].detail, /unknown → present.*Nachweis des Ausbilders/);
});
test("planned yes is never counted as actual attendance; present is counted exactly once", () => {
  let state = createSeed(now);
  const initial = personalStatistics(state, member, 2026, now);
  assert.equal(state.events.find((e) => e.id === "unit-0-live")!.responses[member], "yes");
  assert.equal(personalStatistics(state, member, 2026, now).attendanceCount, initial.attendanceCount);
  state = execute(state, unitAdmin, { type: "attendance", eventId: "unit-0-live", userId: member, value: "present", reason: "" }, now);
  const result = personalStatistics(state, member, 2026, now);
  assert.equal(result.attendanceCount, initial.attendanceCount + 1);
  assert.equal(result.hours, initial.hours + 2);
  assert.equal(result.attendedPractices, initial.attendedPractices + 1);
  state = execute(state, unitAdmin, { type: "attendance", eventId: "unit-0-live", userId: member, value: "absent", reason: "" }, now);
  assert.equal(personalStatistics(state, member, 2026, now).attendanceCount, initial.attendanceCount);
});
test("cancelled events excluded from denominator, future events excluded, Berlin year boundary", () => {
  const state = createSeed(now);
  const event = state.events.find((e) => e.id === "unit-0-live")!;
  event.startsAt = "2025-12-31T23:30:00Z";
  event.endsAt = "2026-01-01T01:30:00Z";
  assert.ok(yearEvents([event], 2026, now).length);
  event.status = "cancelled";
  assert.equal(yearEvents([event], 2026, now).length, 0);
  assert.equal(yearEvents([state.events.find((e) => e.id === "unit-0-next")!], 2026, now).length, 0);
});
test("series creates independent rosters, responses and attendance; editing/cancelling one doesn't affect siblings", () => {
  const initial = createSeed(now);
  let state = execute(initial, unitAdmin, { type: "createEvent", input, repeat: "weekly", count: 3 }, now);
  const series = state.events.filter((e) => e.seriesId);
  assert.equal(series.length, 3);
  assert.equal(new Set(series.map((e) => e.seriesId)).size, 1);
  assert.notEqual(series[0].responses, series[1].responses);
  assert.notEqual(series[0].attendance, series[1].attendance);
  assert.notEqual(series[0].roster, series[1].roster);
  state = execute(state, member, { type: "respond", eventId: series[0].id, response: "yes" }, now);
  assert.equal(state.events.find((e) => e.id === series[1].id)!.responses[member], undefined);
  state = execute(state, unitAdmin, { type: "editEvent", eventId: series[0].id, input: { ...input, title: "Nur Instanz eins" } }, now);
  assert.equal(state.events.find((e) => e.id === series[1].id)!.title, "Testdienst");
  state = execute(state, unitAdmin, { type: "cancelEvent", eventId: series[0].id, reason: "Übungsplatz gesperrt" }, now);
  assert.equal(state.events.find((e) => e.id === series[1].id)!.status, "scheduled");
});
test("series validates count, duration and scope before any mutation", () => {
  const state = createSeed(now);
  assert.throws(() => execute(state, unitAdmin, { type: "createEvent", input, repeat: "weekly", count: 53 }, now), /1 bis 52/);
  assert.throws(() => execute(state, unitAdmin, { type: "createEvent", input: { ...input, endsAt: input.startsAt }, repeat: "none", count: 1 }, now), /Ende/);
  assert.throws(() => execute(state, unitAdmin, { type: "createEvent", input: { ...input, scope: { kind: "unit", id: "unit-1" } }, repeat: "none", count: 1 }, now), /Keine Administrationsberechtigung/);
  assert.equal(state.events.filter((e) => e.seriesId).length, 0);
});
test("unit transfer preserves historical attendance, snapshots, statistics and personal visibility", () => {
  const state = createSeed(now);
  const before = personalStatistics(state, member, 2026, now);
  assert.throws(() => execute(state, unitAdmin, { type: "member", userId: member, unitId: "unit-1", functionIds: state.users[0].functionIds }, now), /beiden Einheiten/);
  const moved = execute(state, globalAdmin, { type: "member", userId: member, unitId: "unit-1", functionIds: state.users[0].functionIds }, now);
  assert.equal(moved.users[0].unitId, "unit-1");
  assert.equal(moved.users[0].memberships.length, 2);
  assert.equal(moved.users[0].memberships[0].until, now.toISOString());
  assert.equal(personalStatistics(moved, member, 2026, now).attendanceCount, before.attendanceCount);
  assert.equal(before.visited[0].roster.find((p) => p.userId === member)!.unitId, "unit-0");
  assert.equal(seesEvent(moved.users[0], before.visited[0]), true);
});
test("function admins manage own membership but cannot assign roles or other functions", () => {
  let state = createSeed(now);
  state = execute(state, functionAdmin, { type: "functionMember", userId: "person-1-2", functionId: "breathing", assigned: true }, now);
  assert.ok(state.users.find((u) => u.id === "person-1-2")!.functionIds.includes("breathing"));
  assert.throws(() => execute(state, functionAdmin, { type: "functionMember", userId: member, functionId: "equipment", assigned: false }, now), /Keine Berechtigung/);
  assert.throws(() => execute(state, unitAdmin, { type: "roles", userId: member, roles: [{ role: "GLOBAL_ADMIN" }] }, now), /Nur die Organisationsadministration/);
});
test("global roles support multiple assignments but cannot remove own global access", () => {
  const state = createSeed(now);
  const updated = execute(state, globalAdmin, { type: "roles", userId: member, roles: [{ role: "MEMBER" }, { role: "UNIT_ADMIN", scopeId: "unit-2" }, { role: "FUNCTION_ADMIN", scopeId: "equipment" }] }, now);
  assert.equal(updated.users[0].roles.length, 3);
  assert.throws(() => execute(state, globalAdmin, { type: "roles", userId: globalAdmin, roles: [{ role: "MEMBER" }] }, now), /eigene globale/);
});
test("document addition rejects unsafe schemes, unknown scopes and unauthorized areas", () => {
  const state = createSeed(now);
  const doc = { name: "Testdokument", description: "", scope: input.scope, visibility: "members" as const, url: "https://example.invalid/test" };
  assert.equal(execute(state, unitAdmin, { type: "addDocument", input: doc }, now).documents.length, state.documents.length + 1);
  for (const url of ["javascript:alert(1)", "http://tenant.sharepoint.com/test", "https://tenant.sharepoint.com.evil.example/test"]) {
    assert.throws(() => execute(state, unitAdmin, { type: "addDocument", input: { ...doc, url } }, now));
  }
  assert.throws(() => execute(state, member, { type: "addDocument", input: doc }, now), /Keine Berechtigung/);
  assert.throws(() => execute(state, globalAdmin, { type: "addDocument", input: { ...doc, scope: { kind: "unit", id: "missing" } } }, now), /Unbekannter Bereich/);
});
test("configurable new units and functions use IDs independent of names", () => {
  let state = createSeed(now);
  state = execute(state, globalAdmin, { type: "addUnit", name: "Neue Einheit" }, now);
  state = execute(state, globalAdmin, { type: "addFunction", name: "Ausbildung" }, now);
  state = execute(state, globalAdmin, { type: "renameUnit", unitId: "unit-0", name: "Scheuren Neu" }, now);
  assert.equal(state.units.length, 6);
  assert.equal(state.functions.length, 4);
  assert.equal(state.events.find((e) => e.id === "unit-0-next")!.scope.kind, "unit");
  assert.throws(() => execute(state, unitAdmin, { type: "addFunction", name: "Leitung" }, now), /Nur die Organisationsadministration/);
});
test("Berlin conversion validates calendar and DST gaps; ambiguous time uses earlier occurrence", () => {
  assert.equal(fromBerlin("2026-07-01T19:00"), "2026-07-01T17:00:00.000Z");
  assert.equal(fromBerlin("2026-11-01T19:00"), "2026-11-01T18:00:00.000Z");
  assert.throws(() => fromBerlin("2026-03-29T02:30"), /existiert/);
  assert.throws(() => fromBerlin("2026-02-30T12:00"), /existiert/);
  assert.equal(fromBerlin("2026-10-25T02:30"), "2026-10-25T00:30:00.000Z");
});
test("weekly, biweekly and monthly recurrences retain local wall time across DST; month-end clamps", () => {
  assert.equal(recurrenceInstant(fromBerlin("2026-03-22T19:00"), 1, "weekly"), fromBerlin("2026-03-29T19:00"));
  assert.equal(recurrenceInstant(fromBerlin("2026-10-18T19:00"), 1, "biweekly"), fromBerlin("2026-11-01T19:00"));
  assert.equal(recurrenceInstant(fromBerlin("2026-01-31T19:00"), 1, "monthly"), fromBerlin("2026-02-28T19:00"));
  assert.equal(recurrenceInstant(fromBerlin("2026-01-31T19:00"), 2, "monthly"), fromBerlin("2026-03-31T19:00"));
});
test("CSV quotes cells, uses UTF-8 BOM and neutralizes spreadsheet formulas", () => {
  const result = csv([["=HYPERLINK(\"bad\")", "+SUM(1)", "Normal;Text", "Ärmel"]]);
  assert.ok(result.startsWith("\uFEFF"));
  assert.match(result, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(result, /"'\+SUM\(1\)"/);
  assert.match(result, /"Normal;Text"/);
});
