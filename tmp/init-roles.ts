import { PrismaClient } from '../prisma/generated-client';

const prisma = new PrismaClient();

const ROLE_TEMPLATES = {
  WAREHOUSE_ADMIN: {
    name: "仓库管理员",
    description: "管理商品库存、入库与出库单据",
    permissions: {
      "product:read": true,
      "product:update": true,
      "inbound:read": true,
      "inbound:create": true,
      "outbound:read": true,
      "outbound:create": true,
      "gallery:upload": true,
    }
  },
  PURCHASER: {
    name: "采购员",
    description: "负责供应商管理与采购订单创建",
    permissions: {
      "product:read": true,
      "purchase:read": true,
      "purchase:create": true,
      "supplier:read": true,
    }
  },
  OPERATOR: {
    name: "运营人员",
    description: "维护商品信息、分类及相册内容",
    permissions: {
      "product:read": true,
      "product:create": true,
      "product:update": true,
      "category:read": true,
      "category:manage": true,
      "gallery:upload": true,
      "gallery:delete": true,
    }
  },
  ALBUM_VISITOR: {
    name: "相册访客",
    description: "查看公开相册，管理个人采购、库房与刷单业务",
    permissions: {
      "product:read": true,
      "purchase:read": true,
      "purchase:create": true,
      "inbound:read": true,
      "inbound:create": true,
      "outbound:read": true,
      "outbound:create": true,
      "brush:read": true,
      "brush:create": true,
    }
  }
};

async function main() {
  console.log('开始初始化系统角色...');
  
  for (const [key, template] of Object.entries(ROLE_TEMPLATES)) {
    await prisma.roleProfile.upsert({
      where: { name: template.name },
      update: {
        description: template.description,
        permissions: template.permissions,
        isSystem: true
      },
      create: {
        name: template.name,
        description: template.description,
        permissions: template.permissions,
        isSystem: true
      }
    });
    console.log(`- 角色已同步: ${template.name}`);
  }
  
  console.log('系统角色初始化完成！');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
