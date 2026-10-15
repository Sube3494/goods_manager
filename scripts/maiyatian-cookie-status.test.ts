import assert from "node:assert/strict";
import { checkMaiyatianCookieStatus } from "../src/lib/maiyatianCookieStatus";

async function main() {
  const checked: string[] = [];
  const probe = async (cookie: string) => {
    checked.push(cookie);
    if (cookie === "expired") throw new Error("Expired");
    return { ok: cookie === "valid" };
  };
  assert.equal(await checkMaiyatianCookieStatus({ maiyatianCookie: "" }, probe), "missing");
  assert.deepEqual(checked, []);
  assert.equal(await checkMaiyatianCookieStatus({ maiyatianCookie: "valid" }, probe), "valid");
  assert.equal(await checkMaiyatianCookieStatus({ maiyatianCookie: "expired" }, probe), "invalid");
  assert.equal(await checkMaiyatianCookieStatus({ maiyatianCookie: "rejected" }, probe), "invalid");
  checked.length = 0;
  assert.equal(await checkMaiyatianCookieStatus({ maiyatianCookie: "expired", maiyatianCookies: [
    { enabled: false, cookie: "expired" }, { cookie: "valid" }, { cookie: " " },
  ] }, probe), "valid");
  assert.deepEqual(checked, ["valid"]);
  assert.equal(await checkMaiyatianCookieStatus({ maiyatianCookie: "", maiyatianCookies: [
    { cookie: "valid" }, { cookie: "expired" },
  ] }, probe), "partial");
  assert.equal(await checkMaiyatianCookieStatus({ maiyatianCookie: "valid", maiyatianCookies: [
    { enabled: false, cookie: "expired" },
  ] }, probe), "valid");
  console.log("PASS: valid, missing, expired, rejected, partial, disabled accounts and legacy fallback");
}
void main();
