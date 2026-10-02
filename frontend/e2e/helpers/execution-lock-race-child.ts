// e2e/helpers/execution-lock-race-child.ts
//
// 执行锁多进程竞态回归夹具（P1 修复的必补回归）。由 `execution-lock.spec.ts`
// 以 `child_process.fork()` 启动，用**真实子进程**制造跨进程竞争。
//
// 控制协议走 **Node 原生 IPC**（`process.send` / `message` / `disconnect`），不再依赖
// stdin/stdout 文本管道：管道是否被父进程视为活跃句柄、是否在握手前 EOF，都会随宿主
// 环境（Vitest / Node 版本）而变，曾导致子进程在 READY 前退出或父侧收不到握手。
// stdout/stderr 仅用于诊断，不承载控制消息。
//
// 该文件不是 `*.spec.ts`，故既不被 vitest 收集，也不被 Playwright 收集；
// 仅作为 Node 脚本按父进程指令执行一次「READY → GO → 获取 → 保持 → RELEASE → 释放」。
// 由 `tsconfig.e2e.json` 的类型检查覆盖。

import { appendFileSync } from 'node:fs';

import { acquireExecutionLockAt, readExecutionLockOwner } from './execution-lock.ts';

/** 兜底自尽：父进程若异常退出，子进程不得悬挂 */
const SELF_DESTRUCT_TIMEOUT_MS = 20_000;

/**
 * 诊断落盘路径（可选 argv[3]）。stdout 是**管道**，父侧读取与子进程退出之间存在竞态
 * （实测：父侧 `disconnect()` 后 Node 24 不再触发 `close`，stdout 数据可能晚于 `exit` 到达）；
 * 因此断开/自毁这类终态诊断同步写入本文件，父侧在 `exit` 后读文件即可确定性获得，
 * 与用例执行顺序、宿主调度无关。stdout 仍保留同一行，仅作人工辅助。
 */
const diagnosticPath = process.argv[3];

function writeDiagnostic(line: string): void {
  process.stdout.write(`${line}\n`);

  if (diagnosticPath !== undefined && diagnosticPath !== '') {
    appendFileSync(diagnosticPath, `${line}\n`);
  }
}

/** 子进程 → 父进程的控制消息（显式判别联合） */
export type ChildMessage =
  | { type: 'READY' }
  | { type: 'ACQUIRED'; token: string }
  | { type: 'FAILED'; message: string }
  | { type: 'RELEASED' };

/** 父进程 → 子进程的指令（仅这两种，其余一律 fail-closed） */
export type ParentCommand = { type: 'GO' } | { type: 'RELEASE' };

/** 一次指令接收的结果：成功带指令，失败带可诊断原因 */
type CommandResult =
  | { readonly ok: true; readonly command: ParentCommand }
  | { readonly ok: false; readonly reason: string };

const bufferedResults: CommandResult[] = [];
const waiters: Array<(result: CommandResult) => void> = [];

/** 本进程当前持有的锁的释放函数；为空表示未持有 */
let heldRelease: (() => void) | null = null;
/** 顶层流程是否已收尾（用于抑制自身 `process.disconnect()` 触发的 disconnect 事件） */
let finished = false;
/** 是否因父侧断开 IPC 而收尾（决定退出码与诊断输出） */
let disconnected = false;

function send(message: ChildMessage): void {
  // 通道已断开时 `process.send` 会抛 ERR_IPC_CHANNEL_CLOSED，反而顶掉真实失败原因
  if (process.connected) {
    process.send?.(message);
  }
}

/** 释放自有锁：幂等；释放异常不得顶掉主流程的失败原因 */
function releaseHeldLock(): void {
  if (heldRelease === null) {
    return;
  }

  const release = heldRelease;
  heldRelease = null;

  try {
    release();
  } catch {
    // 锁归属最终由父侧断言；此处静默，优先保留退出码与诊断
  }
}

/**
 * 严格校验父指令：只接受**恰好** `{ type: 'GO' }` / `{ type: 'RELEASE' }`。
 * 多余字段、缺失字段、未知类型、非对象一律拒绝（fail-closed）。
 */
