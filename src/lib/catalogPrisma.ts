import prisma from "@/lib/prisma";

// Catalog reads omit deleted goods. Historical APIs keep using the base client
// so their product relations and original names, images and prices remain intact.
// The extension adds predicates only; model and result types remain unchanged.
const catalogPrisma = prisma.$extends({
  name: "active-catalog",
  query: {
    product: {
      async $allOperations({ operation, args, query }) {
        if (["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "update", "updateMany"].includes(operation)) {
          Object.assign(args, { where: { ...("where" in args ? args.where : {}), deletedAt: null } });
        }
        return query(args);
      },
    },
    shopProduct: {
      async $allOperations({ operation, args, query }) {
        if (["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "update", "updateMany"].includes(operation)) {
          Object.assign(args, { where: { ...("where" in args ? args.where : {}), deletedAt: null } });
        }
        return query(args);
      },
    },
  },
}) as unknown as typeof prisma;

export default catalogPrisma;
