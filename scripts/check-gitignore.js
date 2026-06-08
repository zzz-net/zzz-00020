#!/usr/bin/env node
/**
 * 防回归脚本：校验 .gitignore 规则是否齐全，以及运行痕迹/私有数据文件是否已从 git 跟踪中移除
 *
 * 用法：
 *   node scripts/check-gitignore.js
 *
 * 退出码：0 全部通过，非 0 存在问题
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MUST_IGNORE_PATTERNS = [
  { pattern: 'data/', reason: 'SQLite 真实预约数据目录（含 db/wal/shm），绝不能提交' },
  { pattern: '*.db', reason: '任何 SQLite 数据库文件' },
  { pattern: '*.db-wal', reason: 'SQLite WAL 模式写入日志' },
  { pattern: '*.db-shm', reason: 'SQLite WAL 模式共享内存索引' },
  { pattern: '.trae/', reason: 'IDE 工具私有目录，含个人运行痕迹' },
];

const MUST_NOT_BE_TRACKED = [
  { path: 'data/clinic.db', hint: '运行 git rm --cached data/clinic.db' },
  { path: 'data/clinic.db-wal', hint: '运行 git rm --cached data/clinic.db-wal' },
  { path: 'data/clinic.db-shm', hint: '运行 git rm --cached data/clinic.db-shm' },
  { path: '.trae/documents/PRD.md', hint: '运行 git rm --cached -r .trae/' },
  { path: '.trae/documents/Technical-Architecture.md', hint: '运行 git rm --cached -r .trae/' },
];

const MUST_BE_IGNORED = [
  'data/clinic.db',
  'data/clinic.db-wal',
  'data/clinic.db-shm',
  'data/any-folder-placeholder',
  '.trae/documents/any-file.md',
  '.trae/anything',
  'foo.db',
  'subdir/bar.db-wal',
  'baz.db-shm',
];

let exitCode = 0;
const log = (msg) => process.stdout.write(msg + '\n');
const err = (msg) => {
  process.stderr.write('  ✗ ' + msg + '\n');
  exitCode = 1;
};
const ok = (msg) => log('  ✓ ' + msg);

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
  } catch (e) {
    return '';
  }
}

log('\n=== 1. 校验 .gitignore 是否包含必要规则 ===');
const gitignorePath = path.join(ROOT, '.gitignore');
if (!fs.existsSync(gitignorePath)) {
  err('.gitignore 不存在');
  process.exit(1);
}
const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
for (const { pattern, reason } of MUST_IGNORE_PATTERNS) {
  const lines = gitignoreContent.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(pattern)) {
    ok(`规则 ${JSON.stringify(pattern)} 已存在 (${reason})`);
  } else {
    err(`规则 ${JSON.stringify(pattern)} 缺失 —— ${reason}`);
  }
}

log('\n=== 2. 校验已知敏感文件未被 git 跟踪 ===');
const trackedFiles = new Set(
  run('git ls-files')
    .split('\n')
    .filter(Boolean),
);
for (const { path: p, hint } of MUST_NOT_BE_TRACKED) {
  if (trackedFiles.has(p)) {
    err(`${p} 仍在 git 跟踪中 —— ${hint}`);
  } else {
    ok(`${p} 未被跟踪`);
  }
}

log('\n=== 3. 校验 git check-ignore 实际生效 ===');
for (const p of MUST_BE_IGNORED) {
  const matched = run(`git check-ignore -q -- "${p}" ; echo $?`);
  const actual = run(`git check-ignore -v -- "${p}"`);
  if (actual) {
    ok(`${p} 被忽略  (${actual.split(/\s+/).slice(0, 2).join(' ')})`);
  } else {
    err(`${p} 未被 git 忽略！请在 .gitignore 中添加对应规则`);
  }
}

log('\n=== 4. 校验 data 目录下真实数据文件存在但未被跟踪 ===');
if (trackedFiles.size > 0 && [...trackedFiles].some((f) => f.startsWith('data/'))) {
  const bad = [...trackedFiles].filter((f) => f.startsWith('data/'));
  err(`data/ 目录下存在被跟踪的文件: ${bad.join(', ')}`);
} else {
  ok('data/ 下没有任何文件被 git 跟踪');
}

log(exitCode === 0 ? '\n✅ 全部 gitignore 防回归检查通过\n' : '\n❌ 存在问题，请根据上面的提示修复\n');
process.exit(exitCode);
