import test from "node:test";
import assert from "node:assert/strict";
import { DEV_ROLE_LABELS, ROLE_LABELS } from "./app";
import { memberRoleSchema } from "../domain/dev-members";

test("DEV role names are presentation-only and cover every unchanged server role", () => {
  assert.equal(DEV_ROLE_LABELS.GLOBAL_ADMIN, "Globaler Administrator");
  assert.equal(DEV_ROLE_LABELS.UNIT_ADMIN, "Einheitsführer");
  assert.equal(DEV_ROLE_LABELS.MEMBER, "Mitglied");
  assert.deepEqual(Object.keys(DEV_ROLE_LABELS).sort(), [...memberRoleSchema.options].sort());
  assert.equal(memberRoleSchema.parse("UNIT_ADMIN"), "UNIT_ADMIN");
  assert.equal(ROLE_LABELS.UNIT_ADMIN, "Einheitsadministration", "demo labels remain unchanged");
});
