import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const member = { id: "member", name: "成员", email: "member@example.test" };
let session;
const memberQueries = [];
const profileQueries = [];
const orderQueries = [];
const shopQueries = [];

mock.module("../src/lib/auth", () => ({ getAuthorizedUser: async () => session }));
mock.module("../src/lib/prisma", () => ({
  default: {
    user: {
      findMany: async (query) => {
        memberQueries.push(query);
        return [member];
      },
      findUnique: async ({ where }) => {
        profileQueries.push(where.id);
        return {
          permissions: {},
          shippingAddresses: [{ id: `shop-${where.id}`, label: `门店-${where.id}`, isDefault: true }],
        };
      },
    },
    autoPickOrder: {
      findMany: async ({ where }) => {
        orderQueries.push(where.userId);
        return [];
      },
    },
    shop: {
      findFirst: async ({ where }) => {
        shopQueries.push(where.userId);
        return null;
      },
    },
  },
}));

const { GET: getDistribution } = await import("../src/app/api/orders/distribution/route");
const { GET: getMembers } = await import("../src/app/api/orders/distribution/members/route");

const request = (userId = "") => new NextRequest(`http://localhost/api/orders/distribution?userId=${userId}`);

beforeEach(() => {
  session = { id: "viewer", role: "USER", permissions: { "order:manage": true } };
  for (const queries of [memberQueries, profileQueries, orderQueries, shopQueries]) queries.length = 0;
});

test("有订单权限的成员仍可查看自己的订单分布", async () => {
  const response = await getDistribution(request());
  expect(response.status).toBe(200);
  expect((await response.json()).currentShop.name).toBe("门店-viewer");
  expect(orderQueries).toEqual(["viewer", "viewer"]);
  expect((await getDistribution(request("viewer"))).status).toBe(200);
});

test("有管理角色的普通成员也无法跨成员读取分布或成员列表", async () => {
  session.roleProfile = { name: "订单管理员", permissions: { "members:manage": true } };
  expect((await getDistribution(request(member.id))).status).toBe(403);
  expect((await getMembers()).status).toBe(403);
  expect([...memberQueries, ...profileQueries, ...orderQueries, ...shopQueries]).toEqual([]);
});

test("未登录时拒绝读取", async () => {
  session = null;
  expect((await getDistribution(request())).status).toBe(403);
  expect((await getMembers()).status).toBe(403);
});

test("超管的分布查询按所选成员隔离门店、订单和配置", async () => {
  session.role = "SUPER_ADMIN";
  const membersResponse = await getMembers();
  expect(membersResponse.status).toBe(200);
  expect(await membersResponse.json()).toEqual({ members: [member] });
  expect(memberQueries[0]).toMatchObject({
    where: { id: { not: "viewer" }, autoPickOrders: { some: {} } },
    select: { id: true, name: true, email: true },
  });

  const response = await getDistribution(request(member.id));
  expect(response.status).toBe(200);
  expect((await response.json()).currentShop.name).toBe("门店-member");
  expect(profileQueries).toEqual([member.id]);
  expect(orderQueries).toEqual([member.id, member.id]);
  expect(shopQueries).toEqual([member.id]);
});
