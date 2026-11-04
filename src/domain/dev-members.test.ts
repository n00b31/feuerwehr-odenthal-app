import test from "node:test";
import assert from "node:assert/strict";
import { memberRoleInputSchema, memberReasonSchema, memberErrorMessage, membersWorkspaceSchema } from "./dev-members";
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
