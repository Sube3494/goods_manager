"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const purchases_1 = require("../src/lib/purchases");
const purchases = [
    {
        id: "PO-001",
        status: "Confirmed",
        totalAmount: 100,
        date: "2026-04-09T00:00:00.000Z",
        shippingFees: 0,
        extraFees: 0,
        shopName: "淘宝A店",
        items: [
            {
                productId: "p-1",
                quantity: 1,
                costPrice: 100,
                supplier: {
                    id: "s-1",
                    name: "龙虾供应商",
                    contact: "",
                    phone: "",
                    email: "",
                    address: "",
                },
                product: {
                    id: "p-1",
                    name: "测试商品",
                    categoryId: "c-1",
                    costPrice: 100,
                    stock: 0,
                },
            },
        ],
    },
    {
        id: "PO-002",
        status: "Ordered",
        totalAmount: 200,
        date: "2026-04-09T00:00:00.000Z",
        shippingFees: 0,
        extraFees: 0,
        shopName: "拼多多B店",
        items: [
            {
                productId: "p-2",
                quantity: 2,
                costPrice: 100,
                supplier: {
                    id: "s-2",
                    name: "海鲜供货商",
                    contact: "",
                    phone: "",
                    email: "",
                    address: "",
                },
                product: {
                    id: "p-2",
                    name: "龙虾尾",
                    categoryId: "c-2",
                    costPrice: 100,
                    stock: 0,
                },
            },
        ],
    },
    {
        id: "PO-003",
        status: "Draft",
        totalAmount: 50,
        date: "2026-04-09T00:00:00.000Z",
        shippingFees: 0,
        extraFees: 0,
        shopName: "淘宝A店",
        items: [],
    },
];
strict_1.default.equal((0, purchases_1.matchesPurchaseStatus)(purchases[0], "Confirmed"), true);
strict_1.default.equal((0, purchases_1.matchesPurchaseStatus)(purchases[1], "Confirmed"), true);
strict_1.default.equal((0, purchases_1.matchesPurchaseStatus)(purchases[2], "Confirmed"), false);
const filtered = (0, purchases_1.filterPurchases)(purchases, {
    searchQuery: "龙虾",
    statusFilter: "Confirmed",
    shopFilter: "拼多多B店",
});
strict_1.default.deepEqual(filtered.map((purchase) => purchase.id), ["PO-002"]);
strict_1.default.equal((0, purchases_1.getTrackingUrl)("SF123456", "顺丰速运"), "https://www.kuaidi100.com/chaxun?com=shunfeng&nu=SF123456");
strict_1.default.equal((0, purchases_1.getTrackingUrl)("ABC", "未知快递"), null);
strict_1.default.equal((0, purchases_1.getPurchaseStatusLabel)("Ordered"), "已下单");
strict_1.default.equal((0, purchases_1.getPurchaseStatusLabel)("Received"), "已入库");
console.log("purchases tests passed");
