// e2e/helpers/execution-lock.spec.ts
// @vitest-environment node

/**
 * 专用隔离库执行锁的防回归单测（PR5 四次复查 P1 / 五轮复查 P1+P2 加固）。
 *
 * 守住的不变量：同一隔离库上任意时刻只有一个进程能进入 Migration/Seed/物理清理窗口，
 * 且任何进程都不得删除或搬走「不是自己建立的、或未经原子确认已废弃的」锁文件。
 *
 * 覆盖 9 个确定性场景 + 2 个真实多进程竞争场景：
 * 1. 不可解析锁（旧实现「已创建未写入」窗口的产物）不得被抢占；
 * 2. 持有者存活时硬失败，释放后可重新获取（释放与重新获取交错）；
 * 3. 持有者已退出的废弃锁可被接管，且落盘归属 token 为接管者；
 * 4. 释放只在 token 一致时删除（仅比 pid 会误删他人新锁）；
 * 5. 释放严格一次性：第二次调用不再触碰锁路径；
 * 6. 「另一进程正在接管同一把废弃锁」（接管凭证已存在）时失败关闭且不动原锁；
 * 7. 释放的非 ENOENT unlink 故障（EACCES / EPERM）必须原样上抛，不得被吞成静默假成功；
 * 8. 释放的 ENOENT 竞态（锁已被他方删除）不抛：释放对已消失的锁幂等；
 * 9. 缺 token 的历史锁文件同样不被抢占（仅 pid 不足以判定归属）；
 * 10. 两个真实子进程同时接管同一把废弃锁：恰好一个进入临界区；
 * 11. 三个真实子进程同时竞争：仍然恰好一个进入临界区（覆盖「A 接管发布后、
 *     B 仍按旧观察动作、C 趁机插入」的三进程交错）。
 *
 * 场景 7 / 8 通过 Vitest hoisted partial mock 包装 `node:fs.unlinkSync` 注入 errno：
 * 只对当前用例的精确锁路径生效，其余路径与用例一律委托真实实现，注入由 afterEach
 * 清除（2026-10-02 复审：旧夹具用 `chmodSync(dir, 0o500)` 制造 EACCES，Windows 上
 * 权限位不生效、夹具无法成立，已移除；ENOENT 竞态夹具先真实移除目标锁再抛错，
 * 使后置状态与「他方已删除」的真实时序一致）。
 *
 * 多进程夹具见 `execution-lock-race-child.ts`（非 `*.spec.ts`，不被测试收集器执行）。
 */

