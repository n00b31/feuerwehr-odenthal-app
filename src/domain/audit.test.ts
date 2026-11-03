import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeed } from "../data/seed";
import { auditDisplay } from "./audit";
import { stateSchema, type AuditEntry, type EventInput } from "./model";
import { execute } from "./service";
import { dateLabel } from "./time";

const now = new Date("2026-11-03T18:42:00.000Z");
const member = "person-0-0", admin = "person-0-1", globalAdmin = "person-0-3";
const eventId = "unit-0-live";
function legacy(entry: AuditEntry): AuditEntry {
  const copy = structuredClone(entry);
  delete copy.display;
  return copy;
}

test("legacy attendance audit resolves people and event title/date without rewriting raw evidence", () => {
  const state = createSeed(now);
  const entry: AuditEntry = {
    id: "legacy", at: now.toISOString(), actorId: admin, targetId: eventId,
    action: "Anwesenheit korrigiert", detail: `${member}: present → absent; Grund: Vor Ort geprüft`,
  };
  const before = structuredClone(entry);
  const display = auditDisplay(state, entry);
  assert.equal(display.actor, "Lukas Weber");
  assert.equal(display.detail, "Anna Berg: Anwesend → Abwesend; Grund: Vor Ort geprüft");
  assert.match(display.target, /^Termin: Praxisdienst · Technische Hilfe/);
  assert.ok(display.target.includes(dateLabel(state.events.find((event) => event.id === eventId)!.startsAt, { year: "numeric" })));
  assert.ok(display.target.includes("19:12 Uhr (Berlin) · Scheuren"));
  assert.ok(!JSON.stringify(display).includes(member) && !JSON.stringify(display).includes(eventId));
  assert.deepEqual(entry, before);
});

test("new display snapshots survive reloads, changed names and rescheduled event labels", () => {
  const state = execute(createSeed(now), admin, { type: "attendance", eventId, userId: member, value: "present", reason: "" }, now);
  const expected = structuredClone(state.audit[0].display);
  assert.ok(expected);
  const loaded = stateSchema.parse(JSON.parse(JSON.stringify(state)));
  loaded.users[0].name = "Anderer Name";
  loaded.users[1].name = "Andere Leitung";
  const event = loaded.events.find((entry) => entry.id === eventId)!;
  event.title = "Anderer Titel";
  event.startsAt = "2027-01-03T18:00:00.000Z";
  assert.deepEqual(auditDisplay(loaded, loaded.audit[0]), expected);
  assert.equal(expected.actor, "Lukas Weber");
  assert.match(expected.detail, /^Anna Berg:/);
  assert.match(expected.target, /2026/);
  delete loaded.audit[0].display;
  assert.ok(stateSchema.safeParse(loaded).success);
});

test("delegation assignment, replacement and revocation show names instead of person IDs", () => {
  let state = execute(createSeed(now), admin, { type: "assignOrganizer", eventId, userId: member }, now);
  assert.match(auditDisplay(state, legacy(state.audit[0])).detail, /^Keine Delegation → Anna Berg/);
  state = execute(state, admin, { type: "assignOrganizer", eventId, userId: "person-0-4" }, now);
  assert.match(auditDisplay(state, legacy(state.audit[0])).detail, /^Anna Berg → Jana Wagner/);
  state = execute(state, admin, { type: "assignOrganizer", eventId, userId: null }, now);
  assert.match(auditDisplay(state, legacy(state.audit[0])).detail, /^Jana Wagner → Keine Delegation/);
});

test("prefill audit summarizes provisional counts instead of a JSON wall of IDs", () => {
  const state = createSeed(now);
  state.events.find((event) => event.id === eventId)!.responses = { [member]: "yes", "person-0-4": "no", "person-0-5": "maybe" };
  const prepared = execute(state, admin, { type: "prepareAttendance", eventId }, now);
  const display = auditDisplay(prepared, legacy(prepared.audit[0]));
  assert.match(display.detail, /1 anwesend, 1 abwesend, 48 nicht festgestellt/);
  assert.match(display.detail, /noch nicht bestätigt/);
  assert.ok(!display.detail.includes("person-"));
  assert.ok(prepared.audit[0].detail.includes(member));
});

