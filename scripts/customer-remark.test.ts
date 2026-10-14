import assert from "node:assert/strict";
import { cleanCustomerRemark, firstMeaningfulCustomerRemark, readOrderCustomerRemark } from "../src/lib/customerRemark";

const cases: Array<[unknown, string | null]> = [
  ["**【备注】：麻烦拿个外观好一点的 谢谢【如遇缺货】：缺货时电话与我沟通** &#x20;", "麻烦拿个外观好一点的 谢谢"],
  ["**【卡片内容】：不需要贺卡【如遇缺货】：缺货时电话与我沟通** &#x20;", null],
  ["**【如遇缺货】：缺货时电话与我沟通** &#x20;", null],
  ["**【JD3629479012461341】 缺货时电话与我沟通** &#x20;", null],
  ["（缺货时电话与我联系）", null],
  ["(缺货时电话与我联系)", null],
  ["【卡片内容】：生日快乐【如遇缺货】：不要替换，直接退款", "生日快乐 不要替换，直接退款"],
  ["【备注】：不要按门铃", "不要按门铃"],
  ["普通客户备注", "普通客户备注"],
  ["&nbsp; ** ** &#x20;", null],
];

for (const [input, expected] of cases) {
  assert.equal(cleanCustomerRemark(input), expected, String(input));
}

assert.equal(
  firstMeaningfulCustomerRemark("【如遇缺货】：缺货时电话与我沟通", "请放前台"),
  "请放前台",
);

console.log(`customer remark tests passed (${cases.length + 1})`);

const card = "麥浩晴媽咪： 天天開心";
const detail = {
  source_id: "test-order",
  user_remark: "【如遇缺货】：缺货时电话与我沟通",
  extra: ["", card, "", ""],
  order_copy: `商品：燕窝礼盒\n贺卡：${card}\n地址：测试地址\n备注：【如遇缺货】：缺货时电话与我沟通`,
};
assert.equal(readOrderCustomerRemark({ data: detail }), `贺卡：${card}`);
assert.equal(readOrderCustomerRemark({ data: { ...detail, order_copy: "" } }), `贺卡：${card}`, "four-slot detail fallback");
assert.equal(readOrderCustomerRemark({ data: { ...detail, extra: [] } }), `贺卡：${card}`, "receipt fallback");
assert.equal(readOrderCustomerRemark({ data: detail }, "请放前台"), `请放前台\n贺卡：${card}`);
assert.equal(readOrderCustomerRemark({ data: detail }, `请放前台\n贺卡：${card}`), `请放前台\n贺卡：${card}`, "do not duplicate stored cards");
assert.equal(readOrderCustomerRemark({ data: detail }, detail.user_remark), `贺卡：${card}`, "recover old orders with only default remarks");
assert.equal(readOrderCustomerRemark({ data: { ...detail, user_remark: "不要按门铃" } }), `不要按门铃\n贺卡：${card}`);
assert.equal(readOrderCustomerRemark({ extra: ["", "无关数据", "", ""] }), null, "do not guess cards from arbitrary arrays");
assert.equal(readOrderCustomerRemark({ extra: [{ title: "优惠" }] }), null);
for (const value of ["", "不需要贺卡", "不需要賀卡", "无需卡片", "无"]) {
  assert.equal(readOrderCustomerRemark({ data: { ...detail, extra: ["", value, "", ""], order_copy: `贺卡：${value}\n配送时间：20:30` } }), null);
}
assert.equal(readOrderCustomerRemark({ order_copy: "贺卡：\n配送时间：20:30\n地址：测试地址" }), null, "empty cards must not swallow following receipt lines");
assert.equal(readOrderCustomerRemark({ payload: { detail: { card_content: "生日快乐\n平安喜乐" } } }), "贺卡：生日快乐\n平安喜乐");
assert.equal(readOrderCustomerRemark(null, "普通备注"), "普通备注");
console.log("greeting card extraction and historical-order recovery tests passed");
