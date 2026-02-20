/*
 * @Date: 2026-02-21 00:43:07
 * @Author: Sube
 * @FilePath: init-db.js
 * @LastEditTime: 2026-02-21 00:45:15
 * @Description: 
 */
/**
 * 容器启动前：自动创建数据库（若不存在）
 * 使用 pg 连接到 postgres 默认库，检查并创建目标库
 */
const { Client } = require('pg');

async function main() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) {
        console.error('DATABASE_URL is not set');
        process.exit(1);
    }

    const url = new URL(rawUrl);
    const dbName = url.pathname.replace(/^\//, '');

    // 连接到 postgres 默认库（不连目标库，因为它可能还不存在）
    const adminUrl = new URL(rawUrl);
    adminUrl.pathname = '/postgres';

    const client = new Client({ connectionString: adminUrl.toString() });

    try {
        await client.connect();
        const res = await client.query(
            `SELECT 1 FROM pg_database WHERE datname = $1`,
            [dbName]
        );
        if (res.rowCount === 0) {
            // 数据库名可能含特殊字符，用双引号包裹
            await client.query(`CREATE DATABASE "${dbName}"`);
            console.log(`✓ Database "${dbName}" created.`);
        } else {
            console.log(`✓ Database "${dbName}" already exists.`);
        }
    } finally {
        await client.end();
    }
}

main().catch(err => {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
});
