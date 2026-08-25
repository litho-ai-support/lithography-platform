// test/run-e2e-group.js
const { spawnSync } = require('child_process');

const KNOWN_GROUPS = ['core', 'worker', 'smoke'];
const KNOWN_NEEDS = ['mysql', 'redis', 'bullmq', 'external'];

/**
 * 解析逗号分隔的文件列表
 * @param {string | undefined} raw 原始环境变量
 * @returns {string[]}
 */
const parseCsv = (raw) =>
  (raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * 将分组 needs 对象转为逗号分隔字符串
 * @param {Record<string, boolean> | undefined} needs 依赖映射
 * @returns {string}
 */
const parseNeeds = (needs) =>
  Object.entries(needs || {})
    .filter((entry) => entry[1] === true)
    .map((entry) => entry[0])
    .join(',');

const parseNeedsCsv = (raw) =>
  parseCsv(raw)
    .map((entry) => entry.toLowerCase())
    .filter((entry) => KNOWN_NEEDS.includes(entry));

/**
 * 按分组逐个文件执行 E2E，避免单进程加载全部 schema 引发冲突
 * @returns {void}
 */
const run = () => {
  const cliArgs = process.argv.slice(2);
  const cliNeedsArg = cliArgs.find((arg) => arg.startsWith('--needs='));
  const cliGroup = cliArgs.find((arg) => KNOWN_GROUPS.includes(arg));
  const cliSpecs = cliArgs.filter((arg) => arg.endsWith('.e2e-spec.ts'));
  const fileMode = cliArgs.includes('--file');
  const watchMode = cliArgs.includes('--watch');
  const debugMode = cliArgs.includes('--inspect-brk');
  const passthroughArgs = cliArgs.filter(
    (arg) =>
      !KNOWN_GROUPS.includes(arg) &&
      !arg.endsWith('.e2e-spec.ts') &&
      !arg.startsWith('--needs=') &&
      !['--file', '--watch', '--inspect-brk'].includes(arg),
  );
  const groupName = cliGroup || process.env.E2E_GROUP || 'core';
  process.env.E2E_GROUP = groupName;

  const jestConfig = require('./jest-e2e.js');
  const groups = jestConfig.__GROUPS || {};
  const group = groups[groupName];

  if (!group) {
    console.error(`Unknown E2E group: ${groupName}`);
    process.exit(1);
  }

  const cliNeeds = parseNeedsCsv(cliNeedsArg ? cliNeedsArg.slice('--needs='.length) : '');
  const envNeeds = parseNeedsCsv(process.env.E2E_NEEDS);
  const needs = cliNeeds.length
    ? cliNeeds.join(',')
    : envNeeds.length
      ? envNeeds.join(',')
      : parseNeeds(group.needs);
  const specsFromEnv = parseCsv(process.env.E2E_SPECS);
  const specs = cliSpecs.length ? cliSpecs : specsFromEnv.length ? specsFromEnv : group.specs;
  if (fileMode && specs.length !== 1) {
    console.error('test:e2e:file 需要且只接受 1 个 *.e2e-spec.ts 文件参数');
    process.exit(1);
  }
  if (watchMode && specs.length !== 1) {
    console.error('watch 模式需要且只接受 1 个 *.e2e-spec.ts 文件参数');
    process.exit(1);
  }
  for (const spec of specs) {
    console.log(`\n▶ Running ${groupName}: ${spec}`);
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'e2e',
      E2E_GROUP: groupName,
      E2E_SPECS: spec,
      E2E_NEEDS: needs,
    };

    const jestArgs = ['-c', './test/jest-e2e.js', '--runInBand', '--detectOpenHandles'];
    if (watchMode) {
      jestArgs.push('--watch');
    }
    if (passthroughArgs.length) {
      jestArgs.push(...passthroughArgs);
    }
    const command = debugMode ? 'node' : 'npx';
    const commandArgs = debugMode
      ? ['--inspect-brk', './node_modules/.bin/jest', ...jestArgs]
      : ['jest', ...jestArgs];
    const result = spawnSync(command, commandArgs, {
      stdio: 'inherit',
      env,
    });

    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
};

run();
