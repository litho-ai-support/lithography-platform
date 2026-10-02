// e2e/helpers/execution-lock.ts
//
// 专用隔离库的跨进程执行锁（PR5 四次复查 P1 修复，五轮复查 P1 加固）。
//
// 不变量：
// 1. 任意时刻同一隔离库上只有一个进程持有锁；
// 2. 锁路径**永不为空**——发布与接管都只用「不清空目标路径」的原子调用，
//    因此不存在「A 已创建未写入 → B 读成 null → B 删锁抢锁」这类空锁窗口；
// 3. 任何进程都不得删除或搬走「不是自己建立、且未经原子确认已废弃」的锁。
//
// 相对最初内联在 `e2e-real/global-setup.ts` 的实现，三处加固：
//
// 1. 发布原子化：owner 载荷先完整写盘到暂存文件，再用 `linkSync` 原子发布
//    （O_EXCL 语义：目标已存在即 EEXIST，绝不覆盖）。
// 2. 接管改为「凭证目录 + 原子覆盖」，不再有 `renameSync` 把锁搬走后遗留空路径的窗口：
//    - 接管凭证目录 `lockPath.reclaim.<被观察到的废弃 token>` 以 `mkdirSync` 排他创建，
//      同一把废弃锁的接管者因此严格互斥（目录已存在即 EEXIST）；
//    - 抢到凭证后必须复核锁路径上**仍是**当初判定为废弃的那把锁（token CAS 复核），
//      token 已变说明它被别的进程重建，本次放弃并重新竞争；
//    - 复核通过才 `renameSync` **原子覆盖**锁路径（目标全程非空），
//      其他进程的 `linkSync` 发布必然 EEXIST，插不进任何空窗。
// 3. 释放带 token 且严格一次性：只删除 token 与本次获取一致的锁；释放函数只生效一次。
//
// 失败关闭策略：锁内容不可解析时、以及「另一进程正在接管同一把废弃锁」时**都不抢占**，
// 直接报错并给出路径交由人工确认。宁可人工介入，也不猜着删锁。

import { randomUUID } from 'node:crypto';
import {
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** 锁文件载荷：仅进程事实 + 归属 token，不含任何连接串或凭据 */
export interface ExecutionLockOwner {
  readonly pid: number;
  readonly startedAt: string;
  /** 每次获取都重新生成的随机归属标识；释放与接管均以它判定锁归属 */
  readonly token: string;
}

/** 竞争重试上限：一次「发布失败 → 复核发现锁已被重建」即消耗一次 */
const MAX_ACQUIRE_ATTEMPTS = 3;

/** 锁文件路径：以专用库名为键落在系统临时目录（跨仓库 / 跨 shell 均可见） */
export function resolveExecutionLockPath(dbName: string): string {
  const safeDbName = dbName.replace(/[^a-zA-Z0-9_.-]/g, '_');

  return path.join(tmpdir(), `lithography-e2e-${safeDbName}.lock`);
}

/** 读取锁持有者；文件不存在、内容不可解析或字段非法时返回 null */
export function readExecutionLockOwner(lockPath: string): ExecutionLockOwner | null {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      pid?: unknown;
      startedAt?: unknown;
      token?: unknown;
    };

    if (!Number.isSafeInteger(parsed.pid) || (parsed.pid as number) <= 0) {
      return null;
    }

    if (typeof parsed.token !== 'string' || parsed.token === '') {
      return null;
    }

    return {
      pid: parsed.pid as number,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '<未知>',
      token: parsed.token,
    };
  } catch {
    return null;
  }
}

/** pid 存活探测：ESRCH 表示进程已不存在；EPERM 说明进程存在但无权限发信号 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** 暂存路径：同一进程同一次获取内唯一，天然不与竞争者冲突 */
function resolveStagingPath(lockPath: string, owner: ExecutionLockOwner): string {
  return `${lockPath}.${owner.pid}.${owner.token}.staging`;
}

/**
 * 接管凭证目录：命名取自**被观察到的废弃锁 token**（而非接管者自身 token），
 * 这样针对同一把废弃锁的多个接管者会争抢同一个目录名，`mkdirSync` 天然排他。
 * token 来自锁文件内容（可能是人工写坏的任意字符串），拼接路径前必须消毒。
 */
function resolveReclaimPath(lockPath: string, observedToken: string): string {
  const safeToken = observedToken.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `${lockPath}.reclaim.${safeToken}`;
}

/** 原子发布：`linkSync` 以 O_EXCL 语义建立硬链接，目标已存在即 EEXIST，绝不覆盖 */
function publishAtomically(sourcePath: string, lockPath: string): boolean {
  try {
    linkSync(sourcePath, lockPath);

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }

    throw error;
  }
}

/** 排他创建接管凭证：已存在说明他人正在接管同一把废弃锁，返回 false */
function claimReclaim(claimPath: string): boolean {
  try {
    mkdirSync(claimPath);

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }

    throw error;
  }
}

