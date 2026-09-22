import assert from "node:assert/strict";
import { cleanCustomerRemark, firstMeaningfulCustomerRemark } from "../src/lib/customerRemark";

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
