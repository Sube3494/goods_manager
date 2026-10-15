import assert from "node:assert/strict";
import { hasManualBrushMarker, readMainSystemSelfDeliveryFlag } from "../src/lib/autoPickOrderStatus";

const delivery = { logisticName: "闪送", dispatcher: "rider-1", sendFee: 1280 };
const manual = { systemMeta: { mainSystemSelfDelivery: { triggered: true, manuallyMarked: true, triggeredAt: "2020-01-01T00:00:00Z" } } };
assert.equal(hasManualBrushMarker(manual), true);
assert.equal(readMainSystemSelfDeliveryFlag(manual, delivery), true);
assert.equal(readMainSystemSelfDeliveryFlag({ systemMeta: { mainSystemSelfDelivery: { triggered: true, triggeredAt: "2020-01-01T00:00:00Z" } } }, delivery), false);
const legacy = { systemMeta: { mainSystemSelfDelivery: { triggered: true }, autoOutbound: { error: "brush-order-no-auto-outbound" } } };
assert.equal(readMainSystemSelfDeliveryFlag(legacy, delivery), true);
assert.equal(readMainSystemSelfDeliveryFlag({ systemMeta: { ...legacy.systemMeta, mainSystemSelfDelivery: { triggered: false, manuallyMarked: false } } }, delivery), false);
console.log("PASS: explicit and legacy manual brush markers survive third-party delivery; unmarking and automatic self-delivery remain unchanged");
