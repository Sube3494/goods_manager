import assert from "node:assert/strict";
import {
  clearUserPermissionOverrides,
  hasDirectPermission,
  hasPermission,
  PAGE_PERMISSION_TREE,
  PERMISSION_TREE,
  type SessionUser,
} from "../src/lib/permissions";

const member: SessionUser = { id: "member", email: "member@example.test", role: "USER" };
const grants = [{}, { "brush:simulate": true }, { all: true }, { "brush:manage": true }];
for (const check of [hasPermission, hasDirectPermission]) {
  assert.equal(check(null, "brush:simulate"), false);
  for (const permissions of grants) {
    assert.equal(check({ ...member, permissions }, "brush:simulate"), false);
    assert.equal(check({ ...member, roleProfile: { permissions } }, "brush:simulate"), false);
  }
  assert.equal(check({ ...member, permissions: { "brush:simulate": false }, roleProfile: { permissions: { all: true } } }, "brush:simulate"), false);
  assert.equal(check({ ...member, role: "SUPER_ADMIN", permissions: { "brush:simulate": false } }, "brush:simulate"), true);
  assert.equal(check({ ...member, permissions: { all: true } }, "brush:manage"), true);
}
assert.equal(hasPermission({ ...member, permissions: { "brush:manage": true } }, "brush:orders"), true);
assert.equal(PERMISSION_TREE.some(group => group.children.some(item => item.key === "brush:simulate")), false);
assert.equal(PAGE_PERMISSION_TREE.some(group => group.pages.some(page => page.actions.some(action => action.key === "brush:simulate"))), false);
assert.deepEqual(clearUserPermissionOverrides({ "brush:simulate": true, customSettings: { enabled: true } }), { customSettings: { enabled: true } });
console.log("PASS: brush simulation is super-admin-only; legacy grants and all cannot bypass it");
