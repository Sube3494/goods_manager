import assert from "node:assert/strict";
import { canViewProfitLeaderboard, type SessionUser } from "../src/lib/permissions";

const member: SessionUser = { id: "member", email: "member@example.test", role: "USER" };
assert.equal(canViewProfitLeaderboard(null), false);
assert.equal(canViewProfitLeaderboard(member), false);
for (const permissions of [
  { "members:read": true }, { "members:manage": true }, { "system:manage": true },
  { "order:manage": true }, { "dashboard:read": true },
]) {
  assert.equal(canViewProfitLeaderboard({ ...member, permissions }), false);
  assert.equal(canViewProfitLeaderboard({ ...member, roleProfile: { permissions } }), false);
}
assert.equal(canViewProfitLeaderboard({ ...member, permissions: { "members:orders": true } }), true);
assert.equal(canViewProfitLeaderboard({ ...member, roleProfile: { permissions: { "members:orders": true } } }), true);
assert.equal(canViewProfitLeaderboard({ ...member, roleProfile: { permissions: { "members:orders": true } }, permissions: { "members:orders": false } }), false);
assert.equal(canViewProfitLeaderboard({ ...member, permissions: { all: true } }), true);
assert.equal(canViewProfitLeaderboard({ ...member, permissions: { all: true, "members:orders": false } }), false);
assert.equal(canViewProfitLeaderboard({ ...member, role: "SUPER_ADMIN" }), true);
console.log("PASS: explicit Maiyatian grants, role grants, revocations, inherited management permissions, full access and super admin");
