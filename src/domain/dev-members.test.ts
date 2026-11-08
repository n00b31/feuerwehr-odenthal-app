import test from "node:test";
import assert from "node:assert/strict";
import { memberRoleInputSchema, memberReasonSchema, memberErrorMessage, membersWorkspaceSchema,filterManagedMembers,
  currentMemberUnits,type ManagedMember } from "./dev-members";
const id = "80000000-0000-4000-8000-000000000001";
test("scoped role assignment requires the matching unit or function", () => {
  const input = { target_user: id, wanted_role: "UNIT_ADMIN", target_unit: id, target_function: null, assign: true };
  assert.equal(memberRoleInputSchema.safeParse(input).success, true);
  assert.equal(memberRoleInputSchema.safeParse({ ...input, target_unit: null }).success, false);
  assert.equal(memberRoleInputSchema.safeParse({ ...input, wanted_role: "GLOBAL_ADMIN" }).success, false);
  assert.equal(memberRoleInputSchema.safeParse({ ...input, wanted_role: "MEMBER" }).success, false);
});
test("function and global roles reject mismatched scopes and null actions", () => {
  const input = { target_user: id, wanted_role: "FUNCTION_ADMIN", target_unit: null, target_function: id, assign: false };
  assert.equal(memberRoleInputSchema.safeParse(input).success, true);
  assert.equal(memberRoleInputSchema.safeParse({ ...input, assign: null }).success, false);
  assert.equal(memberRoleInputSchema.safeParse({ ...input, wanted_role: "GLOBAL_ADMIN", target_function: null }).success, true);
});
test("member changes require meaningful reasons", () => {
  assert.equal(memberReasonSchema.safeParse("     ").success, false);
  assert.equal(memberReasonSchema.parse("  Synthetic transfer  "), "Synthetic transfer");
});
test("member workspace requires live capabilities, scoped roles and history", () => {
  assert.equal(membersWorkspaceSchema.safeParse({ global_admin: false, units: [], functions: [], members: [] }).success, true);
  assert.equal(membersWorkspaceSchema.safeParse({ global_admin: false, members: [] }).success, false);
});
test("member errors distinguish missing RPC and permission failure", () => {
  assert.match(memberErrorMessage({ code: "PGRST202" }), /008/);
  assert.equal(memberErrorMessage({ code: "42501", message: "Last global administrator must remain active" }), "Last global administrator must remain active");
});
test("unit sorting and search use authorized names, alphabetic people and one overall row per multi-member",()=>{
  const units=[{id,name:"Scheuren"},{id:"80000000-0000-4000-8000-000000000002",name:"Eikamp"}];
  const person=(suffix:string,name:string,memberships:string[]):ManagedMember=>({
    user_id:`90000000-0000-4000-8000-${suffix.padStart(12,"0")}`,display_name:name,
    status:"approved",access_granted:true,unit_id:memberships[0] ?? null,
    unit_name:units.find(unit=>unit.id===memberships[0])?.name ?? null,can_change_membership:false,
    roles:[],functions:[],unit_history:memberships.map(unit_id=>({
      unit_id,unit_name:units.find(unit=>unit.id===unit_id)!.name,valid_from:"2026-01-01T00:00:00Z",valid_until:null,
    })),
  });
  const anna=person("1","Anna",[id,units[1].id]),bernd=person("2","Bernd",[units[1].id]),
    zara=person("3","Zara",[id]),pending=person("4","Anton",[]);
  const workspace={global_admin:false,units,functions:[],members:[zara,bernd,anna,anna,pending]};
  const before=JSON.stringify(workspace),now=Date.parse("2026-11-09T12:00:00Z");
  assert.deepEqual(filterManagedMembers(workspace,"","",now).map(p=>p.display_name),["Anna","Bernd","Zara","Anton"]);
  assert.deepEqual(filterManagedMembers(workspace,id,"",now).map(p=>p.display_name),["Anna","Zara"]);
  assert.deepEqual(filterManagedMembers(workspace,units[1].id,"",now).map(p=>p.display_name),["Anna","Bernd"]);
  assert.deepEqual(filterManagedMembers(workspace,id," AN ",now).map(p=>p.display_name),["Anna"]);
  assert.deepEqual(filterManagedMembers(workspace,"unknown-scope","",now),[]);
  const single=person("5","Anna single",[id]),multi=person("6","Zara multi",[id,units[1].id]);
  assert.deepEqual(filterManagedMembers({...workspace,members:[multi,single]},id,"",now)
    .map(p=>p.display_name),["Anna single","Zara multi"]);
  assert.equal(JSON.stringify(workspace),before);
});
test("current unit filters exclude ended/future memberships and never expose unprovided unit options",()=>{
  const other="80000000-0000-4000-8000-000000000002",future="80000000-0000-4000-8000-000000000003";
  const person:ManagedMember={user_id:id,display_name:"Synthetic",status:"approved",access_granted:true,
    unit_id:id,unit_name:"Scheuren",can_change_membership:false,roles:[],functions:[],unit_history:[
      {unit_id:other,unit_name:"Ended",valid_from:"2025-01-01T00:00:00Z",valid_until:"2026-01-01T00:00:00Z"},
      {unit_id:future,unit_name:"Future",valid_from:"2027-01-01T00:00:00Z",valid_until:null},
    ]};
  assert.deepEqual(currentMemberUnits(person,[{id,name:"Scheuren"},{id:other,name:"Ended"},{id:future,name:"Future"}],
    Date.parse("2026-11-09T12:00:00Z")),[{id,name:"Scheuren"}]);
  assert.deepEqual(currentMemberUnits(person,[],Date.parse("2026-11-09T12:00:00Z")),[]);
});
