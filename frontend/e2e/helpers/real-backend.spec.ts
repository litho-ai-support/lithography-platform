// e2e/helpers/real-backend.spec.ts
// @vitest-environment node
// real-backend 白名单 helper 的单元测试（vitest 运行；Playwright 经 testIgnore 排除本文件）。
// node 环境：helper 内部依赖 import.meta.url 解析 env 文件路径，须在 node 环境下运行；
// 关键安全断言：非法 requestNo 必须在任何 SQL 组装/数据库进程启动之前被拒绝——
// expect 断言不是安全边界，finally 兜底清理路径同样只能走受保护 helper。

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertPhysicalCleanupAllowed,
  deleteE2EReferenceDocumentRowsByIds,
  deleteRepairRequestByRequestNo,
  findRepairRequestByRequestNo,
  hasFrontendGraphQLEndpoint,
} from './real-backend';

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

describe('real-backend 参考资料物理清理安全门（负责人 0909 阻塞项 1）', () => {
  const OPT_IN_ENV = 'E2E_ALLOW_PHYSICAL_CLEANUP';
  const originalOptIn = process.env[OPT_IN_ENV];

  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    delete process.env[OPT_IN_ENV];
  });

  afterAll(() => {
    if (originalOptIn === undefined) {
      delete process.env[OPT_IN_ENV];
    } else {
      process.env[OPT_IN_ENV] = originalOptIn;
    }
  });

  it('空 ID 列表是 no-op，不启动 mysql 进程', () => {
    expect(() => deleteE2EReferenceDocumentRowsByIds([])).not.toThrow();
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    '非安全正整数 ID（%p）直接抛错且绝不启动 mysql 进程',
    (invalidId) => {
      expect(() => deleteE2EReferenceDocumentRowsByIds([invalidId])).toThrow('未通过正整数校验');
      expect(execFileSyncMock).not.toHaveBeenCalled();
    },
  );

  it('共享开发库（无 opt-in）物理清理被拒绝且 mysql 进程未被调用', () => {
    expect(() => deleteE2EReferenceDocumentRowsByIds([970100])).toThrow(
      '缺少 E2E_ALLOW_PHYSICAL_CLEANUP=1',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('opt-in 但库名非测试库命名（app）物理清理被拒绝且 mysql 进程未被调用', () => {
    process.env[OPT_IN_ENV] = '1';

    expect(() => deleteE2EReferenceDocumentRowsByIds([970100])).toThrow('不属于测试库命名');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('安全门函数独立可校验：非测试库命名抛错（不触碰数据库）', () => {
    process.env[OPT_IN_ENV] = '1';

    expect(() => assertPhysicalCleanupAllowed({ DB_NAME: 'lithography_platform' })).toThrow(
      '不属于测试库命名',
    );
    expect(() => assertPhysicalCleanupAllowed({})).toThrow('不属于测试库命名');
    expect(() =>
      assertPhysicalCleanupAllowed({ DB_NAME: 'lithography_platform_e2e' }),
    ).not.toThrow();
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('opt-in + 测试库命名：SQL 仅包含传入的精确 ID，绝不按标题前缀批量匹配', () => {
    process.env[OPT_IN_ENV] = '1';
    readFileSyncMock.mockReturnValue(
      'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app_e2e\n',
    );

    deleteE2EReferenceDocumentRowsByIds([970100, 970101]);

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(executedSql()).toBe('DELETE FROM reference_document WHERE id IN (970100,970101)');
  });

  it('并行运行模拟：清理运行 A 的精确 ID 时，运行 B 同前缀资料的 ID 不出现在 SQL 中', () => {
    process.env[OPT_IN_ENV] = '1';
    readFileSyncMock.mockReturnValue(
      'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app_e2e\n',
    );

    // 运行 A 的目标列表只含 A 自建行 970100；运行 B 的 970200 同前缀但不传人
    deleteE2EReferenceDocumentRowsByIds([970100]);

    const sql = executedSql() ?? '';

    expect(sql).toBe('DELETE FROM reference_document WHERE id IN (970100)');
    expect(sql).not.toContain('970200');
    expect(sql).not.toContain('LIKE');
  });
});

describe('real-backend 前端真实通道探测（负责人 0909 必须修复 3）', () => {
  function mockFiles(options: { localEnv: string | null; viteConfig: string | null }): void {
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.includes('.env.development.local')) {
        if (options.localEnv === null) {
          throw new Error(`ENOENT: ${path}`);
        }

        return options.localEnv;
      }

      if (path.includes('vite.config')) {
        if (options.viteConfig === null) {
          throw new Error(`ENOENT: ${path}`);
        }

        return options.viteConfig;
      }

      return 'DB_NAME=app\n';
    });
  }

  it('本地 env 缺失但 vite proxy 存在 /graphql → true（不短路）', () => {
    mockFiles({
      localEnv: null,
      viteConfig: "proxy: { '/graphql': { target: 'http://127.0.0.1:3000' } }",
    });

    expect(hasFrontendGraphQLEndpoint()).toBe(true);
  });

  it('本地 env 有 VITE_GRAPHQL_ENDPOINT 但 vite proxy 缺失 → true', () => {
    mockFiles({
      localEnv: 'VITE_GRAPHQL_ENDPOINT=http://127.0.0.1:3000/graphql\n',
      viteConfig: 'export default {}',
    });

    expect(hasFrontendGraphQLEndpoint()).toBe(true);
  });

  it('两者都不存在 → false', () => {
    mockFiles({ localEnv: 'OTHER_KEY=1\n', viteConfig: 'export default {}' });

    expect(hasFrontendGraphQLEndpoint()).toBe(false);
  });

  it('本地 env 读取抛错不能掩盖 vite proxy 通道；vite 读取抛错不能掩盖直连通道', () => {
    mockFiles({ localEnv: null, viteConfig: null });

    expect(hasFrontendGraphQLEndpoint()).toBe(false);

    mockFiles({
      localEnv: 'VITE_GRAPHQL_ENDPOINT=http://127.0.0.1:3000/graphql\n',
      viteConfig: null,
    });

    expect(hasFrontendGraphQLEndpoint()).toBe(true);
  });
});
