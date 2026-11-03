import { test } from "node:test";
import assert from "node:assert/strict";
import { eventPayload, responseCounts, devEventPayloadSchema, eventErrorMessage, type DevEventDraft } from "./dev-events";

const draft: DevEventDraft = {
  title: "  DEV Testdienst  ", description: "Nur Testdaten", location: "Testort", event_type: "regular",
  unit_id: "20000000-0000-4000-8000-000000000001", start: "2026-12-01T19:00",
  end: "2026-12-01T21:00", deadline: "",
};
test("DEV event payload uses Berlin time, trims title and never carries demo roster or roles", () => {
  const result = eventPayload(draft);
  assert.equal(result.starts_at, "2026-12-01T18:00:00.000Z");
  assert.equal(result.title, "DEV Testdienst");
  assert.equal(result.response_deadline, null);
  assert.deepEqual(Object.keys(result).sort(), ["title","description","event_type","location","unit_id","starts_at","ends_at","response_deadline"].sort());
});
test("DEV payload rejects inverted intervals and deadlines after start", () => {
  assert.throws(() => eventPayload({ ...draft, end: draft.start }), /Ende/);
  assert.throws(() => eventPayload({ ...draft, deadline: "2026-12-01T20:00" }), /Anmeldeschluss/);
});
test("DEV payload rejects nonexistent Berlin DST input and chooses earlier ambiguous time", () => {
  assert.throws(() => eventPayload({ ...draft, start: "2027-03-28T02:30" }), /Zeitumstellung/);
  assert.equal(eventPayload({ ...draft, start: "2027-10-31T02:30", end: "2027-10-31T04:00" }).starts_at, "2027-10-31T00:30:00.000Z");
});
test("DEV payload validates required fields and six event types", () => {
  assert.throws(() => eventPayload({ ...draft, title: "ab" }));
  assert.throws(() => eventPayload({ ...draft, location: "" }));
  assert.throws(() => devEventPayloadSchema.parse({ ...eventPayload(draft), event_type: "unknown" }));
});
test("planned response counts explicitly include unanswered, not actual attendance", () => {
  assert.deepEqual(responseCounts([{ response: "yes" }, { response: "no" }, { response: "maybe" }, { response: null }, { response: "yes" }]),
    { yes: 2, no: 1, maybe: 1, unanswered: 1 });
});
test("event errors disclose failure and stale revisions instead of success", () => {
  assert.match(eventErrorMessage({ code: "40001", message: "Termin wurde geändert." }), /geändert/);
  assert.match(eventErrorMessage({ code: "PGRST202" }), /Migration 006/);
  assert.match(eventErrorMessage({ code: "503" }), /kein erfolgreicher Abschluss/);
});
