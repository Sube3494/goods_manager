import { NextResponse } from "next/server";

/**
 * 集中处理常见的 Prisma 数据库异常并转换为标准化的 HTTP 响应
 * @param error 捕获到的异常对象
 * @param entityName 实体名称 (例如："商品", "分类") 用于更友好的错误提示
 * @param defaultErrorMsg 默认报错信息
 */
export function handlePrismaError(error: unknown, entityName: string, defaultErrorMsg: string = "内部服务器错误") {
  console.error(`[Prisma Error] ${entityName}操作失败:`, error);

  if (error && typeof error === 'object' && 'code' in error) {
    switch (error.code) {
      case 'P2002':
        // 唯一约束冲突 (Unique Constraint Violated)
        return NextResponse.json({ 
          error: `${entityName}中存在重复的唯一字段 (如编码或名称已存在)` 
        }, { status: 400 });

      case 'P2003':
        // 外键约束冲突 (Foreign Key Constraint Violated)
        return NextResponse.json({ 
          error: `无法修改或删除该${entityName}，因为它已被其他业务单据关联。` 
        }, { status: 409 });

      case 'P2025':
        // 记录未找到 (Record not found)
        return NextResponse.json({ 
          error: `指定的${entityName}不存在或已被删除。` 
        }, { status: 404 });
    }
  }

  // 兜底返回 500
  return NextResponse.json({ error: defaultErrorMsg }, { status: 500 });
}
