// e2e/helpers/real-backend.spec.ts
// @vitest-environment node
// real-backend 白名单 helper 的单元测试（vitest 运行；Playwright 经 testIgnore 排除本文件）。
// node 环境：helper 内部依赖 import.meta.url 解析 env 文件路径，须在 node 环境下运行；
// 关键安全断言：非法 requestNo 必须在任何 SQL 组装/数据库进程启动之前被拒绝——
// expect 断言不是安全边界，finally 兜底清理路径同样只能走受保护 helper。

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteRepairRequestByRequestNo, findRepairRequestByRequestNo } from './real-backend';

const { execFileSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

// execFileSync（mysql 进程）与 readFileSync（后端 env 文件）替换为 mock：
// 本文件不访问真实数据库、不依赖本地 env 文件；保留其余具名导出避免破坏模块默认导出面。
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: execFileSyncMock,
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  readFileSync: readFileSyncMock,
}));

const VALID_REQUEST_NO = 'RR20260902000000AB12CD';

// 与 helper 内部调用形态对齐：从 execFileSync 入参中提取 -e 后的 SQL 字面量（取最近一次调用）
function executedSql(): string | undefined {
  const lastCallArgs = execFileSyncMock.mock.lastCall?.[1] as string[] | undefined;
  const flagIndex = lastCallArgs?.indexOf('-e') ?? -1;

  return flagIndex >= 0 ? lastCallArgs?.[flagIndex + 1] : undefined;
}

describe('real-backend 受保护 requestNo helper', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    readFileSyncMock.mockReturnValue(
      'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app\n',
    );
  });

  it('合法编号形成预期 SQL 调用（find / delete）', () => {
    expect(findRepairRequestByRequestNo(VALID_REQUEST_NO, 'id')).toBe('');

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(executedSql()).toBe(
      `SELECT id FROM repair_request WHERE request_no = '${VALID_REQUEST_NO}'`,
    );

    deleteRepairRequestByRequestNo(VALID_REQUEST_NO);

    expect(execFileSyncMock).toHaveBeenCalledTimes(2);
    expect(executedSql()).toBe(
      `DELETE FROM repair_request WHERE request_no = '${VALID_REQUEST_NO}'`,
    );
  });

  it.each([
    ['注入引号', `RR20260902000000AB12CD' OR '1'='1`],
    ['分号拼接', 'RR20260902000000AB12CD; DROP TABLE repair_request;--'],
    ['空白字符', ' RR20260902000000AB12CD'],
    ['非白名单任意内容', "page-text-undefined'"],
    ['小写前缀', 'rr20260902000000ab12cd'],
    ['长度不足', 'RR20260901AB12CD'],
  ])('非法 requestNo（%s）直接抛错且绝不启动 mysql 进程', (_label, invalidRequestNo) => {
    expect(() => findRepairRequestByRequestNo(invalidRequestNo, 'id')).toThrow('未通过白名单校验');
    expect(() => deleteRepairRequestByRequestNo(invalidRequestNo)).toThrow('未通过白名单校验');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });
});
