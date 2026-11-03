import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeed } from "../data/seed";
import { stateSchema } from "./model";
import { canManageAttendance, isAdmin, manages } from "./permissions";
import { execute } from "./service";
import { confirmedEventCounts, eventCounts, personalStatistics } from "./statistics";

const now = new Date("2026-11-03T18:42:00.000Z");
const member = "person-0-0", admin = "person-0-1";
const no = "person-0-4", maybe = "person-0-5", unanswered = "person-0-6";
const eventId = "unit-0-live";

function setup() {
  const state = createSeed(now);
  const event = state.events.find((entry) => entry.id === eventId)!;
  state.events = [event];
  event.responses = { [member]: "yes", [no]: "no", [maybe]: "maybe" };
  return state;
}

test("prefill maps yes/no/maybe/no response and labels every generated entry provisional", () => {
  const state = setup();
  const next = execute(state, admin, { type: "prepareAttendance", eventId }, now);
  const event = next.events[0];
  assert.equal(event.attendance[member], "present");
  assert.equal(event.attendance[no], "absent");
  assert.equal(event.attendance[maybe], "unknown");
  assert.equal(event.attendance[unanswered], "unknown");
  assert.equal(event.attendancePreparedAt, now.toISOString());
  assert.equal(event.finalizedAt, undefined);
  assert.equal(event.attendancePrefilledIds?.length, event.roster.length);
  assert.deepEqual(state.events[0].attendance, {});
});

test("prefill preserves every manual value, including explicit unknown against a yes response", () => {
  let state = setup();
  state = execute(state, admin, { type: "attendance", eventId, userId: member, value: "unknown", reason: "" }, now);
  state = execute(state, admin, { type: "attendance", eventId, userId: no, value: "present", reason: "" }, now);
  state = execute(state, admin, { type: "prepareAttendance", eventId }, now);
  assert.equal(state.events[0].attendance[member], "unknown");
  assert.equal(state.events[0].attendance[no], "present");
  assert.ok(!state.events[0].attendancePrefilledIds?.includes(member));
  assert.ok(!state.events[0].attendancePrefilledIds?.includes(no));
});

test("prefill is idempotent across persisted reloads and never reapplies responses", () => {
  let state = execute(setup(), admin, { type: "prepareAttendance", eventId }, now);
  state = execute(state, admin, { type: "attendance", eventId, userId: member, value: "absent", reason: "" }, now);
  const saved = stateSchema.parse(JSON.parse(JSON.stringify(state)));
  const reopened = execute(saved, admin, { type: "prepareAttendance", eventId }, new Date(now.getTime() + 1000));
  assert.deepEqual(reopened, saved);
  assert.equal(reopened.events[0].attendance[member], "absent");
  assert.ok(!reopened.events[0].attendancePrefilledIds?.includes(member));
  assert.equal(reopened.audit.filter((entry) => entry.action === "Anwesenheit vorläufig vorbelegt").length, 1);
});

test("legacy version-one data retains existing manual and confirmed attendance without reset", () => {
  const state = setup();
  state.events[0].attendance[member] = "present";
  const loaded = stateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.equal(loaded.events[0].attendancePreparedAt, undefined);
  assert.equal(loaded.events[0].delegatedOrganizerId, undefined);
  const prepared = execute(loaded, admin, { type: "prepareAttendance", eventId }, now);
  assert.equal(prepared.events[0].attendance[member], "present");
  loaded.events[0].finalizedAt = now.toISOString();
  assert.deepEqual(execute(loaded, admin, { type: "prepareAttendance", eventId }, now), loaded);
  assert.equal(personalStatistics(loaded, member, 2026, now).attendanceCount, 1);
});

test("prefill enforces scope, exact start boundary, cancelled status and practice type", () => {
  const state = setup();
  const command = { type: "prepareAttendance" as const, eventId };
  assert.throws(() => execute(state, member, command, now), /Keine Berechtigung/);
  assert.throws(() => execute(state, "person-1-1", command, now), /Keine Berechtigung/);
  const start = new Date(state.events[0].startsAt);
  assert.throws(() => execute(state, admin, command, new Date(start.getTime() - 1)), /erst ab Dienstbeginn/);
  assert.ok(execute(state, admin, command, start).events[0].attendancePreparedAt);
  state.events[0].type = "training";
  assert.throws(() => execute(state, admin, command, now), /nur für reguläre Übungsdienste/);
  state.events[0].status = "cancelled";
  assert.throws(() => execute(state, admin, command, now), /abgesagte Termine/);
});

test("provisional entries never contribute participation, hours, quota or confirmed area counts", () => {
  let state = execute(setup(), admin, { type: "prepareAttendance", eventId }, now);
  const before = personalStatistics(state, member, 2026, now);
  assert.equal(before.practiceCount, 1);
  assert.equal(before.confirmedPracticeCount, 0);
  assert.equal(before.pendingCount, 1);
  assert.equal(before.attendanceCount, 0);
  assert.equal(before.attendedPractices, 0);
  assert.equal(before.hours, 0);
  assert.equal(before.rate, 0);
  assert.deepEqual(before.visited, []);
  assert.equal(eventCounts(state.events[0]).present, 1);
  assert.equal(confirmedEventCounts(state.events[0]).present, 0);
  assert.equal(confirmedEventCounts(state.events[0]).absent, 0);
  state = execute(state, admin, { type: "attendance", eventId, userId: no, value: "present", reason: "" }, now);
  assert.equal(personalStatistics(state, no, 2026, now).attendanceCount, 0);
});

