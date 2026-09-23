#!/usr/bin/env node
// scripts/check-entity-migration-scope.mjs
//
// PR3 范围门禁（敌对式终审 F2）：`origin/main...HEAD` 必须不改动
//   - backend/src/modules/lithography/entities
//   - backend/src/database/migrations
//
// 任务书明确禁止本 PR 修改 AI Entity / Migration；「仅 import 变化」也不是例外。
// 该检查可重复执行（本地复查 + 提审前最后一次确认），失败时打印违规文件并以退出码 1 结束。
//
// 用法：
//   node scripts/check-entity-migration-scope.mjs          # 相对 origin/main
//   BASE=<ref> node scripts/check-entity-migration-scope.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.env.BASE?.trim() || 'origin/main';
const guardedPaths = [
  'backend/src/modules/lithography/entities',
  'backend/src/database/migrations',
];

const run = (args) =>
  execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trimEnd();

const diffArgs = ['diff', '--name-status', `${base}...HEAD`, '--', ...guardedPaths];

let output = '';
try {
  output = run(diffArgs);
} catch (error) {
  console.error(`[entity-migration-scope] 无法比较 ${base}...HEAD：${error.message}`);
  process.exit(2);
}

if (output.length === 0) {
  console.log(
    `[entity-migration-scope] PASS：${base}...HEAD 在 Entity/Migration 两个受保护目录上无 diff。`,
  );
  console.log(`[entity-migration-scope] HEAD=${run(['rev-parse', 'HEAD'])} base=${run(['rev-parse', base])}`);
  process.exit(0);
}

console.error(`[entity-migration-scope] FAIL：${base}...HEAD 改动了受保护目录，禁止提审。`);
console.error(output);
console.error(`[entity-migration-scope] 请撤销上述改动（含「仅 import」变化），或先取得负责人明确批准。`);
process.exit(1);