/**
 * 删除文件：只把「本来就不存在」当作成功。
 *
 * EACCES / EPERM / EISDIR 等真实失败必须抛出——吞掉它们会把「锁其实没释放」变成
 * 静默假成功，下一次联调就会以「已有真实联调在执行」莫名失败。
 */
function removeFileIfExists(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/** 删除接管凭证目录（本进程创建、必为空）：同样只忽略 ENOENT */
function removeDirIfExists(dirPath: string): void {
  try {
    rmdirSync(dirPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function heldByMessage(lockPath: string, owner: ExecutionLockOwner): string {
  return (
    `该专用隔离库上已有真实联调在执行（pid=${owner.pid}, startedAt=${owner.startedAt}, token=${owner.token}）：` +
    '同一专用库禁止并发执行 Migration/Seed 与物理清理，请等待其结束；' +
    `若确认该进程已不存在，可手动删除锁文件 ${lockPath}`
  );
}

function unreadableLockMessage(lockPath: string): string {
  return (
    `锁文件 ${lockPath} 存在但内容不可解析：可能是并发进程正在发布，或历史 / 人工遗留文件。` +
    '本进程不会接管无法确认归属的锁，请确认后手动删除该文件再重试。'
  );
}

function reclaimBusyMessage(lockPath: string, claimPath: string): string {
  return (
    `检测到有另一个进程正在接管 ${lockPath} 上的废弃锁（接管凭证 ${claimPath} 已存在）：` +
    '同一专用库禁止并发执行 Migration/Seed 与物理清理，本次获取失败；' +
    '若确认已无进程在接管，可手动删除该凭证目录后重试。'
  );
}

/**
 * 生成严格一次性的释放函数：重复调用不再触碰锁路径。
 *
 * 「setup 失败时自行释放、teardown 又释放一次」这类组合下，第二次调用必须是无操作，
 * 否则可能删掉此后由别的进程建立的锁。
 */
function createRelease(lockPath: string, token: string): () => void {
  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    releaseExecutionLock(lockPath, token);
  };
}

/**
 * 在指定锁路径上获取执行锁。
 *
 * @returns 一次性释放函数。释放只在锁仍属于本次获取（token 一致）时才删除锁文件。
 */
export function acquireExecutionLockAt(lockPath: string): () => void {
  const owner: ExecutionLockOwner = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    token: randomUUID(),
  };
  const stagingPath = resolveStagingPath(lockPath, owner);

  // 载荷必须完整落盘后才发布，否则又会制造「已创建未写入」的空锁窗口
  writeFileSync(stagingPath, `${JSON.stringify(owner)}\n`);

  try {
    for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
      if (publishAtomically(stagingPath, lockPath)) {
        return createRelease(lockPath, owner.token);
      }

      const observed = readExecutionLockOwner(lockPath);

      if (observed === null) {
        // 不可解析：不抢占（见文件头「失败关闭策略」）
        throw new Error(unreadableLockMessage(lockPath));
      }

      if (isProcessAlive(observed.pid)) {
        throw new Error(heldByMessage(lockPath, observed));
      }

      // 判定为废弃锁：先以凭证目录排他，再原子覆盖，绝不按旧读取结果搬走或 unlink
      const claimPath = resolveReclaimPath(lockPath, observed.token);

      if (!claimReclaim(claimPath)) {
        throw new Error(reclaimBusyMessage(lockPath, claimPath));
      }

      try {
        // token CAS 复核：凭证只互斥「同一把废弃锁的接管者」，此处必须再确认锁路径上
        // 仍是那把已确认废弃的锁；token 变了说明锁已被别的进程重建，本次放弃。
        if (readExecutionLockOwner(lockPath)?.token !== observed.token) {
          continue;
        }

        // 原子覆盖（rename 覆盖目标，锁路径全程非空）：并发者的 linkSync 必然 EEXIST
        renameSync(stagingPath, lockPath);
      } finally {
        removeDirIfExists(claimPath);
      }

      return createRelease(lockPath, owner.token);
    }

    throw new Error(`获取专用隔离库执行锁失败（锁文件持续被占用）：${lockPath}`);
  } finally {
    removeFileIfExists(stagingPath);
  }
}

/** 按专用库名获取执行锁（global setup 的入口；锁文件路径已含库名，报错可直接定位） */
export function acquireExecutionLock(dbName: string): () => void {
  return acquireExecutionLockAt(resolveExecutionLockPath(dbName));
}

/** 释放：只在 token 一致（锁仍是本次获取建立的那把）时才删除 */
function releaseExecutionLock(lockPath: string, token: string): void {
  const owner = readExecutionLockOwner(lockPath);

  if (owner !== null && owner.token === token) {
    removeFileIfExists(lockPath);
  }
}
