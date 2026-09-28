// e2e/helpers/execution-lock-race-child.ts
//
// 执行锁多进程竞态回归夹具（P1 修复的必补回归）。由 `execution-lock.spec.ts`
// 以 `process.execPath` 启动，用**真实子进程**制造跨进程竞争。
//
// 该文件不是 `*.spec.ts`，故既不被 vitest 收集，也不被 Playwright 收集；
// 仅作为 Node 脚本按父进程指令执行一次「READY → go → 获取 → 保持 → release → 释放」。
// 由 `tsconfig.e2e.json` 的类型检查覆盖。

import { acquireExecutionLockAt, readExecutionLockOwner } from './execution-lock.ts';

/** 兜底自尽：父进程若异常退出，子进程不得悬挂 */
const SELF_DESTRUCT_TIMEOUT_MS = 20_000;

function reply(line: string): void {
  process.stdout.write(`${line}\n`);
}

function waitForCommand(): Promise<string> {
  return new Promise((resolve) => {
    process.stdin.once('data', (chunk: Buffer) => {
      resolve(chunk.toString('utf8').trim());
    });
  });
}

async function main(): Promise<number> {
  const lockPath = process.argv[2];

  if (lockPath === undefined || lockPath === '') {
    reply('FAILED:missing-lock-path');

    return 1;
  }

  setTimeout(() => {
    reply('FAILED:self-destruct-timeout');
    process.exit(3);
  }, SELF_DESTRUCT_TIMEOUT_MS).unref();

  // 屏障：先声明就绪，等父进程同时向所有竞争者发令，尽量让获取动作重叠
  reply('READY');

  if ((await waitForCommand()) !== 'go') {
    reply('FAILED:unexpected-command');

    return 1;
  }

  let release: () => void;

  try {
    release = acquireExecutionLockAt(lockPath);
  } catch (error) {
    reply(`FAILED:${(error as Error).message}`);

    return 1;
  }

  // 回报真实落盘的 token：父进程据此断言「败者没有删掉胜者的锁」
  reply(`ACQUIRED:${readExecutionLockOwner(lockPath)?.token ?? 'unknown'}`);

  if ((await waitForCommand()) === 'release') {
    release();
    reply('RELEASED');
  }

  return 0;
}

/**
 * 收尾：断开 stdin 让事件循环自然收敛。
 *
 * 父进程只在需要时写入指令、并不关闭管道，若不断开 stdin，本进程会因 stdin 句柄
 * 仍存活而悬挂到自尽超时；此处显式 destroy，保留 `process.exitCode` 的自然退出
 * 语义（stdout 在正常退出路径上仍会被完整冲刷，不像 `process.exit()` 可能截断）。
 */
process.exitCode = await main();
process.stdin.destroy();
