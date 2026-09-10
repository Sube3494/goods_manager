import assert from "node:assert/strict";
import { assertMaiyatianCookieResponse } from "../src/lib/maiyatianCookieResponse";

for (const status of [401, 403]) {
  assert.throws(() => assertMaiyatianCookieResponse(new Response(null, { status }), ""), /Cookie 已失效/);
}
assert.throws(() => assertMaiyatianCookieResponse(new Response(null, {
  status: 302, headers: { location: "/login/?next=/shop/" },
}), ""), /Cookie 已失效/);
for (const body of [
  '<html><form><input type="password" /></form></html>',
  "<script>window.location.href='/login/';</script>",
  JSON.stringify({ errno: -1, message: "请先登录" }),
]) {
  assert.throws(() => assertMaiyatianCookieResponse(new Response(body), body), /Cookie 已失效/);
}
assert.throws(() => assertMaiyatianCookieResponse(new Response(""), ""), /无法确认/);
assert.throws(() => assertMaiyatianCookieResponse(new Response(null, { status: 500 }), ""), /请求失败 500/);
assert.doesNotThrow(() => assertMaiyatianCookieResponse(new Response(), "<html><table><tr><td>测试门店</td></tr></table></html>"));
assert.doesNotThrow(() => assertMaiyatianCookieResponse(new Response(), "<html><table></table><p>暂无门店</p></html>"));
console.log("PASS: expired cookies, login redirects, login HTML, API errors and empty shop pages");
