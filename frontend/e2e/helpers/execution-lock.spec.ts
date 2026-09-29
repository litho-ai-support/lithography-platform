// e2e/helpers/execution-lock.spec.ts
// @vitest-environment node

/**
 * 专用隔离库执行锁的防回归单测（PR5 四次复查 P1 / 五轮复查 P1+P2 加固）。
 *
 * 守住的不变量：同一隔离库上任意时刻只有一个进程能进入 Migration/Seed/物理清理窗口，
 * 且任何进程都不得删除或搬走「不是自己建立的、或未经原子确认已废弃的」锁文件。
 *
 * 覆盖 8 个确定性场景 + 2 个真实多进程竞争场景：
 * 1. 不可解析锁（旧实现「已创建未写入」窗口的产物）不得被抢占；
 * 2. 持有者存活时硬失败，释放后可重新获取（释放与重新获取交错）；
 * 3. 持有者已退出的废弃锁可被接管，且落盘归属 token 为接管者；
 * 4. 释放只在 token 一致时删除（仅比 pid 会误删他人新锁）；
 * 5. 释放严格一次性：第二次调用不再触碰锁路径；
 * 6. 「另一进程正在接管同一把废弃锁」（接管凭证已存在）时失败关闭且不动原锁；
 * 7. 非 ENOENT 的删除失败（EACCES）必须抛出，不得被吞成静默假成功；
 * 8. 缺 token 的历史锁文件同样不被抢占（仅 pid 不足以判定归属）；
 * 9. 两个真实子进程同时接管同一把废弃锁：恰好一个进入临界区；
 * 10. 三个真实子进程同时竞争：仍然恰好一个进入临界区（覆盖「A 接管发布后、
 *     B 仍按旧观察动作、C 趁机插入」的三进程交错）。
 *
 * 多进程夹具见 `execution-lock-race-child.ts`（非 `*.spec.ts`，不被测试收集器执行）。
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { acquireExecutionLockAt, readExecutionLockOwner } from './execution-lock';

const RACE_CHILD_PATH = fileURLToPath(new URL('./execution-lock-race-child.ts', import.meta.url));

/** root 下目录权限不生效，EACCES 用例无法成立（本仓库 CI 与开发机均为普通用户） */
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

const tempDirs: string[] = [];

function makeLockPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'execution-lock-spec-'));
  tempDirs.push(dir);

  return path.join(dir, 'dedicated.lock');
}

/** 取得一个「确定已退出」的 pid：同步跑一个立刻退出的子进程并读它的 pid */
function resolveDeadPid(): number {
  const probe = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  const pid = probe.pid;

  if (pid === undefined) {
    throw new Error('无法取得已退出子进程的 pid，无法构造废弃锁夹具');
  }

  return pid;
}

