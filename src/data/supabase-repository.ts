import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const roleSchema = z.enum(["MEMBER", "UNIT_ADMIN", "FUNCTION_ADMIN", "FIRE_CHIEF", "GLOBAL_ADMIN"]);
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
const eventSchema = z.object({
  id: z.uuid(), title: z.string(), description: z.string(),
  event_type: z.enum(["regular", "special", "breathing", "training", "community", "other"]),
  starts_at: z.string(), ends_at: z.string(), location: z.string(),
  status: z.enum(["scheduled", "cancelled"]),
});
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
export type DevData = {
  events: z.infer<typeof eventSchema>[];
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
    client.from("events").select("id,title,description,event_type,starts_at,ends_at,location,status").order("starts_at"),
    client.from("document_areas").select("id,name,description,sharepoint_url").order("name"),
    client.from("confirmed_attendance").select("event_id,user_id,title,starts_at,status,report_year,training_hours")
      .eq("user_id", access.user_id).order("starts_at", { ascending: false }),
    client.from("units").select("id,name").order("name"),
    access.roles.includes("GLOBAL_ADMIN") ? client.rpc("ff_pending_registrations") : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    events: z.array(eventSchema).parse(checked(events)),
    documents: z.array(documentSchema).parse(checked(documents)),
    attendance: z.array(attendanceSchema).parse(checked(attendance)),
    units: z.array(unitSchema).parse(checked(units)),
    registrations: z.array(registrationSchema).parse(checked(registrations)),
  };
}

export async function approveMember(client: SupabaseClient, userId: string, unitId: string) {
  z.uuid().parse(userId);
  z.uuid().parse(unitId);
  checked(await client.rpc("ff_approve_member", { target_user: userId, target_unit: unitId }));
}
