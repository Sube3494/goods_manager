# 商品删除与历史交易

删除请求必须携带当前商品库 ID；后端核验全部待删商品归属，发现混库时整批拒绝删除。
商品删除保留原 `libraryId`，便于审计及恢复。

商品删除通过 `deletedAt` 从商品目录移除，保留内部关联记录。

- 超管删除商品时，仅移除当前模板库及没有模板库归属的用户副本、对应门店商品，不跨到其他模板库。
- 普通用户只能移除自己拥有的商品、副本和门店商品。
- 相关刷单商品配置停止启用。
- 不修改历史采购、出库、刷单、开店或调拨记录的数量和金额。
- 保留历史关联商品的名称、SKU、图片、成本和库存批次，不删除共享图片文件。
- 不把删除当作停产；`isDiscontinued` 保持原值。
- 已删除商品不出现在目录、图库、选品列表和当前库存统计中。

目录接口使用 `catalogPrisma` 排除删除记录；历史接口使用原始 Prisma
客户端保留关联信息。新目录接口也必须使用 `catalogPrisma`。

上线需要将 `prisma/schema.prisma` 中 Product、ShopProduct 的 `deletedAt`
字段同步到数据库，并重新生成 Prisma 客户端。现有容器启动脚本通过
`prisma db push` 同步结构；应确认同步成功后再使用删除功能。

验证：`bun scripts/catalog-deletion.test.ts` 和 `bunx tsc --noEmit --incremental false`。