import { type ChildProcess, fork, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { acquireExecutionLockAt, readExecutionLockOwner } from './execution-lock';
import type { ChildMessage, ParentCommand } from './execution-lock-race-child';

const RACE_CHILD_PATH = fileURLToPath(new URL('./execution-lock-race-child.ts', import.meta.url));

/**
 * 释放故障注入槽（跨平台确定性的 errno 夹具）：
 * 旧夹具用 `chmodSync(dir, 0o500)` 让 unlink 触发 EACCES，但 Windows 上权限位不生效、
 * root 下同样可写，用例无法成立。改为 partial mock 包装 `node:fs.unlinkSync`——
 * 只对「当前用例的精确锁路径」抛指定 errno，其余路径（暂存文件、接管目录等）与其他
 * 用例一律走真实实现；afterEach 清除后行为立即恢复真实。
 */
const { unlinkFault } = vi.hoisted(() => ({
  unlinkFault: {
    error: null as NodeJS.ErrnoException | null,
    path: null as string | null,
    /** true 时先对精确目标调用真实 unlink（模拟他方已移除锁），再抛出注入错误 */
    removeBeforeThrow: false,
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();

  return {
    ...actual,
    unlinkSync: (target: Parameters<typeof actual.unlinkSync>[0]) => {
      const isTarget = unlinkFault.path !== null && String(target) === unlinkFault.path;

      if (isTarget && unlinkFault.error !== null) {
        if (unlinkFault.removeBeforeThrow) {
          // ENOENT 竞态的真实时序：他方在归属检查与实际删除之间移除了锁——
          // 先把目标真实删掉，本调用才体验到「文件已不存在」的 ENOENT，
          // 保证用例结束时可观察状态是「锁不存在」而非「锁仍在」
          actual.unlinkSync(target);
        }

        throw unlinkFault.error;
      }

      return actual.unlinkSync(target);
    },
  };
});

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

/**
 * 注入「删除失败」（EACCES/EPERM）：不触碰真实文件，只让精确锁路径上的 unlink
 * 抛出注入错误；返回注入对象供断言「原样上抛同一引用」，锁必须保持原样。
 */
function injectUnlinkFailure(lockPath: string, code: 'EACCES' | 'EPERM'): NodeJS.ErrnoException {
  const injected: NodeJS.ErrnoException = Object.assign(
    new Error(`${code}: 注入的 unlink 故障（${lockPath}）`),
    { code, path: lockPath, syscall: 'unlink' },
  );

  unlinkFault.path = lockPath;
  unlinkFault.removeBeforeThrow = false;
  unlinkFault.error = injected;

  return injected;
}

/**
 * 注入「ENOENT 竞态」：他方在 release 的归属检查通过之后、实际删除之前移除了锁。
 * 精确锁路径上的 unlink 会先真实删除目标（锁自此不存在），再抛出 ENOENT；
 * 注入后、release 前锁必须仍在——否则 token 检查会提前失败，unlink 根本不被调用。
 */
function injectUnlinkAlreadyRemovedRace(lockPath: string): NodeJS.ErrnoException {
  const injected: NodeJS.ErrnoException = Object.assign(
    new Error(`ENOENT: 注入的 unlink 竞态（${lockPath} 已被他方移除）`),
    { code: 'ENOENT', path: lockPath, syscall: 'unlink' },
  );

  unlinkFault.path = lockPath;
  unlinkFault.removeBeforeThrow = true;
  unlinkFault.error = injected;

  return injected;
}

afterEach(() => {
  // 先恢复真实 unlink 行为，再回收临时目录：注入夹具绝不跨用例泄漏
  unlinkFault.path = null;
  unlinkFault.error = null;
  unlinkFault.removeBeforeThrow = false;

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
});

/**
 * 释放（unlink）故障的跨平台确定性传播（2026-10-02 复审 P2，ENOENT 真实性修订）。
 *
 * 旧夹具依赖目录权限位制造 EACCES，Windows 上权限位不生效，用例无法成立；
 * 改为对精确锁路径注入 errno，断言「非 ENOENT 原样上抛 + 锁保持原样」与
 * 「ENOENT 竞态不抛 + 锁已消失」两条互补契约，不依赖宿主文件系统的权限模型。
 *
 * ENOENT 用例必须真实模拟「锁先被他方移除」：夹具先真实删除、后抛出注入 errno，
 * 后置断言因此收紧为「不抛且锁不存在」——只抛错而锁仍在的旧夹具会让「锁已消失」
 * 这一前提永远不被验证。
 */
describe('释放（unlink）故障的确定性传播', () => {
  it.each(['EACCES', 'EPERM'] as const)(
    '非 ENOENT 的删除失败（%s）原样上抛同一错误对象，锁保持原样，不得静默假成功',
    (code) => {
      const lockPath = makeLockPath();
      const release = acquireExecutionLockAt(lockPath);
      const injected = injectUnlinkFailure(lockPath, code);

      let caught: unknown = null;

      try {
        release();
      } catch (error) {
        caught = error;
      }

      // 原样上抛注入的错误对象（同一引用）：不得包装、不得改写 code、不得吞掉
      expect(caught).toBe(injected);
      // 锁确实还在：失败没有被吞成「已释放」
      expect(existsSync(lockPath)).toBe(true);
    },
  );

  it('ENOENT 竞态（锁已被他方删除）不抛：释放对已消失的锁幂等', () => {
    const lockPath = makeLockPath();
    const release = acquireExecutionLockAt(lockPath);

    injectUnlinkAlreadyRemovedRace(lockPath);

    // 时序守卫：删除发生在 release 的 unlink 时刻。若夹具在注入时就删锁，
    // release 的 token 检查会提前失败、unlink 根本不被调用，用例会假绿
    expect(existsSync(lockPath)).toBe(true);

    // 「只忽略 ENOENT」契约的另一半：竞态删除不得升级或包装为其他错误
    expect(() => release()).not.toThrow();
    // 真实竞态的后置状态：锁已被移除（而不是「只抛错、锁仍在」的旧夹具语义）
    expect(existsSync(lockPath)).toBe(false);
  });
});

interface RaceChild {
  /**
   * 子进程终态诊断（文件落盘，非管道）。`exit` 只代表进程结束；stdout 管道在父侧
   * `disconnect()` 后不再触发 `close`，数据可能晚于 `exit` 到达，故诊断必须走文件通道。
   */
  readonly diagnosticText: () => string;
  readonly diagnostics: () => string;
  readonly disconnect: () => void;
  readonly exited: Promise<number | null>;
  readonly readMessage: () => Promise<ChildMessage>;
  readonly send: (command: ParentCommand) => void;
  readonly stdoutText: () => string;
}

/** 父侧对子进程消息做同等严格的 fail-closed 校验（消息来自另一进程，不可信） */
function parseChildMessage(value: unknown): ChildMessage | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  switch (record.type) {
    case 'READY':
    case 'RELEASED':
      return Object.keys(record).length === 1 ? { type: record.type } : null;
    case 'ACQUIRED':
      return Object.keys(record).length === 2 && typeof record.token === 'string'
        ? { type: 'ACQUIRED', token: record.token }
        : null;
    case 'FAILED':
      return Object.keys(record).length === 2 && typeof record.message === 'string'
        ? { type: 'FAILED', message: record.message }
        : null;
    default:
      return null;
  }
}

/** 诊断用的单行表示；与旧文本协议保持同形，方便读失败信息 */
function formatChildMessage(message: ChildMessage): string {
  switch (message.type) {
    case 'ACQUIRED':
      return `ACQUIRED:${message.token}`;
    case 'FAILED':
      return `FAILED:${message.message}`;
    default:
      return message.type;
  }
}

/**
 * 把 IPC 消息切成「一条一次」的拉取接口。
 *
 * 通道出错或子进程终止时，**挂起中的读取必须立即 reject**：否则子进程启动失败会被
 * 父侧转译成一个 60 秒空等超时，真实原因（退出码与 stderr）随之丢失。
 *
 * 终态只由调用方在子进程 `close` 时触发（`fail()`）：`close` 必然晚于 `exit`，
 * 此时退出码已落定、stderr 已冲刷完毕，诊断里的 `exit` 不会是 `null`。
 */
function createMessageReader(
  child: ChildProcess,
  describe: (reason: string) => string,
  observe: (message: ChildMessage) => void,
): { fail: (reason: string) => void; readMessage: () => Promise<ChildMessage> } {
  const buffered: ChildMessage[] = [];
  const waiting: Array<{
    reject: (error: Error) => void;
    resolve: (message: ChildMessage) => void;
  }> = [];
  let terminal: string | null = null;

  function rejectWaiting(): void {
    while (waiting.length > 0) {
      waiting.shift()?.reject(new Error(describe(terminal ?? '子进程已终止')));
    }
  }

  function fail(reason: string): void {
    // 首个终态为准：子进程「启动失败」与随后的「close」会接连触发，
    // 若后到的原因覆盖先到的，真实原因（启动失败）就会被「未正常退出」顶掉。
    if (terminal !== null) {
      return;
    }

    terminal = reason;
    rejectWaiting();
  }

  child.on('message', (message) => {
    const parsed = parseChildMessage(message);

    if (parsed === null) {
      fail(`子进程消息非法：${JSON.stringify(message)}`);

      return;
    }

    observe(parsed);

    const waiter = waiting.shift();

    if (waiter === undefined) {
      buffered.push(parsed);
    } else {
      waiter.resolve(parsed);
    }
  });

  return {
    fail,
    readMessage: () =>
      new Promise<ChildMessage>((resolve, reject) => {
        const message = buffered.shift();

        if (message !== undefined) {
          resolve(message);

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
  // 终态诊断落盘路径：与锁文件同目录（由 makeLockPath 注册进 tempDirs，用例结束即清理），
  // 作为**非管道**的确定性诊断通道（见 RaceChild.diagnosticText 注释）。
  const diagnosticPath = path.join(path.dirname(lockPath), 'child-diagnostics.log');
  // 用 `fork` 而非 `spawn` + 文本管道：控制消息走 Node 原生 IPC，stdout/stderr 仅做诊断。
  // `execArgv: []` 避免继承宿主（Vitest）的启动参数，插桩地加载 `.ts` 夹具。
  const child = fork(scriptPath, [lockPath, diagnosticPath], {
    execArgv: [],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  // 子夹具 stderr 必须捕获并随失败一起抛出：设成 ignore 会让「子进程根本起不来」
  // 与「竞争断言不成立」在父侧长得一模一样（都是 60 秒超时）。
  const stderrChunks: string[] = [];
  // stdout 只承载诊断（如断连/自毁时的单行状态）；持续消费可避免管道写满阻塞子进程
  const stdoutChunks: string[] = [];

  child.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString('utf8'));
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutChunks.push(chunk.toString('utf8'));
  });

  let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  let spawnError: Error | null = null;
  let lastMessage = '(无)';

  function diagnostics(): string {
    return [
      `exit=${exit === null ? 'null' : `${String(exit.code)}/${exit.signal ?? '-'}`}`,
      `spawnError=${spawnError?.message ?? '-'}`,
      `lastMessage=${lastMessage}`,
      `stderr=${stderrChunks.join('').trim() || '(空)'}`,
    ].join('；');
  }

  const describe = (reason: string): string =>
    `执行锁竞态子进程失败（${reason}）：${diagnostics()}`;
  const { fail, readMessage } = createMessageReader(child, describe, (message) => {
    lastMessage = formatChildMessage(message);
  });

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
    diagnosticText: () => (existsSync(diagnosticPath) ? readFileSync(diagnosticPath, 'utf8') : ''),
    diagnostics,
    disconnect: () => {
      child.disconnect();
    },
    exited: new Promise<number | null>((resolve) => {
      child.once('exit', (code) => {
        resolve(code);
      });
    }),
    readMessage,
    send: (command: ParentCommand) => {
      child.send(command);
    },
    stdoutText: () => stdoutChunks.join(''),
  };
}

/**
 * 跑一轮「N 个真实子进程用 barrier 同时抢同一把废弃锁」的竞争。
 *
 * @returns 各子进程的最终回报消息
 */
async function raceOnStaleLock(lockPath: string, childCount: number): Promise<ChildMessage[]> {
  const children = Array.from({ length: childCount }, () => startRaceChild(lockPath));

  // 屏障：所有子进程各自就绪后再一起发令，尽量让获取动作重叠
  expect(await Promise.all(children.map((child) => child.readMessage()))).toEqual(
    Array.from({ length: childCount }, () => ({ type: 'READY' })),
  );
  for (const child of children) {
    child.send({ type: 'GO' });
  }

  const results = await Promise.all(children.map((child) => child.readMessage()));
  const winnerIndex = results.findIndex((message) => message.type === 'ACQUIRED');
  const winner = results[winnerIndex];

  if (winner.type !== 'ACQUIRED') {
    throw new Error(`本轮没有胜者：${results.map(formatChildMessage).join(' | ')}`);
  }

  // 关键断言：胜者的锁必须仍在锁路径上（败者的接管 / 回滚不得把它删掉或搬走）
  expect(readExecutionLockOwner(lockPath)?.token).toBe(winner.token);

  children[winnerIndex].send({ type: 'RELEASE' });
  expect(await children[winnerIndex].readMessage()).toEqual({ type: 'RELEASED' });

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
        results.filter((message) => message.type === 'ACQUIRED'),
        `第 ${round} 轮必须恰好一个进程进入临界区：${results.map(formatChildMessage).join(' | ')}`,
      ).toHaveLength(1);
      expect(results.filter((message) => message.type === 'FAILED')).toHaveLength(1);
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
        results.filter((message) => message.type === 'ACQUIRED'),
        `第 ${round} 轮必须恰好一个进程进入临界区：${results.map(formatChildMessage).join(' | ')}`,
      ).toHaveLength(1);
      expect(results.filter((message) => message.type === 'FAILED')).toHaveLength(2);
    }
  }, 60_000);

  // 失败传播回归：子进程起不来时必须「秒级」抛出退出码与 stderr，不得退化成 60 秒空等。
  // 本用例刻意不设 60s 超时，用的是 vitest 默认超时——一旦退回旧行为，这里会直接超时失败。
  it('子进程无法启动时立即抛出含退出码与 stderr 的诊断，而不是等到超时', async () => {
    const missingScript = fileURLToPath(new URL('./race-child-missing.ts', import.meta.url));
    const child = startRaceChild(makeLockPath(), missingScript);
    const failure = child.readMessage();

    // 退出码必须已落定（不得是 `exit=null`：那说明在子进程退出前就终结了诊断）
    await expect(failure).rejects.toThrow(/exit=1\//);
    // stderr 原文必须随诊断带出，否则「起不来」与「断言不成立」在父侧无法区分
    await expect(failure).rejects.toThrow(/race-child-missing\.ts/);
    await child.exited;
  });
});

