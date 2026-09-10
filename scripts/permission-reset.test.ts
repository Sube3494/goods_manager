import assert from "node:assert/strict";
import { clearUserPermissionOverrides, getEffectivePermissions } from "../src/lib/permissions";

const integration = {
  maiyatianCookies: [{ id: "account", cookie: "test-cookie", enabled: true }],
  inboundApiKey: "test-key",
  maiyatianShopMappings: [{ maiyatianShopId: "shop", localShopName: "Store" }],
};
const original = {
  "order:manage": false,
  "product:read": true,
  "system:manage": true,
  all: true,
  autoPickIntegration: integration,
  brushCommissionBoostEnabled: true,
  customSettings: { enabled: false },
};
const result = clearUserPermissionOverrides(original);
assert.deepEqual(result, {
  autoPickIntegration: integration,
  brushCommissionBoostEnabled: true,
  customSettings: { enabled: false },
});
assert.equal(original.all, true);
const effective = getEffectivePermissions({
  id: "member", email: "member@example.test", role: "USER",
  permissions: result,
  roleProfile: { permissions: { "order:manage": true } },
});
assert.equal(effective["order:manage"], true);
assert.equal(effective.all, undefined);
assert.deepEqual(clearUserPermissionOverrides({}), {});
console.log("PASS: role reset preserves integration and business settings, removes permission overrides");
