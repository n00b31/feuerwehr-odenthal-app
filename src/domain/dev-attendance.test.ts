import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceCounts, attendanceWorkspaceSchema, canCompleteAttendance, isAttendanceFinal, attendanceErrorMessage } from "./dev-attendance";

const base = attendanceWorkspaceSchema.parse({
  server_now: "2026-11-06T18:00:00Z", event_id: "30000000-0000-4000-8000-000000000001",
  title: "Synthetic practice", starts_at: "2026-11-06T18:00:00Z", ends_at: "2026-11-06T20:00:00Z",
  event_status: "scheduled", scope_name: "Synthetic unit", event_type: "regular", state: "IN_PROGRESS",
  initialized_at: "2026-11-06T18:00:00Z", initialized_by: "Synthetic organizer", prepared_at: "2026-11-06T18:00:00Z",
  corrected_at: null, confirmed_at: null, confirmed_by: null, can_manage: true, can_delegate: true,
  organizer_name: "Synthetic organizer", primary_organizer: null, candidates: [],
  members: [{ user_id: "10000000-0000-4000-8000-000000000001", name: "Synthetic member", response: "yes",
    response_known: true, status: "present", origin: "prefill", recorded_at: "2026-11-06T18:00:00Z" }],
});
test("attendance counts never use yes/no/maybe as actual status", () => {
  assert.deepEqual(attendanceCounts([{ status: "present" }, { status: "absent" }, { status: "unknown" }, { status: null }]),
    { present: 1, absent: 1, unknown: 2, total: 4 });
});
test("only completed and corrected lists are final", () => {
  assert.equal(isAttendanceFinal("NOT_STARTED"), false); assert.equal(isAttendanceFinal("IN_PROGRESS"), false);
  assert.equal(isAttendanceFinal("COMPLETED"), true); assert.equal(isAttendanceFinal("CORRECTED"), true);
});
test("complete action requires determined nonempty roster", () => {
  assert.equal(canCompleteAttendance(base), true);
  assert.equal(canCompleteAttendance({ ...base, members: [] }), false);
  assert.equal(canCompleteAttendance({ ...base, members: [{ ...base.members[0], status: "unknown" }] }), false);
  assert.equal(canCompleteAttendance({ ...base, members: [{ ...base.members[0], status: null }] }), false);
});
test("complete action uses server timestamp at the exact boundary", () => {
  assert.equal(canCompleteAttendance({ ...base, server_now: "2026-11-06T17:59:59.999Z" }), false);
  assert.equal(canCompleteAttendance(base), true);
});
test("read-only, cancelled and already final lists cannot be completed", () => {
  assert.equal(canCompleteAttendance({ ...base, can_manage: false }), false);
  assert.equal(canCompleteAttendance({ ...base, event_status: "cancelled" }), false);
  assert.equal(canCompleteAttendance({ ...base, state: "COMPLETED" }), false);
});
test("practice completion requires persisted one-time preparation", () => {
  assert.equal(canCompleteAttendance({ ...base, prepared_at: null }), false);
  assert.equal(canCompleteAttendance({ ...base, prepared_at: null, event_type: "other" }), true);
});
test("invalid final RPC data is rejected instead of rendered as completed", () => {
  assert.throws(() => attendanceWorkspaceSchema.parse({ ...base, state: "COMPLETED" }));
  assert.throws(() => attendanceWorkspaceSchema.parse({ ...base, state: "COMPLETED", confirmed_at: base.server_now,
    members: [{ ...base.members[0], status: "unknown" }] }));
  assert.equal(attendanceWorkspaceSchema.parse({ ...base, state: "COMPLETED", confirmed_at: base.server_now }).state, "COMPLETED");
});
test("attendance errors explain migration and denied writes without claiming success", () => {
  assert.match(attendanceErrorMessage({ code: "PGRST202" }), /Migration 010/);
  assert.match(attendanceErrorMessage({ code: "42501" }), /Anfrage abgewiesen/);
  assert.match(attendanceErrorMessage({ code: "503" }), /kein erfolgreicher Abschluss/);
});
