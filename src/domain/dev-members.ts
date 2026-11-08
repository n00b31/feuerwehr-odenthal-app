import { z } from "zod";

export const memberRoleSchema = z.enum(["MEMBER", "UNIT_ADMIN", "FUNCTION_ADMIN", "FIRE_CHIEF", "GLOBAL_ADMIN"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;
const scopeSchema = z.object({ id: z.uuid(), name: z.string() });
export const membersWorkspaceSchema = z.object({
  server_now:z.iso.datetime({offset:true}).optional(),
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
const names=new Intl.Collator("de",{sensitivity:"base",numeric:true});
export function currentMemberUnits(person:ManagedMember,units:MembersWorkspace["units"],now:number) {
  const ids=new Set(person.unit_history.filter(item=>Date.parse(item.valid_from)<=now
    && (item.valid_until===null || Date.parse(item.valid_until)>now)).map(item=>item.unit_id));
  if(person.unit_id)ids.add(person.unit_id);
  return units.filter(unit=>ids.has(unit.id)).sort((a,b)=>names.compare(a.name,b.name));
}
export function filterManagedMembers(workspace:MembersWorkspace,unitId:string,search:string,now:number) {
  const unique=new Map<string,ManagedMember>();
  for(const person of workspace.members)if(!unique.has(person.user_id))unique.set(person.user_id,person);
  const term=search.trim().toLocaleLowerCase("de");
  return [...unique.values()].map(person=>({person,units:currentMemberUnits(person,workspace.units,now)}))
    .filter(row=>(!unitId || row.units.some(unit=>unit.id===unitId))
      && row.person.display_name.toLocaleLowerCase("de").includes(term))
    .sort((a,b)=>(a.units.length===0 ? 1 : 0)-(b.units.length===0 ? 1 : 0)
      || (unitId ? 0 : names.compare(a.units[0]?.name ?? "",b.units[0]?.name ?? ""))
      || names.compare(a.person.display_name,b.person.display_name)
      || a.person.user_id.localeCompare(b.person.user_id))
    .map(row=>row.person);
}
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
