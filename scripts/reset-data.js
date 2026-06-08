#!/usr/bin/env node
/**
 * 清理本地 SQLite 数据文件（预约记录、号源占用、状态历史等）
 * 删除后下次 npm run dev 启动时会自动重建含样例数据的空库
 *
 * 用法：
 *   npm run data:reset
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const FILES = ['clinic.db', 'clinic.db-wal', 'clinic.db-shm', 'clinic.db-journal'];

let removed = 0;
for (const f of FILES) {
  const p = path.join(DATA_DIR, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('  ✓ 删除', f);
    removed++;
  }
}

if (removed === 0) {
  console.log('  ℹ data/ 下没有 SQLite 数据文件，无需清理');
} else {
  console.log(`\n✅ 已删除 ${removed} 个本地数据文件，下次启动将自动重建含样例数据的空库`);
}
