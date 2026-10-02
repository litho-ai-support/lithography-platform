// e2e/helpers/pr5-cleanup-safety.spec.ts
// @vitest-environment node

/**
 * 清理安全组执行锁释放会话的生命周期单测（Codex 复验计划 P2-3 / S3）。
 *
 * 守住的不变量：`beforeAll` 在**获取锁之前**失败（环境门 / schema / 连接 / 获取锁本身抛错）时，
 * `afterAll` 的释放不得调用未初始化函数、不得产生二次异常覆盖根因；获取成功后用例失败时，
 * 释放必须且只能执行一次（幂等）。这四条路径与 `e2e-real/pr5-cleanup-safety.spec.ts` 的
 * 顶层 `beforeAll/afterAll` 一一对应（那里用同一会话，无需真实数据库即可验证逻辑）。
 */

import { describe, expect, it, vi } from 'vitest';

import { createPr5CleanupSafetyLockSession } from './pr5-cleanup-safety';

describe('清理安全组执行锁释放会话的生命周期', () => {
  it('环境门失败（从未登记释放函数）：release 为空操作，releaseCount=0，不抛异常', () => {
    const session = createPr5CleanupSafetyLockSession();

    // 对应 beforeAll 在 assertPr5CleanupSafetyEnvironment() 阶段失败，从未 setRelease
    expect(() => session.release()).not.toThrow();
    expect(session.releaseCount).toBe(0);
  });

  it('获取锁失败（抛错，未登记）：release 为空操作，根因不被二次异常覆盖', () => {
    const session = createPr5CleanupSafetyLockSession();
    const rootCause = new Error('环境门失败：专用库 schema 不完整');
    let captured: unknown;

    try {
      // 模拟 acquirePr5CleanupSafetyExecutionLock() 抛错：setRelease 从未执行
      throw rootCause;
    } catch (error) {
      captured = error;
    }

    // afterAll 仍会调用 release，但不得产生二次异常顶掉根因
    expect(() => session.release()).not.toThrow();
    expect(captured).toBe(rootCause);
    expect(session.releaseCount).toBe(0);
  });

  it('获取成功后用例失败：release 恰好执行一次，releaseCount=1', () => {
    const session = createPr5CleanupSafetyLockSession();
    const release = vi.fn();
    session.setRelease(release);

    session.release();

    expect(release).toHaveBeenCalledTimes(1);
    expect(session.releaseCount).toBe(1);
  });

  it('重复释放是幂等的：第二次为空操作，releaseCount 仍为 1，无二次异常', () => {
    const session = createPr5CleanupSafetyLockSession();
    const release = vi.fn();
    session.setRelease(release);

    session.release();
    expect(() => session.release()).not.toThrow();

    expect(release).toHaveBeenCalledTimes(1);
    expect(session.releaseCount).toBe(1);
  });
});
