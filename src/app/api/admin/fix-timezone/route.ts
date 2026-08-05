import { NextResponse } from "next/server";
import { getAuthorizedAdmin } from "@/lib/auth";

/**
 * 此接口已废弃。
 *
 * 历史背景：服务器原运行在 UTC 时区，导致出库单 date 字段比实际业务时间快 8 小时。
 * 该接口曾用于修正历史数据。
 *
 * 现服务器时区已更新为 Asia/Shanghai，新数据写入均正确，历史数据已于上线前修复完毕。
 * 再次执行可能误判合法数据（业务日期与创建时间相差约 8 小时的单据），请勿调用。
 */
export async function POST() {
  const session = await getAuthorizedAdmin("roles:manage");
  if (!session) {
    return NextResponse.json({ error: "权限不足，仅超级管理员或拥有管理权限的用户可执行" }, { status: 403 });
  }

  return NextResponse.json({
    success: false,
    message: "此接口已废弃。服务器时区已更新为 Asia/Shanghai，历史数据已修复完毕，无需再次执行。再次执行可能损坏合法数据。",
    deprecated: true,
  }, { status: 410 });
}

export async function GET() {
  return POST();
}