test("membership, function and role audit resolves all scoped names", () => {
  let state = execute(createSeed(now), globalAdmin, { type: "member", userId: member, unitId: "unit-1", functionIds: ["clothing"] }, now);
  let display = auditDisplay(state, legacy(state.audit[0]));
  assert.equal(display.target, "Mitglied: Anna Berg");
  assert.match(display.detail, /Einheit: Scheuren → Odenthal; Sonderfunktionen: Atemschutz, Gerätewarte → Kleiderkammer/);
  state = execute(state, globalAdmin, { type: "functionMember", userId: member, functionId: "breathing", assigned: true }, now);
  assert.match(auditDisplay(state, legacy(state.audit[0])).detail, /^Atemschutz: zugeordnet/);
  state = execute(state, globalAdmin, { type: "roles", userId: member, roles: [{ role: "UNIT_ADMIN", scopeId: "unit-1" }, { role: "FUNCTION_ADMIN", scopeId: "breathing" }] }, now);
  display = auditDisplay(state, legacy(state.audit[0]));
  assert.equal(display.detail, "Mitglied → Einheitsadministration · Odenthal, Funktionsadministration · Atemschutz");
});

test("series and event edits display readable dates and scopes, preserving user-written descriptions", () => {
  const input: EventInput = {
    title: "Testserie", description: "Freitext person-0-0: unknown → present; Nachher: weiterhin Freitext",
    type: "regular", scope: { kind: "unit", id: "unit-0" },
    startsAt: "2026-11-10T18:00:00.000Z", endsAt: "2026-11-10T20:00:00.000Z", location: "Gerätehaus",
  };
  let state = execute(createSeed(now), admin, { type: "createEvent", input, repeat: "weekly", count: 2 }, now);
  assert.equal(auditDisplay(state, legacy(state.audit[0])).detail, "Testserie; Serieninstanz 2");
  const event = state.events.find((entry) => entry.seriesId)!;
  state = execute(state, admin, { type: "editEvent", eventId: event.id, input: { ...input, title: "Neuer Titel" } }, now);
  const display = auditDisplay(state, legacy(state.audit[0]));
  assert.match(display.detail, /Titel: Testserie/);
  assert.match(display.detail, /Nachher: Titel: Neuer Titel/);
  assert.match(display.detail, /Bereich: Scheuren/);
  assert.match(display.detail, /19:00 Uhr \(Berlin\)/);
  assert.ok(display.detail.includes(input.description));
  assert.ok(!display.detail.includes('"scope"') && !display.detail.includes("unit-0"));
});

test("correction reasons and cancellation text remain verbatim instead of blindly replacing tokens", () => {
  const reason = "Beleg person-0-4: unknown → present; intern notiert";
  let state = execute(createSeed(now), admin, { type: "attendance", eventId, userId: member, value: "present", reason: "" }, now);
  state = execute(state, admin, { type: "finalize", eventId }, now);
  state = execute(state, admin, { type: "attendance", eventId, userId: member, value: "absent", reason }, now);
  assert.equal(auditDisplay(state, legacy(state.audit[0])).detail, `Anna Berg: Anwesend → Abwesend; Grund: ${reason}`);
  const cancelled = execute(createSeed(now), admin, { type: "cancelEvent", eventId: "unit-0-next", reason }, now);
  assert.equal(auditDisplay(cancelled, legacy(cancelled.audit[0])).detail, reason);
});

test("missing references and malformed legacy details are explicit, not guessed or discarded", () => {
  const state = createSeed(now);
  const entry: AuditEntry = {
    id: "missing", at: now.toISOString(), actorId: "deleted-actor", targetId: "deleted-event",
    action: "Anwesenheit korrigiert", detail: "deleted-person: unknown → present",
  };
  const display = auditDisplay(state, entry);
  assert.equal(display.actor, "Person nicht mehr verfügbar");
  assert.equal(display.target, "Protokollziel nicht mehr verfügbar");
  assert.equal(display.detail, "Person nicht mehr verfügbar: Nicht festgestellt → Anwesend");
  const malformed = auditDisplay(state, { ...entry, action: "Anwesenheit vorläufig vorbelegt", detail: "Vorbelegung: {kaputt" });
  assert.match(malformed.detail, /konnten nicht aufbereitet werden/);
  assert.match(malformed.detail, /Technische Details/);
  assert.equal(entry.detail, "deleted-person: unknown → present");
});
