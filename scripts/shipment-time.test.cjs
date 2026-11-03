const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('src/lib/shipmentTime.ts','utf8');
const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod = {exports:{}};
new Function('exports', output)(mod.exports);
const {shipmentDate, shipmentTimeText, matchesShipmentDate} = mod.exports;
assert.equal(shipmentDate('2026-11-02T16:00:00Z'), '2026-11-03');
assert.equal(shipmentDate('2026-11-02T15:59:59Z'), '2026-11-02');
assert.equal(shipmentTimeText('2026-11-02T16:00:00Z'), '2026-11-03 00:00');
assert.equal(shipmentTimeText('invalid'), '未记录发货时间');
assert.equal(matchesShipmentDate(undefined,'2026-11-03',''),false);
assert.equal(matchesShipmentDate('invalid','','2026-11-03'),false);
assert.equal(matchesShipmentDate(undefined,'',''),true);
const splitShipment = [
 {time:'2026-11-02T15:59:59Z',quantity:2},
 {time:'2026-11-02T16:00:00Z',quantity:3},
 {quantity:5}
];
assert.equal(splitShipment.filter(x=>matchesShipmentDate(x.time,'2026-11-03','2026-11-03')).reduce((s,x)=>s+x.quantity,0),3);
assert.equal(matchesShipmentDate('2026-11-03T15:59:59Z','2026-11-03','2026-11-03'),true);
assert.equal(matchesShipmentDate('2026-11-03T16:00:00Z','2026-11-03','2026-11-03'),false);
console.log('shipment time: 10 assertions passed');