/**
 * IPC 控制协议的 fail-closed 回归（S2）。
 *
 * 协议：child→parent `READY | ACQUIRED(token) | FAILED(message) | RELEASED`，
 * parent→child `GO | RELEASE`。任何非法/错序/重复/未知消息都必须在推进协议前被拒绝；
 * 父侧断连必须在明确上限内收敛、归还自有锁并带可诊断状态退出。
 */
describe('执行锁 IPC 控制协议的 fail-closed 回归', () => {
  it('READY 后延迟 500ms 发 GO：子进程仍存活并在收到 GO 后正常获取与释放', async () => {
    const lockPath = makeLockPath();
    const child = startRaceChild(lockPath);

    expect(await child.readMessage()).toEqual({ type: 'READY' });

    // 延迟发令：IPC 通道空闲期间子进程不得因「无活跃句柄」提前退出
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    child.send({ type: 'GO' });

    expect((await child.readMessage()).type).toBe('ACQUIRED');

    child.send({ type: 'RELEASE' });
    expect(await child.readMessage()).toEqual({ type: 'RELEASED' });

    expect(await child.exited).toBe(0);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('重复 GO：持锁后第二阶段收到 GO 被阶段校验拒绝，归还自有锁后失败关闭', async () => {
    const lockPath = makeLockPath();
    const child = startRaceChild(lockPath);

    expect(await child.readMessage()).toEqual({ type: 'READY' });
    child.send({ type: 'GO' });
    child.send({ type: 'GO' });

    expect((await child.readMessage()).type).toBe('ACQUIRED');

    const failed = await child.readMessage();

    expect(failed.type).toBe('FAILED');
    expect(failed.type === 'FAILED' ? failed.message : '').toMatch(/阶段不符/);

    expect(await child.exited).toBe(1);
    // 失败关闭必须归还自有锁，不得把临界区留给已失联的进程
    expect(existsSync(lockPath)).toBe(false);
  });

  it('第一阶段收到晚到/错序的 RELEASE 时被拒绝，不进入临界区', async () => {
    const lockPath = makeLockPath();
    const child = startRaceChild(lockPath);

    expect(await child.readMessage()).toEqual({ type: 'READY' });
    child.send({ type: 'RELEASE' });

    const failed = await child.readMessage();

    expect(failed.type).toBe('FAILED');
    expect(failed.type === 'FAILED' ? failed.message : '').toMatch(/阶段不符/);

    expect(await child.exited).toBe(1);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('非法指令（未知类型/多余字段/空对象）一律 fail-closed，不进入临界区', async () => {
    const invalidMessages: unknown[] = [{ type: 'BOGUS' }, { type: 'GO', extra: 1 }, {}];

    for (const message of invalidMessages) {
      const label = JSON.stringify(message);
      const lockPath = makeLockPath();
      const child = startRaceChild(lockPath);

      expect(await child.readMessage()).toEqual({ type: 'READY' });

      // 绕过类型系统发送脏消息：父侧协议层必须拒绝，不得把它当成指令推进
      child.send(message as ParentCommand);

      const failed = await child.readMessage();

      expect(failed.type, label).toBe('FAILED');
      expect(failed.type === 'FAILED' ? failed.message : '', label).toMatch(/非法指令/);

      expect(await child.exited, label).toBe(1);
      expect(existsSync(lockPath), label).toBe(false);
    }
  });

  it('父侧断开 IPC：子进程归还自有锁并带可诊断状态退出，不留活锁', async () => {
    const lockPath = makeLockPath();
    const child = startRaceChild(lockPath);

    expect(await child.readMessage()).toEqual({ type: 'READY' });
    child.send({ type: 'GO' });
    expect((await child.readMessage()).type).toBe('ACQUIRED');
    // 此刻子进程真实持锁
    expect(existsSync(lockPath)).toBe(true);

    child.disconnect();

    expect(await child.exited).toBe(4);
    // 诊断经文件通道读取（父侧 disconnect 后 stdout 管道不触发 close，不能作为确定性依据）
    expect(child.diagnosticText()).toContain('DISCONNECTED');
    // 断连后必须归还锁：不得留下无人可释放的活锁
    expect(existsSync(lockPath)).toBe(false);
  });
});
