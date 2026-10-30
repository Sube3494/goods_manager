import { expect, test } from "bun:test";
import { canShowRiderDistance, getRiderDistance } from "../src/lib/riderDistance";

const order = {
  id: "order", deliveryId: "delivery", status: "待配送", userAddress: "顾客地址", shopAddress: "门店地址",
  delivery: { logisticName: "闪送", riderName: "骑手", track: "骑手已接单" }, rawPayload: {},
};

test("取货距门店，取货后切换为送货距顾客，支持零距离", () => {
  expect(getRiderDistance(order, { orderStatus: "pickup", distance: "500" }))
    .toEqual({ phase: "pickup", label: "取货", distance: "500m", estimated: false });
  expect(getRiderDistance(order, { isTakeGoods: true, distance: "1200" }))
    .toEqual({ phase: "delivery", label: "送货", distance: "1.2km", estimated: false });
  expect(getRiderDistance(order, { statusName: "骑手已到店", distance: 0 })?.distance).toBe("0m");
  for (const distance of ["1.8公里", "1.8千米", "1.8 KM"]) {
    expect(getRiderDistance(order, { statusName: "送货中", distance })?.distance).toBe("1.8km");
  }
  expect(getRiderDistance(order, { statusName: "送货中", distance: "500米" })?.distance).toBe("500m");
});

test("平台无有效距离时隐藏，即使有坐标或总距离也不估算", () => {
  const positions = { dispatcher: { lng: 114, lat: 22 }, sender: { lng: 114, lat: 22 }, receiver: { lng: 114.01, lat: 22 } };
  expect(getRiderDistance(order, { ...positions, orderStatus: "pickup" })).toBeNull();
  expect(getRiderDistance(order, { ...positions, isTakeGoods: true })).toBeNull();
  expect(getRiderDistance({ ...order, distanceKm: 5 }, { orderStatus: "pickup" })).toBeNull();
  expect(getRiderDistance(order, { orderStatus: "pickup", distance: "-1" })).toBeNull();
});

test("取消、完成、自配、自提及无配送单时隐藏实时距离", () => {
  for (const change of [
    { status: "已完成" }, { status: "已取消" }, { deliveryId: null }, { isPickup: true },
    { delivery: { logisticName: "自配送", riderName: "自配送" } },
    { delivery: { ...order.delivery, track: "运单已取消" } },
  ]) {
    const stopped = { ...order, ...change };
    expect(canShowRiderDistance(stopped)).toBe(false);
    expect(getRiderDistance(stopped, { isTakeGoods: true, distance: "500" })).toBeNull();
  }
  expect(getRiderDistance(order, { statusName: "已送达", distance: "0" })).toBeNull();
  expect(getRiderDistance(order, { statusName: "待分配骑手", distance: "2000" })).toBeNull();
  expect(getRiderDistance(order, { skipped: true })).toBeNull();
});