test("whole-list confirmation counts present exactly once and preserves unresolved entries", () => {
  let state = execute(setup(), admin, { type: "prepareAttendance", eventId }, now);
  state = execute(state, admin, { type: "finalize", eventId }, now);
  const stats = personalStatistics(state, member, 2026, now);
  assert.equal(stats.attendanceCount, 1);
  assert.equal(stats.attendedPractices, 1);
  assert.equal(stats.hours, 2);
  assert.equal(stats.rate, 100);
  assert.equal(stats.confirmedPracticeCount, 1);
  assert.equal(stats.pendingCount, 0);
  assert.equal(confirmedEventCounts(state.events[0]).present, 1);
  assert.equal(confirmedEventCounts(state.events[0]).absent, 1);
  assert.equal(confirmedEventCounts(state.events[0]).unknown, 48);
  for (const id of [maybe, unanswered]) {
    assert.equal(state.events[0].attendance[id], "unknown");
    assert.equal(personalStatistics(state, id, 2026, now).attendanceCount, 0);
  }
  assert.throws(() => execute(state, admin, { type: "finalize", eventId }, now), /bereits abgeschlossen/);
});

test("delegation grants only this event's roster and attendance capabilities, never roles", () => {
  let state = setup();
  const roles = structuredClone(state.users[0].roles);
  state.events[0].organizerId = member;
  assert.equal(canManageAttendance(state.users[0], state.events[0]), false);
  state = execute(state, admin, { type: "assignOrganizer", eventId, userId: member }, now);
  assert.deepEqual(state.users[0].roles, roles);
  assert.equal(isAdmin(state.users[0]), false);
  assert.equal(manages(state.users[0], state.events[0].scope), false);
  assert.equal(canManageAttendance(state.users[0], state.events[0]), true);
  state = execute(state, member, { type: "prepareAttendance", eventId }, now);
  state = execute(state, member, { type: "attendance", eventId, userId: no, value: "present", reason: "" }, now);
  state = execute(state, member, { type: "finalize", eventId }, now);
  assert.equal(state.events[0].attendance[no], "present");
  assert.equal(state.events[0].finalizedAt, now.toISOString());
  assert.throws(() => execute(state, member, { type: "assignOrganizer", eventId, userId: no }, now), /Keine Berechtigung/);
  assert.throws(() => execute(state, member, { type: "cancelEvent", eventId, reason: "Darf ich nicht" }, now), /Keine Berechtigung/);
  const { title, description, type, startsAt, endsAt, location, scope } = state.events[0];
  assert.throws(() => execute(state, member, { type: "editEvent", eventId, input: { title, description, type, startsAt, endsAt, location, scope } }, now), /Keine Berechtigung/);
});

test("delegation never grants access to other events or series siblings", () => {
  let state = setup();
  const first = state.events[0];
  first.seriesId = "series";
  state.events.push({ ...structuredClone(first), id: "sibling" });
  state = execute(state, admin, { type: "assignOrganizer", eventId, userId: member }, now);
  assert.equal(state.events[1].delegatedOrganizerId, undefined);
  assert.equal(canManageAttendance(state.users[0], state.events[1]), false);
  for (const type of ["prepareAttendance", "finalize"] as const) {
    assert.throws(() => execute(state, member, { type, eventId: "sibling" }, now), /Keine Berechtigung/);
  }
  assert.throws(() => execute(state, member, { type: "attendance", eventId: "sibling", userId: member, value: "present", reason: "" }, now), /Keine Berechtigung/);
});

test("only the responsible scoped administrator can assign eligible roster members", () => {
  const state = setup();
  const command = { type: "assignOrganizer" as const, eventId, userId: member };
  for (const actor of [member, "person-1-1", "person-0-2"]) {
    assert.throws(() => execute(state, actor, command, now), /Keine Berechtigung/);
  }
  for (const userId of ["missing", "person-1-0"]) {
    assert.throws(() => execute(state, admin, { ...command, userId }, now), /Teilnehmerkreis/);
  }
  state.events[0].status = "cancelled";
  assert.throws(() => execute(state, admin, command, now), /abgesagte Termine/);
});

test("function delegation accepts participants from other units without granting other function rights", () => {
  const state = createSeed(now);
  const event = state.events.find((entry) => entry.id === "breathing-next")!;
  event.startsAt = new Date(now.getTime() - 1000).toISOString();
  const actor = "person-1-0";
  let next = execute(state, "person-0-2", { type: "assignOrganizer", eventId: event.id, userId: actor }, now);
  const person = next.users.find((entry) => entry.id === actor)!;
  assert.ok(person.functionIds.includes("breathing") && person.functionIds.includes("equipment"));
  assert.equal(canManageAttendance(person, next.events.find((entry) => entry.id === event.id)!), true);
  assert.equal(canManageAttendance(person, next.events.find((entry) => entry.id === "equipment-next")!), false);
  next = execute(next, actor, { type: "attendance", eventId: event.id, userId: member, value: "present", reason: "" }, now);
  assert.equal(next.events.find((entry) => entry.id === event.id)!.attendance[member], "present");
  assert.throws(() => execute(next, admin, { type: "assignOrganizer", eventId: event.id, userId: member }, now), /Keine Berechtigung/);
});

