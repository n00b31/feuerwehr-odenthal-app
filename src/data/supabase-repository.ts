import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { devResponseSchema, devEventTypeSchema, devEventPayloadSchema, type DevEventPayload, type DevResponse } from "@/domain/dev-events";
import { memberRoleSchema, membersWorkspaceSchema, memberRoleInputSchema, memberReasonSchema } from "@/domain/dev-members";
import { attendanceWorkspaceSchema, attendanceStateSchema, attendanceStatusSchema, type AttendanceStatus } from "@/domain/dev-attendance";

const roleSchema = memberRoleSchema;
export const accessSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
  account_status: z.enum(["pending", "approved", "rejected", "suspended"]),
  access_granted: z.boolean(),
  unit_id: z.uuid().nullable(),
  unit_name: z.string().nullable(),
  roles: z.array(roleSchema),
}).refine((value) => !value.access_granted || (
  value.account_status === "approved" && value.unit_id !== null && value.unit_name !== null
), "Freigabe erfordert einen genehmigten Account mit Einheit.");
export type Access = z.infer<typeof accessSchema>;
export const devEventSchema = z.object({
  id: z.uuid(), title: z.string(), description: z.string(),
  event_type: devEventTypeSchema,
  starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }), location: z.string(),
  status: z.enum(["scheduled", "cancelled"]),
  unit_id: z.uuid().nullable(), series_id: z.uuid().nullable(),
  response_deadline: z.iso.datetime({ offset: true }).nullable(),
  revision: z.number().int().nonnegative(), scope_name: z.string(),
  can_manage: z.boolean(), can_lead: z.boolean(), in_roster: z.boolean(),
  can_delegate: z.boolean(), can_read_attendance: z.boolean(), attendance_state: attendanceStateSchema,
  own_attendance: z.enum(["present", "absent"]).nullable(),
  own_response: devResponseSchema.nullable(),
  participants: z.array(z.object({
    user_id: z.uuid(), name: z.string(), response: devResponseSchema.nullable(),
    updated_at: z.iso.datetime({ offset: true }).nullable(),
  })).nullable(),
});
export type DevEvent = z.infer<typeof devEventSchema>;
export const eventWorkspaceSchema = z.object({
  server_now: z.iso.datetime({ offset: true }),
  manageable_units: z.array(z.object({ id: z.uuid(), name: z.string() })),
  events: z.array(devEventSchema),
});
export type EventWorkspace = z.infer<typeof eventWorkspaceSchema>;
const documentSchema = z.object({
  id: z.uuid(), name: z.string(), description: z.string(),
  sharepoint_url: z.url().regex(/^https:\/\/[^/@?#\s]+\.sharepoint\.com\//),
});
const attendanceSchema = z.object({
  event_id: z.uuid(), user_id: z.uuid(), title: z.string(), starts_at: z.string(),
  status: z.enum(["present", "absent", "unknown"]), report_year: z.number(), training_hours: z.coerce.number(),
});
const unitSchema = z.object({ id: z.uuid(), name: z.string() });
const registrationSchema = z.object({
  user_id: z.uuid(), display_name: z.string(), email: z.string(),
  email_verified: z.boolean(), registered_at: z.string(),
});
export type PendingRegistration = z.infer<typeof registrationSchema>;
export type DevData = EventWorkspace & {
  documents: z.infer<typeof documentSchema>[];
  attendance: z.infer<typeof attendanceSchema>[];
  units: z.infer<typeof unitSchema>[];
  registrations: PendingRegistration[];
};

function checked<T>(result: { data: T; error: { message: string } | null }) {
  if (result.error) throw result.error;
  return result.data;
}

export async function readAccess(client: SupabaseClient): Promise<Access> {
  return accessSchema.parse(checked(await client.rpc("ff_my_access").single()));
}

// No query is made until ff_my_access has confirmed live, server-side approval.
export async function readDevData(client: SupabaseClient, access: Access): Promise<DevData> {
  if (!access.access_granted) throw new Error("Freigabe erforderlich.");
  const [events, documents, attendance, units, registrations] = await Promise.all([
    readEventWorkspace(client),
    client.from("document_areas").select("id,name,description,sharepoint_url").order("name"),
    client.from("confirmed_attendance").select("event_id,user_id,title,starts_at,status,report_year,training_hours")
      .eq("user_id", access.user_id).order("starts_at", { ascending: false }),
    client.from("units").select("id,name").order("name"),
    access.roles.includes("GLOBAL_ADMIN") ? client.rpc("ff_pending_registrations") : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    ...events,
    documents: z.array(documentSchema).parse(checked(documents)),
    attendance: z.array(attendanceSchema).parse(checked(attendance)),
    units: z.array(unitSchema).parse(checked(units)),
    registrations: z.array(registrationSchema).parse(checked(registrations)),
  };
}

export async function readEventWorkspace(client: SupabaseClient): Promise<EventWorkspace> {
  return eventWorkspaceSchema.parse(checked(await client.rpc("ff_events_workspace")));
}
export async function readAttendanceWorkspace(client: SupabaseClient, eventId: string) {
  return attendanceWorkspaceSchema.parse(checked(await client.rpc("ff_attendance_workspace", { target_event: z.uuid().parse(eventId) })));
}
export async function prepareAttendance(client: SupabaseClient, eventId: string) {
  checked(await client.rpc("ff_prepare_attendance", { target_event: z.uuid().parse(eventId) }));
}
export async function recordAttendance(client: SupabaseClient, eventId: string, userId: string, status: AttendanceStatus, reason?: string) {
  checked(await client.rpc("ff_record_attendance", {
    target_event: z.uuid().parse(eventId), target_user: z.uuid().parse(userId), attendance_status: attendanceStatusSchema.parse(status),
    reason: reason === undefined ? null : memberReasonSchema.parse(reason),
  }));
}
export async function completeAttendance(client: SupabaseClient, eventId: string) {
  checked(await client.rpc("ff_confirm_attendance", { target_event: z.uuid().parse(eventId) }));
}
export async function assignOrganizer(client: SupabaseClient, eventId: string, userId: string | null, note: string) {
  checked(await client.rpc("ff_set_primary_organizer", {
    target_event: z.uuid().parse(eventId), target_user: z.uuid().nullable().parse(userId),
    internal_note: z.string().trim().max(2000, "Interne Notiz: höchstens 2000 Zeichen.").parse(note),
  }));
}

export async function saveSingleEvent(client: SupabaseClient, input: DevEventPayload, event?: { id: string; revision: number }) {
  const payload = devEventPayloadSchema.parse(input);
  if (event) {
    z.uuid().parse(event.id);
    z.number().int().nonnegative().parse(event.revision);
    checked(await client.rpc("ff_update_single_event", { target_event: event.id, expected_revision: event.revision, input: payload }));
  } else {
    if (!payload.unit_id) throw new Error("Einheit erforderlich.");
    checked(await client.rpc("ff_create_single_event", { input: payload }));
  }
}
export async function cancelSingleEvent(client: SupabaseClient, event: DevEvent, reason: string) {
  z.uuid().parse(event.id);
  z.string().trim().min(5, "Absagegrund: mindestens fünf Zeichen.").max(2000).parse(reason);
  checked(await client.rpc("ff_cancel_single_event", { target_event: event.id, expected_revision: event.revision, reason: reason.trim() }));
}
export async function setEventResponse(client: SupabaseClient, eventId: string, response: DevResponse) {
  z.uuid().parse(eventId);
  devResponseSchema.parse(response);
  checked(await client.rpc("ff_set_response", { target_event: eventId, answer: response }));
}
export async function correctEventResponse(client: SupabaseClient, eventId: string, userId: string, response: DevResponse, reason: string) {
  z.uuid().parse(eventId); z.uuid().parse(userId); devResponseSchema.parse(response);
  z.string().trim().min(5, "Korrekturgrund: mindestens fünf Zeichen.").max(2000).parse(reason);
  checked(await client.rpc("ff_set_member_response", { target_event: eventId, target_user: userId, answer: response, reason: reason.trim() }));
}

export async function approveMember(client: SupabaseClient, userId: string, unitId: string) {
  z.uuid().parse(userId);
  z.uuid().parse(unitId);
  checked(await client.rpc("ff_approve_member", { target_user: userId, target_unit: unitId }));
}

export async function readMembersWorkspace(client: SupabaseClient) {
  return membersWorkspaceSchema.parse(checked(await client.rpc("ff_members_workspace")));
}
export async function setUnitMembership(client: SupabaseClient, userId: string, unitId: string, assign: boolean, reason: string) {
  checked(await client.rpc("ff_set_unit_membership", {
    target_user: z.uuid().parse(userId), target_unit: z.uuid().parse(unitId),
    assign: z.boolean().parse(assign), reason: memberReasonSchema.parse(reason),
  }));
}
export async function setFunctionMembership(client: SupabaseClient, userId: string, functionId: string, assign: boolean, reason: string) {
  checked(await client.rpc("ff_set_function_membership", {
    target_user: z.uuid().parse(userId), target_function: z.uuid().parse(functionId),
    assign: z.boolean().parse(assign), reason: memberReasonSchema.parse(reason),
  }));
}
export async function changeMemberRole(client: SupabaseClient, input: z.infer<typeof memberRoleInputSchema>) {
  checked(await client.rpc("ff_set_role", memberRoleInputSchema.parse(input)));
}
export async function changeMemberStatus(client: SupabaseClient, userId: string, reactivate: boolean, reason: string) {
  const input = { target_user: z.uuid().parse(userId), reason: memberReasonSchema.parse(reason) };
  checked(await client.rpc(reactivate ? "ff_reactivate_member" : "ff_set_account_status",
    reactivate ? input : { ...input, next_status: "suspended" }));
}
