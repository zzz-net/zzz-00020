#!/usr/bin/env tsx
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'clinic.db');

const db = new Database(DB_PATH);

console.log('=== reschedule_request 字段 notnull 标志 ===');
const cols = db.prepare("PRAGMA table_info(reschedule_request)").all() as any[];
cols.forEach(c => console.log(`  ${String(c.cid).padStart(2)}. ${String(c.name).padEnd(20)} type=${String(c.type).padEnd(8)} notnull=${c.notnull} dflt=${c.dflt_value}`));

db.close();