test("revoking or replacing delegation immediately removes former organizer's extra rights", () => {
  let state = execute(setup(), admin, { type: "assignOrganizer", eventId, userId: member }, now);
  state = execute(state, admin, { type: "assignOrganizer", eventId, userId: no }, now);
  assert.equal(canManageAttendance(state.users[0], state.events[0]), false);
  assert.equal(state.audit[0].action, "Organisator zugewiesen");
  state = execute(state, admin, { type: "assignOrganizer", eventId, userId: null }, now);
  assert.equal(state.events[0].delegatedOrganizerId, undefined);
  assert.equal(state.audit[0].action, "Delegation widerrufen");
  for (const actor of [member, no]) {
    assert.throws(() => execute(state, actor, { type: "prepareAttendance", eventId }, now), /Keine Berechtigung/);
    assert.throws(() => execute(state, actor, { type: "attendance", eventId, userId: member, value: "present", reason: "Kein Zugriff mehr" }, now), /Keine Berechtigung/);
    assert.throws(() => execute(state, actor, { type: "finalize", eventId }, now), /Keine Berechtigung/);
  }
});

test("delegated corrections of closed lists require reason and log actor, time, before/after and event", () => {
  let state = execute(setup(), admin, { type: "assignOrganizer", eventId, userId: member }, now);
  state = execute(state, member, { type: "prepareAttendance", eventId }, now);
  state = execute(state, member, { type: "finalize", eventId }, now);
  const command = { type: "attendance" as const, eventId, userId: member, value: "absent" as const, reason: "" };
  assert.throws(() => execute(state, member, command, now), /Korrekturgrund/);
  state = execute(state, member, { ...command, reason: "Vor Ort abgeglichen" }, now);
  const entry = state.audit[0];
  assert.equal(entry.action, "Anwesenheit korrigiert");
  assert.equal(entry.actorId, member);
  assert.equal(entry.at, now.toISOString());
  assert.equal(entry.targetId, eventId);
  assert.match(entry.detail, /person-0-0: present → absent; Grund: Vor Ort abgeglichen/);
  assert.equal(personalStatistics(state, member, 2026, now).attendanceCount, 0);
  assert.equal(state.events[0].finalizedAt, now.toISOString());
  state = execute(state, admin, { type: "assignOrganizer", eventId, userId: null }, now);
  assert.throws(() => execute(state, member, { ...command, reason: "Nach Widerruf versucht" }, now), /Keine Berechtigung/);
});

test("historical roster eligibility survives unit changes and missing roster delegation is invalid", () => {
  let state = execute(setup(), admin, { type: "assignOrganizer", eventId, userId: member }, now);
  state.users[0].unitId = "unit-1";
  assert.equal(canManageAttendance(state.users[0], state.events[0]), true);
  state = execute(state, member, { type: "prepareAttendance", eventId }, now);
  state.events[0].roster = state.events[0].roster.filter((person) => person.userId !== member);
  assert.equal(canManageAttendance(state.users[0], state.events[0]), false);
  assert.throws(() => execute(state, member, { type: "finalize", eventId }, now), /Keine Berechtigung/);
});

test("automatic drafts do not prevent cancellation, while manual actual values still do", () => {
  const prepared = execute(setup(), admin, { type: "prepareAttendance", eventId }, now);
  const cancelled = execute(prepared, admin, { type: "cancelEvent", eventId, reason: "Übung fällt aus" }, now);
  assert.equal(cancelled.events[0].status, "cancelled");
  assert.equal(personalStatistics(cancelled, member, 2026, now).practiceCount, 0);
  const manual = execute(prepared, admin, { type: "attendance", eventId, userId: member, value: "present", reason: "" }, now);
  assert.throws(() => execute(manual, admin, { type: "cancelEvent", eventId, reason: "Nicht mehr möglich" }, now), /erfasster Anwesenheit/);
});

test("pending lists cannot lower the final quota of confirmed exercises", () => {
  let state = execute(setup(), admin, { type: "prepareAttendance", eventId }, now);
  state = execute(state, admin, { type: "finalize", eventId }, now);
  const pending = structuredClone(state.events[0]);
  pending.id = "pending";
  delete pending.finalizedAt;
  pending.attendance[member] = "absent";
  state.events.push(pending);
  const stats = personalStatistics(state, member, 2026, now);
  assert.equal(stats.practiceCount, 2);
  assert.equal(stats.confirmedPracticeCount, 1);
  assert.equal(stats.attendedPractices, 1);
  assert.equal(stats.rate, 100);
  assert.equal(stats.hours, 2);
});
