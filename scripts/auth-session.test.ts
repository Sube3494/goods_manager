import assert from "node:assert/strict";
// @ts-expect-error Bun provides this test API at runtime; the app uses Node types.
import { mock } from "bun:test";

const storedCookies = new Map<string, string>();
mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: storedCookies.get(name) }),
    set: (name: string, value: string) => storedCookies.set(name, value),
  }),
  headers: async () => new Headers({ host: "localhost" }),
}));

const permissions = Object.fromEntries(
  Array.from({ length: 200 }, (_, index) => [`permission:${index}`, true]),
);
const user = {
  id: "member-id",
  email: "member@example.test",
  name: "Member",
  role: "USER" as const,
  status: "ACTIVE",
  lastActiveAt: new Date(),
  permissions: {},
  roleProfile: { id: "role-id", name: "Custom role", permissions },
};
mock.module("../src/lib/prisma", () => ({
  default: {
    user: { findUnique: async () => user },
    emailWhitelist: { findUnique: async () => ({ email: user.email }) },
    systemSetting: { findFirst: async () => ({ maxLoginDevices: 2 }) },
    userDeviceSession: {
      upsert: async () => ({}),
      findMany: async () => [],
      findUnique: async () => ({ userId: user.id, lastSeenAt: new Date(), endedAt: null }),
    },
  },
}));

process.env.JWT_SECRET = "test-only-session-secret-not-for-production";
const { login, decrypt, getFreshSession } = await import("../src/lib/auth");
await login(user);
const cookie = storedCookies.get("session");
assert.ok(cookie);
assert.ok(Buffer.byteLength(`session=${cookie}`) < 4096, "Large roles must fit in a browser cookie");
const payload = await decrypt(cookie);
assert.equal(payload.roleProfile, undefined);
assert.equal((payload.user as Record<string, unknown>).roleProfile, undefined);
assert.equal((payload.user as Record<string, unknown>).id, user.id);
assert.deepEqual((await getFreshSession())?.roleProfile?.permissions, permissions);
user.roleProfile.permissions = { "order:manage": true };
assert.deepEqual((await getFreshSession())?.roleProfile?.permissions, { "order:manage": true });
console.log("PASS: large-role login cookie and fresh role permissions");
