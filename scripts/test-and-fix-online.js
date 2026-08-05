const { Client } = require('pg');

const connectionString = "postgresql://postgres:123456@47.98.98.18:5432/goods_manager";

async function run() {
  console.log("🔍 正在尝试连接线上数据库 47.98.98.18:5432 ...");
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log("✅ 成功连接到线上数据库！开始检测发货单时间数据...");

    // 查询目标单据
    const targetId = 'FH-20260805-QGD8';
    const resTarget = await client.query('SELECT id, date, "createdAt" FROM "OutboundOrder" WHERE id = $1', [targetId]);

    if (resTarget.rows.length > 0) {
      const order = resTarget.rows[0];
      console.log(`📌 找到线上目标单据 ${targetId}:`);
      console.log(`   原业务时间 (date):      ${order.date}`);
      console.log(`   系统创建时间(createdAt): ${order.createdAt}`);

      // 更正发货时间为创建时间
      await client.query('UPDATE "OutboundOrder" SET date = "createdAt" WHERE id = $1', [targetId]);
      console.log(`   ✅ 成功校准 ${targetId} 的发货时间与创建时间一致！`);
    } else {
      console.log(`❓ 未在 47.98.98.18 数据库中查到单据: ${targetId}`);
    }

    // 检查近期 date 比 createdAt 快大约 8 小时的单据
    const resAll = await client.query(`
      SELECT id, date, "createdAt" 
      FROM "OutboundOrder" 
      WHERE date > "createdAt"
      ORDER BY "createdAt" DESC
      LIMIT 300
    `);

    let fixCount = 0;
    for (const row of resAll.rows) {
      const diffMs = new Date(row.date).getTime() - new Date(row.createdAt).getTime();
      const eightHoursMs = 8 * 60 * 60 * 1000;
      if (Math.abs(diffMs - eightHoursMs) < 40 * 60 * 1000) {
        console.log(`--------------------------------------------------`);
        console.log(`[校准线上单据 ID]: ${row.id}`);
        console.log(`  原业务时间: ${row.date}`);
        console.log(`  系统创建时间: ${row.createdAt}`);
        await client.query('UPDATE "OutboundOrder" SET date = "createdAt" WHERE id = $1', [row.id]);
        console.log(`  ✅ 修复成功`);
        fixCount++;
      }
    }

    console.log(`--------------------------------------------------`);
    console.log(`🎉 线上数据库数据检查与修复完成！共修复了 ${fixCount} 张偏差单据。`);

  } catch (err) {
    console.error("❌ 无法连接到 47.98.98.18:5432 数据库:");
    console.error(err.message);
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      console.error("\n💡 原因说明：服务器 47.98.98.18 的 5432 端口未向公网 IP 开放防火墙/安全组，或 PostgreSQL 仅配置了本地（127.0.0.1）监听。");
    }
  } finally {
    await client.end().catch(() => {});
  }
}

run();
