import { z } from "zod";
import { devEventTypeSchema, devResponseSchema, eventErrorMessage } from "./dev-events";

export const attendanceStatusSchema = z.enum(["present", "absent", "unknown"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;
export const attendanceStateSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CORRECTED"]);
export const attendanceLabels = { present: "Anwesend", absent: "Abwesend", unknown: "Nicht festgestellt" } as const;
export const attendanceStateLabels = {
  NOT_STARTED: "Noch nicht begonnen", IN_PROGRESS: "In Bearbeitung", COMPLETED: "Verbindlich abgeschlossen", CORRECTED: "Nachträglich korrigiert",
} as const;
const timestamp = z.iso.datetime({ offset: true });
export const attendanceWorkspaceSchema = z.object({
  server_now: timestamp, event_id: z.uuid(), title: z.string(), starts_at: timestamp, ends_at: timestamp,
  event_status: z.enum(["scheduled", "cancelled"]), scope_name: z.string(), event_type: devEventTypeSchema,
  state: attendanceStateSchema, initialized_at: timestamp.nullable(), initialized_by: z.string().nullable(),
  prepared_at: timestamp.nullable(), corrected_at: timestamp.nullable(),
  confirmed_at: timestamp.nullable(), confirmed_by: z.string().nullable(),
  can_manage: z.boolean(), can_delegate: z.boolean(), organizer_name: z.string(),
  primary_organizer: z.object({ user_id: z.uuid(), name: z.string(), note: z.string().nullable(), access_granted: z.boolean() }).nullable(),
  candidates: z.array(z.object({ id: z.uuid(), name: z.string() })),
  members: z.array(z.object({
    user_id: z.uuid(), name: z.string(), response: devResponseSchema.nullable(), response_known: z.boolean(),
    status: attendanceStatusSchema.nullable(), origin: z.enum(["prefill", "manual"]).nullable(), recorded_at: timestamp.nullable(),
  })),
}).refine((data) => !isAttendanceFinal(data.state) || (!!data.confirmed_at && data.members.length > 0
  && data.members.every((person) => person.status === "present" || person.status === "absent")),
"Abgeschlossene Anwesenheitsliste ist unvollständig; Supabase-Daten prüfen.");
export type AttendanceWorkspace = z.infer<typeof attendanceWorkspaceSchema>;

export function isAttendanceFinal(state: z.infer<typeof attendanceStateSchema>) {
  return state === "COMPLETED" || state === "CORRECTED";
}
export function attendanceCounts(members: { status: AttendanceStatus | null }[]) {
  const counts = { present: 0, absent: 0, unknown: 0, total: members.length };
  for (const member of members) counts[member.status ?? "unknown"]++;
  return counts;
}
export function canCompleteAttendance(data: AttendanceWorkspace) {
  const counts = attendanceCounts(data.members);
  return data.can_manage && data.event_status === "scheduled" && Date.parse(data.server_now) >= Date.parse(data.starts_at)
    && !isAttendanceFinal(data.state) && counts.total > 0 && counts.unknown === 0
    && (!(data.event_type === "regular" || data.event_type === "special") || !!data.prepared_at);
}
export function attendanceErrorMessage(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "PGRST202" || code === "PGRST204") return "Anwesenheit noch nicht verfügbar. Supabase-Migration 010 und Data-API-Schema prüfen.";
  if (code === "42501") return "Anfrage abgewiesen: Berechtigung, Dienstbeginn und Listenstatus prüfen. Ein Abschluss erfordert vollständig festgestellte Anwesenheiten; nachträgliche Korrekturen benötigen einen Grund und dürfen nicht auf „Nicht festgestellt“ zurücksetzen.";
  return eventErrorMessage(error);
}