function parseParentCommand(value: unknown): ParentCommand | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (Object.keys(record).length !== 1) {
    return null;
  }

  if (record.type === 'GO') {
    return { type: 'GO' };
  }

  if (record.type === 'RELEASE') {
    return { type: 'RELEASE' };
  }

  return null;
}

function deliver(result: CommandResult): void {
  const waiter = waiters.shift();

  if (waiter === undefined) {
    bufferedResults.push(result);
  } else {
    waiter(result);
  }
}

function nextCommand(): Promise<CommandResult> {
  const queued = bufferedResults.shift();

  if (queued !== undefined) {
    return Promise.resolve(queued);
  }

  return new Promise<CommandResult>((resolve) => {
    waiters.push(resolve);
  });
}

process.on('message', (message) => {
  const command = parseParentCommand(message);

  if (command === null) {
    deliver({ ok: false, reason: `非法指令：${JSON.stringify(message)}` });

    return;
  }

  deliver({ ok: true, command });
});

process.on('disconnect', () => {
  if (finished) {
    return;
  }

  disconnected = true;
  // 父侧断开后不能继续等指令：归还自有锁并唤醒挂起等待，交由顶层正常收尾
  releaseHeldLock();
  deliver({ ok: false, reason: '父进程已断开 IPC 连接' });
});

/** 在指定阶段接收指令；成功返回 null，失败返回原因 */
async function receive(expected: ParentCommand['type']): Promise<string | null> {
  const result = await nextCommand();

  if (!result.ok) {
    return result.reason;
  }

  if (result.command.type !== expected) {
    return `阶段不符：期望 ${expected}，收到 ${result.command.type}`;
  }

  return null;
}

async function main(): Promise<number> {
  const lockPath = process.argv[2];

  if (lockPath === undefined || lockPath === '') {
    send({ type: 'FAILED', message: 'missing-lock-path' });

    return 1;
  }

  // 屏障：先声明就绪，等父进程同时向所有竞争者发令，尽量让获取动作重叠
  send({ type: 'READY' });

  const goFailure = await receive('GO');

  if (goFailure !== null) {
    send({ type: 'FAILED', message: goFailure });

    return 1;
  }

  try {
    heldRelease = acquireExecutionLockAt(lockPath);
  } catch (error) {
    send({ type: 'FAILED', message: (error as Error).message });

    return 1;
  }

  // 回报真实落盘的 token：父进程据此断言「败者没有删掉胜者的锁」
  send({ type: 'ACQUIRED', token: readExecutionLockOwner(lockPath)?.token ?? 'unknown' });

  const releaseFailure = await receive('RELEASE');

  if (releaseFailure !== null) {
    // 协议违规（重复 GO / 未知消息 / 父侧断连）：先归还自有锁再失败关闭，
    // 绝不把临界区留给一个已与父进程失联的僵尸进程
    releaseHeldLock();
    send({ type: 'FAILED', message: releaseFailure });

    return 1;
  }

  releaseHeldLock();
  send({ type: 'RELEASED' });

  return 0;
}

// 兜底自尽：父进程异常退出（既不发令也不断开）时子进程不得悬挂。
//
// 刻意**不用 `unref()`**：该定时器必须真实持有句柄；正常路径由 `clearTimeout` 释放，
// 不会拖满 20 秒。自尽仅作为「父进程失联」的最后兜底。
const selfDestruct = setTimeout(() => {
  writeDiagnostic('FAILED:self-destruct-timeout');
  process.exit(3);
}, SELF_DESTRUCT_TIMEOUT_MS);

const exitCode = await main();

finished = true;
clearTimeout(selfDestruct);

if (disconnected) {
  // 带可诊断状态退出：父侧据退出码 4 与落盘诊断区分「断连收尾」与「协议失败」
  process.exitCode = 4;
  writeDiagnostic('DISCONNECTED');
} else {
  process.exitCode = exitCode;
}

// 断开 IPC 让事件循环自然收敛；已断开时不再调用（会抛 ERR_IPC_DISCONNECTED）
if (process.connected) {
  process.disconnect();
}
