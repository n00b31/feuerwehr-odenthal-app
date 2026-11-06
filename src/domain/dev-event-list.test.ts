import { test } from "node:test";
import assert from "node:assert/strict";
import { eventListParameters, monthLabel, monthKeySchema } from "./dev-event-list";
test("default event query is bounded upcoming and carries no identity or authorization", () => {
  assert.deepEqual(eventListParameters(), {
    list_view: "upcoming", month_key: null, status_filter: "all", after_start: null, after_id: null, retained_ids: [],
  });
});
test("month query retains stable cursor, explicit status and authorized open-event request", () => {
  const id = "30000000-0000-4000-8000-000000000001";
  assert.deepEqual(eventListParameters({ view: "month", month: "2027-03", status: "scheduled" },
    { starts_at: "2027-03-28T00:30:00Z", id }, [id]), {
    list_view: "month", month_key: "2027-03", status_filter: "scheduled", after_start: "2027-03-28T00:30:00Z",
    after_id: id, retained_ids: [id],
  });
});
test("month picker rejects invalid months and displays German year boundaries", () => {
  for (const invalid of ["", "2027-13", "2026-00", "2027-2", "1999-12", "9999-12", "2027-02-01"]) {
    assert.equal(monthKeySchema.safeParse(invalid).success, false);
  }
  assert.equal(monthLabel("2026-12"), "Dezember 2026");
  assert.equal(monthLabel("2027-01"), "Januar 2027");
});
