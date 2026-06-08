#!/usr/bin/env tsx
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'clinic.db');

console.log(`检查数据库: ${DB_PATH}`);
console.log(`文件存在: ${fs.existsSync(DB_PATH)}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

console.log('\n=== status_history 表结构 ===');
const histCols = db.prepare("PRAGMA table_info(status_history)").all() as any[];
histCols.forEach(c => console.log(`  ${c.cid}. ${c.name} ${c.type} ${c.notnull ? 'NOT NULL' : ''} ${c.dflt_value ? 'DEFAULT ' + c.dflt_value : ''}`));

console.log('\n=== reschedule_request 表是否存在 ===');
const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reschedule_request'").get() as any;
console.log(`  ${tbl ? '存在' : '不存在'}`);

if (tbl) {
  console.log('\n=== reschedule_request 表结构 ===');
  const rsCols = db.prepare("PRAGMA table_info(reschedule_request)").all() as any[];
  rsCols.forEach(c => console.log(`  ${c.cid}. ${c.name} ${c.type}`));
}

console.log('\n=== appointment 表结构 ===');
const apptCols = db.prepare("PRAGMA table_info(appointment)").all() as any[];
apptCols.forEach(c => console.log(`  ${c.cid}. ${c.name} ${c.type}`));

console.log('\n=== 当前 status_history 记录数 ===');
const cnt = db.prepare("SELECT COUNT(*) as c FROM status_history").get() as any;
console.log(`  ${cnt.c} 条`);

db.close();
