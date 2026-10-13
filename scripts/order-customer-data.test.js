import { expect, test } from "bun:test";
import { mergeOrderCustomerPayload, readRetainedCustomerAddress, retainCustomerAddress } from "../src/lib/orderCustomerData";

const address = "测试市测试路12号1栋101室";
const hidden = "为保护用户隐私，根据小时达平台要求，订单完成/取消后将不支持地址信息查看";

test("完成和取消更新中的隐私提示、空值、脱敏地址不能覆盖已有完整地址", () => {
  for (const incoming of [hidden, "", null, "-", "测试市测试路***号", "地址已隐藏"]) {
    expect(retainCustomerAddress(incoming, address)).toBe(address);
  }
  expect(retainCustomerAddress(hidden, null)).toBe("");
});

test("首次获取完整地址、真实地址变更仍然接受，不能把地址锁死", () => {
  const changed = "测试市测试路12号1栋102室";
  expect(retainCustomerAddress(address, hidden)).toBe(address);
  expect(retainCustomerAddress(changed, address)).toBe(changed);
  expect(retainCustomerAddress("到店自取", address)).toBe("到店自取");
});

test("保留根层与嵌套收货数据，不覆盖新的状态、金额、商品和退款", () => {
  const previous = { userAddress: address, status: "配送中", actualPaid: 16200,
    user_info: { unencrypted_address: address, secret_phone: "138****1234", oldStatus: "配送中" },
    goods: [{ name: "旧商品" }], cancelDetails: [{ reason: "旧退款" }] };
  const incoming = { userAddress: hidden, status: "已完成", actualPaid: 15390,
    user_info: { unencrypted_address: hidden, secret_phone: "", status: "已完成" },
    goods: [{ name: "新商品" }], cancelDetails: [{ reason: "新退款" }] };
  const merged = mergeOrderCustomerPayload(incoming, previous);
  expect(merged).toEqual({ ...incoming, userAddress: address,
    user_info: { unencrypted_address: address, secret_phone: "138****1234", status: "已完成" } });
  expect(previous.userAddress).toBe(address);
  expect(incoming.userAddress).toBe(hidden);
});

test("状态回调不带收货字段时从历史嵌套载荷保留资料，不能复活其他旧字段", () => {
  const merged = mergeOrderCustomerPayload({ status: "已取消" }, {
    status: "配送中", data: { userInfo: { address, secret_phone: "138****1234" }, refund: 999 },
  });
  expect(merged).toEqual({ status: "已取消", data: { userInfo: { address, secret_phone: "138****1234" } } });
  expect(readRetainedCustomerAddress(merged)).toBe(address);
});

test("已被提示覆盖的主字段仍可从保留的真实收货载荷取回有效地址", () => {
  expect(readRetainedCustomerAddress({ userAddress: hidden, userInfo: { unencrypted_address: address } })).toBe(address);
  expect(readRetainedCustomerAddress({ userAddress: hidden })).toBe("");
});
