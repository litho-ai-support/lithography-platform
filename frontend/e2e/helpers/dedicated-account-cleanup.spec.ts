// e2e/helpers/dedicated-account-cleanup.spec.ts
// @vitest-environment node
// 专用账号物理清理 helper 的单元测试（R2 修正轮第 4 项；vitest 运行，Playwright 经
// testIgnore 排除 helpers 目录）。node 环境：helper 内部依赖 import.meta.url 解析
// env 文件路径，须在 node 环境下运行。
// 关键安全断言：非安全正整数 ID、缺少 opt-in、库名授权不等值都必须在任何 SQL 组装/
// 数据库进程启动之前被拒绝；放行时 SQL 只含本次账号 ID 的精确删除且子表在前。

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteE2EDedicatedAccountById,
  preflightDedicatedAccountCleanup,
  readDedicatedAccountCleanupResidue,
} from './dedicated-account-cleanup';

const { execFileSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: execFileSyncMock,
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  readFileSync: readFileSyncMock,
}));

const OPT_IN_ENV = 'E2E_ALLOW_PHYSICAL_CLEANUP';

/** 从 execFileSync 入参中提取 -e 后的 SQL 字面量（取最近一次调用） */
function executedSql(): string | undefined {
  const lastCallArgs = execFileSyncMock.mock.lastCall?.[1] as string[] | undefined;
  const flagIndex = lastCallArgs?.indexOf('-e') ?? -1;

  return flagIndex >= 0 ? lastCallArgs?.[flagIndex + 1] : undefined;
}

describe('real-backend 专用账号物理清理（R2 修正轮第 4 项）', () => {
  const originalOptIn = process.env[OPT_IN_ENV];

  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    readFileSyncMock
      .mockReset()
      .mockReturnValue(
        'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app_e2e\n',
      );
    delete process.env[OPT_IN_ENV];
  });

  afterAll(() => {
    if (originalOptIn === undefined) {
      delete process.env[OPT_IN_ENV];
    } else {
      process.env[OPT_IN_ENV] = originalOptIn;
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    '非安全正整数账号 ID（%p）直接抛错且绝不启动 mysql 进程',
    (invalidId) => {
      expect(() => deleteE2EDedicatedAccountById(invalidId)).toThrow('未通过正整数校验');
      expect(execFileSyncMock).not.toHaveBeenCalled();
    },
  );

  it('缺少 opt-in 时物理清理被拒绝且 mysql 进程未被调用', () => {
    expect(() => deleteE2EDedicatedAccountById(970100)).toThrow(
      '缺少 E2E_ALLOW_PHYSICAL_CLEANUP=1',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('opt-in 但目标库不是 e2e/test 时在连接前被拒绝', () => {
    process.env[OPT_IN_ENV] = '1';
    readFileSyncMock.mockReturnValue('DB_NAME=app\n');

    expect(() => preflightDedicatedAccountCleanup()).toThrow('不属于测试库命名');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('opt-in + e2e 目标库：一个事务内按子表到主表精确 DELETE 并在 COMMIT 前核对残留', () => {
    process.env[OPT_IN_ENV] = '1';

    deleteE2EDedicatedAccountById(970100);

    const sql = executedSql() ?? '';
    expect(sql).toContain('START TRANSACTION');
    expect(sql.indexOf('DELETE FROM engineer_response')).toBeLessThan(
      sql.indexOf('DELETE FROM base_user_account'),
    );
    expect(sql).toContain('SET ');
    expect(sql).toContain('PREPARE dedicated_cleanup_check');
    expect(sql).toContain('COMMIT');
  });

  it('残留核对分别返回主记录、userInfo 孤儿和关联业务表数量', () => {
    execFileSyncMock.mockReturnValue('0\n0\n0');

    expect(readDedicatedAccountCleanupResidue(970100)).toEqual({
      account: 0,
      relatedBusiness: 0,
      userInfo: 0,
    });
  });

  // 防回退（R3 真实改密轮 ERROR 1064）：第三条业务表残留统计必须是**一条完整** SELECT，
  // 加法项之间绝不允许被分号截断；前两条单值 SELECT 仍保持独立语句。
  it('残留核对 SQL 防回退：不含 `+;` 截断、恰为 3 条完整 SELECT、第三条含全部业务表计数', () => {
    execFileSyncMock.mockReturnValue('0\n0\n0');

    readDedicatedAccountCleanupResidue(970100);

    const sql = executedSql() ?? '';

    // 加法表达式不得被分号截断（`+;` 及其任意空白变体均拒绝）
    expect(sql).not.toMatch(/\+\s*;/);

    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement.startsWith('SELECT')).toBe(true);
    }

    // 第三条是连续加法，同时覆盖全部 6 张业务表
    const thirdStatement = statements[2];
    expect(thirdStatement).toContain('FROM engineer_response');
    expect(thirdStatement).toContain('FROM ai_message');
    expect(thirdStatement).toContain('FROM ai_report');
    expect(thirdStatement).toContain('FROM ai_conversation');
    expect(thirdStatement).toContain('FROM repair_request');
    expect(thirdStatement).toContain('FROM reference_document');
    expect((thirdStatement.match(/\+\s*\(/g) ?? []).length).toBe(5);
  });
});
