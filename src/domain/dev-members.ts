import { z } from "zod";

export const memberRoleSchema = z.enum(["MEMBER", "UNIT_ADMIN", "FUNCTION_ADMIN", "FIRE_CHIEF", "GLOBAL_ADMIN"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;
const scopeSchema = z.object({ id: z.uuid(), name: z.string() });
export const membersWorkspaceSchema = z.object({
  global_admin: z.boolean(), units: z.array(scopeSchema), functions: z.array(scopeSchema),
  members: z.array(z.object({
    user_id: z.uuid(), display_name: z.string(),
    status: z.enum(["pending", "approved", "rejected", "suspended"]),
    access_granted: z.boolean(), unit_id: z.uuid().nullable(), unit_name: z.string().nullable(),
    can_change_membership: z.boolean(),
    roles: z.array(z.object({ role: memberRoleSchema, unit_id: z.uuid().nullable(), function_id: z.uuid().nullable() })),
    functions: z.array(scopeSchema),
    unit_history: z.array(z.object({
      unit_id: z.uuid(), unit_name: z.string(),
      valid_from: z.iso.datetime({ offset: true }), valid_until: z.iso.datetime({ offset: true }).nullable(),
    })),
  })),
});
export type MembersWorkspace = z.infer<typeof membersWorkspaceSchema>;
export type ManagedMember = MembersWorkspace["members"][number];
export const memberReasonSchema = z.string().trim().min(5, "Änderungsgrund: mindestens fünf Zeichen.").max(2000);
export const memberRoleInputSchema = z.object({
  target_user: z.uuid(), wanted_role: memberRoleSchema.exclude(["MEMBER"]),
  target_unit: z.uuid().nullable(), target_function: z.uuid().nullable(), assign: z.boolean(),
}).refine((v) => v.wanted_role === "UNIT_ADMIN" ? !!v.target_unit && !v.target_function
  : v.wanted_role === "FUNCTION_ADMIN" ? !!v.target_function && !v.target_unit
  : !v.target_unit && !v.target_function, "Passender Rollenbereich erforderlich.");

export function memberErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "42501" && "message" in error) return String(error.message);
    if (error.code === "PGRST202") return "Mitgliederverwaltung noch nicht verfügbar. Migration 008 und API-Schema prüfen.";
  }
  return "Mitgliederänderung fehlgeschlagen. Verbindung und serverseitige Berechtigung prüfen.";
}