function writeOwnerFile(lockPath: string, owner: Record<string, unknown>): void {
  writeFileSync(lockPath, `${JSON.stringify(owner)}\n`);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();

    if (dir !== undefined) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe('acquireExecutionLockAt 的失败关闭与归属校验', () => {
  it('锁文件内容不可解析时不抢占：抛错且原文件原样保留', () => {
    const lockPath = makeLockPath();
    // 复现旧实现「已创建、owner 尚未写入」的中间态
    writeFileSync(lockPath, '');

    expect(() => acquireExecutionLockAt(lockPath)).toThrow(/内容不可解析/);
    // 旧实现会把它当废弃锁删掉并自己拿锁；新实现绝不删除无法确认归属的锁
    expect(existsSync(lockPath)).toBe(true);
    expect(readFileSync(lockPath, 'utf8')).toBe('');
  });

  it('缺 token 的历史锁文件同样不被抢占（仅 pid 不足以判定归属）', () => {
    const lockPath = makeLockPath();
    writeOwnerFile(lockPath, { pid: process.pid, startedAt: '2026-09-26T00:00:00.000Z' });

    expect(() => acquireExecutionLockAt(lockPath)).toThrow(/内容不可解析/);
    expect(existsSync(lockPath)).toBe(true);
  });

  it('持有者存活时硬失败；释放后可重新获取（释放与重新获取交错）', () => {
    const lockPath = makeLockPath();

    const releaseFirst = acquireExecutionLockAt(lockPath);
    const first = readExecutionLockOwner(lockPath);

    // 本进程 pid 必然存活：第二次获取必须硬失败，不得并行进入临界区
    expect(() => acquireExecutionLockAt(lockPath)).toThrow(/已有真实联调在执行/);
    // 失败路径不得动到持有者的锁
    expect(readExecutionLockOwner(lockPath)?.token).toBe(first?.token);

    releaseFirst();
    expect(existsSync(lockPath)).toBe(false);

    // 释放后可重新获取，且归属 token 已更新（不是同一把锁）
    const releaseSecond = acquireExecutionLockAt(lockPath);
    expect(readExecutionLockOwner(lockPath)?.token).not.toBe(first?.token);
    releaseSecond();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('持有者已退出时可接管废弃锁，且落盘归属 token 为接管者', () => {
    const lockPath = makeLockPath();
    writeOwnerFile(lockPath, { pid: resolveDeadPid(), startedAt: 'dead', token: 'stale-token' });

    const release = acquireExecutionLockAt(lockPath);
    const owner = readExecutionLockOwner(lockPath);

    expect(owner?.pid).toBe(process.pid);
    expect(owner?.token).not.toBe('stale-token');

    release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('释放只在 token 一致时删除：锁被他人重建后不得误删', () => {
    const lockPath = makeLockPath();

    const release = acquireExecutionLockAt(lockPath);

    // 模拟「本进程释放前，锁已被另一进程接管并重建」：同 pid、不同 token
    writeOwnerFile(lockPath, {
      pid: process.pid,
      startedAt: '2026-09-26T00:00:00.000Z',
      token: 'other-owner-token',
    });

    release();

    // 旧实现仅比 pid 会删掉这把新锁；新实现必须原样保留
    expect(existsSync(lockPath)).toBe(true);
    expect(readExecutionLockOwner(lockPath)?.token).toBe('other-owner-token');
  });

  it('释放严格一次性：第二次调用即使锁路径上是同一 token 也不再删除', () => {
    const lockPath = makeLockPath();

    const release = acquireExecutionLockAt(lockPath);
    const owner = readExecutionLockOwner(lockPath);

    if (owner === null) {
      throw new Error('获取成功后必须能读回锁归属');
    }

    release();
    expect(existsSync(lockPath)).toBe(false);

    // 人为重建「同一 token」的锁：只有「释放只生效一次」能保住它
    writeOwnerFile(lockPath, { pid: owner.pid, startedAt: owner.startedAt, token: owner.token });
    release();
    expect(existsSync(lockPath)).toBe(true);
  });

  it('另一进程正在接管同一把废弃锁（凭证目录已存在）时失败关闭，且不动原锁', () => {
    const lockPath = makeLockPath();
    writeOwnerFile(lockPath, { pid: resolveDeadPid(), startedAt: 'dead', token: 'stale-token' });
    // 凭证目录名由「被观察到的废弃 token」决定，故可直接预置以模拟并发接管
    mkdirSync(`${lockPath}.reclaim.stale-token`);

    expect(() => acquireExecutionLockAt(lockPath)).toThrow(/正在接管/);
    // 失败关闭：不删、不搬、不改写那把废弃锁（由仍在接管的进程负责）
    expect(readExecutionLockOwner(lockPath)?.token).toBe('stale-token');
  });

  it.skipIf(isRoot)('释放时非 ENOENT 的删除失败必须抛出，不得静默假成功（EACCES）', () => {
    const lockPath = makeLockPath();
    const dir = path.dirname(lockPath);
    const release = acquireExecutionLockAt(lockPath);

    // 去掉目录写权限：unlink 必然失败（非 ENOENT）
    chmodSync(dir, 0o500);

    try {
      expect(() => release()).toThrow(/EACCES|EPERM/);
    } finally {
      chmodSync(dir, 0o700);
    }

    // 锁确实还在：失败没有被吞成「已释放」
    expect(existsSync(lockPath)).toBe(true);
  });
});

interface RaceChild {
  readonly diagnostics: () => string;
  readonly readLine: () => Promise<string>;
  readonly send: (line: string) => void;
  readonly exited: Promise<void>;
}

/**
 * 把可读流切成「一行一次」的拉取接口。
 *
 * 流结束、流出错或子进程提前退出时，**挂起中的读取必须立即 reject**：否则
 * 子进程启动失败会被父侧转译成一个 60 秒空等超时，真实原因（退出码与 stderr）
 * 随之丢失。`fail()` 由调用方在检测到子进程终止时触发。
 */
function createLineReader(
  stream: Readable,
  describe: (reason: string) => string,
): { fail: (reason: string) => void; readLine: () => Promise<string> } {
  const buffered: string[] = [];
  const waiting: Array<{ reject: (error: Error) => void; resolve: (line: string) => void }> = [];
  let pending = '';
  let terminal: string | null = null;

  function rejectWaiting(): void {
    while (waiting.length > 0) {
      waiting.shift()?.reject(new Error(describe(terminal ?? '子进程已终止')));
    }
  }

  function fail(reason: string): void {
    terminal = reason;
    rejectWaiting();
  }

  stream.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8');

    let separator = pending.indexOf('\n');

    while (separator >= 0) {
      const line = pending.slice(0, separator).trim();
      pending = pending.slice(separator + 1);

      const waiter = waiting.shift();

      if (waiter === undefined) {
        buffered.push(line);
      } else {
        waiter.resolve(line);
      }

      separator = pending.indexOf('\n');
    }
  });

  stream.on('end', () => {
    fail('stdout 已结束');
  });
  stream.on('error', (error: Error) => {
    fail(`stdout 出错：${error.message}`);
  });

  return {
    fail,
    readLine: () =>
      new Promise<string>((resolve, reject) => {
        const line = buffered.shift();

        if (line !== undefined) {
          resolve(line);

          return;
        }

        if (terminal !== null) {
          reject(new Error(describe(terminal)));

          return;
        }

        waiting.push({ reject, resolve });
      }),
  };
}

function startRaceChild(lockPath: string, scriptPath = RACE_CHILD_PATH): RaceChild {
  const child = spawn(process.execPath, [scriptPath, lockPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // 子夹具 stderr 必须捕获并随失败一起抛出：设成 ignore 会让「子进程根本起不来」
  // 与「竞争断言不成立」在父侧长得一模一样（都是 60 秒超时）。
  const stderrChunks: string[] = [];

  child.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString('utf8'));
  });

  let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  let spawnError: Error | null = null;

  function diagnostics(): string {
    return [
      `exit=${exit === null ? 'null' : `${String(exit.code)}/${exit.signal ?? '-'}`}`,
      `spawnError=${spawnError?.message ?? '-'}`,
      `stderr=${stderrChunks.join('').trim() || '(空)'}`,
    ].join('；');
  }

  const describe = (reason: string): string =>
    `执行锁竞态子进程失败（${reason}）：${diagnostics()}`;
  const { fail, readLine } = createLineReader(child.stdout, describe);

  child.on('error', (error: Error) => {
    spawnError = error;
    fail('启动失败');
  });
  child.once('exit', (code, signal) => {
    exit = { code, signal };
  });
  child.once('close', () => {
    fail(exit === null ? '未正常退出' : '提前退出');
  });

  return {
    diagnostics,
    exited: new Promise<void>((resolve) => {
      child.once('exit', () => {
        resolve();
      });
    }),
    readLine,
    send: (line: string) => {
      child.stdin.write(`${line}\n`);
    },
  };
}

/**
 * 跑一轮「N 个真实子进程用 barrier 同时抢同一把废弃锁」的竞争。
 *
 * @returns 各子进程的最终回报行
 */
async function raceOnStaleLock(lockPath: string, childCount: number): Promise<string[]> {
  const children = Array.from({ length: childCount }, () => startRaceChild(lockPath));

  // 屏障：所有子进程各自就绪后再一起发令，尽量让获取动作重叠
  expect(await Promise.all(children.map((child) => child.readLine()))).toEqual(
    Array.from({ length: childCount }, () => 'READY'),
  );
  for (const child of children) {
    child.send('go');
  }

  const results = await Promise.all(children.map((child) => child.readLine()));
  const winnerIndex = results.findIndex((line) => line.startsWith('ACQUIRED:'));
  const winnerToken = results[winnerIndex].slice('ACQUIRED:'.length);

  // 关键断言：胜者的锁必须仍在锁路径上（败者的接管 / 回滚不得把它删掉或搬走）
  expect(readExecutionLockOwner(lockPath)?.token).toBe(winnerToken);

  children[winnerIndex].send('release');
  expect(await children[winnerIndex].readLine()).toBe('RELEASED');

  await Promise.all(children.map((child) => child.exited));
  expect(existsSync(lockPath)).toBe(false);

  return results;
}

describe('执行锁的真实多进程竞争', () => {
  it('两个子进程同时接管同一把废弃锁：恰好一个进入临界区，败者不删胜者的锁', async () => {
    const deadPid = resolveDeadPid();
    const rounds = 8;

    for (let round = 0; round < rounds; round += 1) {
      const lockPath = makeLockPath();
      writeOwnerFile(lockPath, { pid: deadPid, startedAt: 'dead', token: `stale-${round}` });

      const results = await raceOnStaleLock(lockPath, 2);

      expect(
        results.filter((line) => line.startsWith('ACQUIRED:')),
        `第 ${round} 轮必须恰好一个进程进入临界区：${results.join(' | ')}`,
      ).toHaveLength(1);
      expect(results.filter((line) => line.startsWith('FAILED:'))).toHaveLength(1);
    }
  }, 60_000);

  it('三个子进程同时接管同一把废弃锁：仍然恰好一个进入临界区（三进程交错）', async () => {
    const deadPid = resolveDeadPid();
    const rounds = 6;

    for (let round = 0; round < rounds; round += 1) {
      const lockPath = makeLockPath();
      writeOwnerFile(lockPath, { pid: deadPid, startedAt: 'dead', token: `stale-3p-${round}` });

      const results = await raceOnStaleLock(lockPath, 3);

      // 三进程交错（A 接管发布后、B 仍按旧观察动作、C 趁机插入）下仍必须只有一个胜者
      expect(
        results.filter((line) => line.startsWith('ACQUIRED:')),
        `第 ${round} 轮必须恰好一个进程进入临界区：${results.join(' | ')}`,
      ).toHaveLength(1);
      expect(results.filter((line) => line.startsWith('FAILED:'))).toHaveLength(2);
    }
  }, 60_000);

  // 失败传播回归：子进程起不来时必须「秒级」抛出退出码与 stderr，不得退化成 60 秒空等。
  // 本用例刻意不设 60s 超时，用的是 vitest 默认超时——一旦退回旧行为，这里会直接超时失败。
  it('子进程无法启动时立即抛出含退出码与 stderr 的诊断，而不是等到超时', async () => {
    const missingScript = fileURLToPath(new URL('./race-child-missing.ts', import.meta.url));
    const child = startRaceChild(makeLockPath(), missingScript);

    await expect(child.readLine()).rejects.toThrow(/race-child-missing\.ts/);
    await child.exited;
  });
});
