// e2e/helpers/real-backend.spec.ts
// @vitest-environment node
// real-backend 白名单 helper 的单元测试（vitest 运行；Playwright 经 testIgnore 排除本文件）。
// node 环境：helper 内部依赖 import.meta.url 解析 env 文件路径，须在 node 环境下运行；
// 关键安全断言：非法 requestNo 必须在任何 SQL 组装/数据库进程启动之前被拒绝——
// expect 断言不是安全边界，finally 兜底清理路径同样只能走受保护 helper。

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertPhysicalCleanupAllowed,
  cleanupE2ERepairRequest,
  deleteE2EReferenceDocumentRowsByIds,
  deleteE2EReferenceDocumentStorageFilesByIds,
  deleteRepairRequestRowsByIds,
  findRepairRequestByRequestNo,
  hasFrontendGraphQLEndpoint,
  mysqlQuery,
  readBackendEnv,
  type RepairRequestCleanupTarget,
} from './real-backend';

const { execFileSyncMock, existsSyncMock, readFileSyncMock, rmSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  rmSyncMock: vi.fn(),
}));

// execFileSync（mysql 进程）与 readFileSync（后端 env 文件）替换为 mock：
// 本文件不访问真实数据库、不依赖本地 env 文件；保留其余具名导出避免破坏模块默认导出面。
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: execFileSyncMock,
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  rmSync: rmSyncMock,
}));

const VALID_REQUEST_NO = 'RR20260902000000AB12CD';

// 与 helper 内部调用形态对齐：从 execFileSync 入参中提取 -e 后的 SQL 字面量（取最近一次调用）
function executedSql(): string | undefined {
  const lastCallArgs = execFileSyncMock.mock.lastCall?.[1] as string[] | undefined;
  const flagIndex = lastCallArgs?.indexOf('-e') ?? -1;

  return flagIndex >= 0 ? lastCallArgs?.[flagIndex + 1] : undefined;
}

// 同上，取全部调用：物理清理在一个 mysql 进程内跑完整事务脚本，据此可断言「单次调用」
function executedSqls(): string[] {
  return execFileSyncMock.mock.calls.map((call) => {
    const args = call[1] as string[];
    const flagIndex = args.indexOf('-e');

    return args[flagIndex + 1] as string;
  });
}

describe('real-backend 受保护 requestNo helper', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    readFileSyncMock.mockReturnValue(
      'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app\n',
    );
  });

  it('合法编号形成预期 SELECT 调用（清理路径已收口到统一安全入口，不再有按编号 DELETE）', () => {
    expect(findRepairRequestByRequestNo(VALID_REQUEST_NO, 'id')).toBe('');

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(executedSql()).toBe(
      `SELECT id FROM repair_request WHERE request_no = '${VALID_REQUEST_NO}'`,
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

describe('real-backend 维修申请按精确 ID 物理清理（本轮收口新增 helper）', () => {
  const OPT_IN_ENV = 'E2E_ALLOW_PHYSICAL_CLEANUP';
  const originalOptIn = process.env[OPT_IN_ENV];
  const TEST_DB_ENV =
    'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=lithography_e2e\n';
  const REQUEST_NO_A = 'RR20260902000000AB12CD';
  const REQUEST_NO_B = 'RR20260902000001CD34EF';

  // 本轮预期事实由测试自身掌握；不得用「从目标行反读回来的值」充当预期（否则核验自证）
  const VALID_TARGET: RepairRequestCleanupTarget = {
    id: 920006,
    expected: {
      requestNo: REQUEST_NO_A,
      customerAccountId: 9001,
      errorCode: 'E2E-REAL',
      equipmentModelId: 8101,
    },
  };
  const SECOND_TARGET: RepairRequestCleanupTarget = {
    id: 920007,
    expected: {
      requestNo: REQUEST_NO_B,
      customerAccountId: 9001,
      errorCode: 'E2E-REAL',
      equipmentModelId: 8101,
    },
  };

  function targetWith(
    id: number,
    expected: Partial<RepairRequestCleanupTarget['expected']> = {},
  ): RepairRequestCleanupTarget {
    return { id, expected: { ...VALID_TARGET.expected, ...expected } };
  }

  /** CLI 回读的核验诊断行（helper 逐项复查后才允许声称清理成功） */
  function cleanupDiagnostics(overrides: Record<string, string> = {}, expectedRows = 1): string {
    const fields: Record<string, string> = {
      database: 'lithography_e2e',
      expected_rows: String(expectedRows),
      existing_rows: String(expectedRows),
      field_mismatch_rows: '0',
      child_rows: '0',
      residue_rows: '0',
      ...overrides,
    };

    return Object.entries(fields)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
  }

  // helper 每次调用起一个 mysql 进程；同一进程 = 同一连接 = 同一事务
  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    readFileSyncMock.mockReset().mockReturnValue(TEST_DB_ENV);
    delete process.env[OPT_IN_ENV];
  });

  afterAll(() => {
    if (originalOptIn === undefined) {
      delete process.env[OPT_IN_ENV];
    } else {
      process.env[OPT_IN_ENV] = originalOptIn;
    }
  });

  it('空目标列表是 no-op，不启动 mysql 进程', () => {
    expect(() => deleteRepairRequestRowsByIds([])).not.toThrow();
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    '非法 ID（%p）直接抛错且绝不启动 mysql 进程',
    (invalidId) => {
      process.env[OPT_IN_ENV] = '1';

      expect(() => deleteRepairRequestRowsByIds([targetWith(invalidId)])).toThrow(
        '未通过正整数校验',
      );
      expect(execFileSyncMock).not.toHaveBeenCalled();
    },
  );

  it('同一批出现重复 ID 时整批拒绝，不启动 mysql 进程', () => {
    process.env[OPT_IN_ENV] = '1';

    expect(() => deleteRepairRequestRowsByIds([VALID_TARGET, VALID_TARGET])).toThrow(
      '物理清理目标 ID 重复',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<RepairRequestCleanupTarget['expected']>, string]>([
    [
      '申请编号注入引号',
      { requestNo: `${REQUEST_NO_A}' OR '1'='1` },
      '预期申请编号未通过白名单校验',
    ],
    ['申请编号小写形态', { requestNo: REQUEST_NO_A.toLowerCase() }, '预期申请编号未通过白名单校验'],
    ['客户账号非正整数', { customerAccountId: 0 }, '预期客户账号未通过正整数校验'],
    [
      '故障码注入引号',
      { errorCode: "E2E'; DROP TABLE repair_request;--" },
      '预期故障码未通过白名单校验',
    ],
    ['设备型号非正整数', { equipmentModelId: -1 }, '预期设备型号未通过正整数校验'],
  ])('目标事实非法（%s）在任何 SQL 组装/数据库进程之前被拒绝', (_label, broken, message) => {
    process.env[OPT_IN_ENV] = '1';

    expect(() => deleteRepairRequestRowsByIds([targetWith(920006, broken)])).toThrow(message);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('无显式授权（缺 E2E_ALLOW_PHYSICAL_CLEANUP=1）物理清理被拒绝且 mysql 进程未被调用', () => {
    expect(() => deleteRepairRequestRowsByIds([VALID_TARGET])).toThrow(
      '缺少 E2E_ALLOW_PHYSICAL_CLEANUP=1',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([
    ['共享开发库 lithography_drill', 'lithography_drill', '不属于测试库命名'],
    ['非测试库 app', 'app', '不属于测试库命名'],
    ['其他测试库 lithography_platform_e2e', 'lithography_platform_e2e', '不是专用隔离库'],
  ])('opt-in 但 DB_NAME=%s 时失败关闭且 mysql 进程未被调用', (_label, dbName, message) => {
    process.env[OPT_IN_ENV] = '1';
    readFileSyncMock.mockReturnValue(
      `DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=${dbName}\n`,
    );

    expect(() => deleteRepairRequestRowsByIds([VALID_TARGET])).toThrow(message);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('通过核验时：单次 mysql 调用（同一连接同一事务）只删本轮精确 ID，提交前核验残留为零', () => {
    process.env[OPT_IN_ENV] = '1';
    execFileSyncMock.mockReturnValue(cleanupDiagnostics());

    expect(() => deleteRepairRequestRowsByIds([VALID_TARGET])).not.toThrow();

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);

    const sql = executedSqls()[0] as string;

    expect(sql).toContain('START TRANSACTION');
    expect(sql.match(/\bCOMMIT\b/g)).toHaveLength(1);
    // 连接内自查实际 DATABASE()，并 FOR UPDATE 锁定目标行后才核对
    expect(sql).toContain("(DATABASE() <> 'lithography_e2e')");
    expect(sql).toContain('FOR UPDATE');
    // 守卫表以 CHECK 约束强制「核验不达标即中止批处理」
    expect(sql.toLowerCase()).toContain('check (violations = 0)');

    // DELETE 语句只按本轮精确 ID：不按编号/前缀/行数匹配
    expect(
      sql.split(';\n').filter((statement) => statement.includes('DELETE FROM repair_request')),
    ).toEqual(['DELETE FROM repair_request WHERE id IN (920006)']);
    expect(sql).not.toContain('LIKE');
    expect(sql).not.toContain('920007');

    // 顺序：核验门（库名/行数/字段/子记录）→ DELETE → 残留门 → COMMIT
    const verificationIndex = sql.indexOf('INSERT INTO e2e_repair_request_cleanup_guard');
    const deleteIndex = sql.indexOf('DELETE FROM repair_request');
    const residueIndex = sql.indexOf("SELECT CONCAT('residue_rows='");
    const residueGuardIndex = sql.lastIndexOf('INSERT INTO e2e_repair_request_cleanup_guard');
    const commitIndex = sql.indexOf('COMMIT');

    expect(verificationIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(verificationIndex);
    expect(residueIndex).toBeGreaterThan(deleteIndex);
    expect(residueGuardIndex).toBeGreaterThan(residueIndex);
    expect(commitIndex).toBeGreaterThan(residueGuardIndex);
  });

  it('多 ID 全部通过核验时同一次调用内删除，且只包含本轮精确 ID', () => {
    process.env[OPT_IN_ENV] = '1';
    execFileSyncMock.mockReturnValue(cleanupDiagnostics({}, 2));

    expect(() => deleteRepairRequestRowsByIds([VALID_TARGET, SECOND_TARGET])).not.toThrow();

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);

    const sql = executedSqls()[0] as string;

    expect(sql).toContain('DELETE FROM repair_request WHERE id IN (920006,920007)');
    expect(sql).not.toContain('920008');
  });

  it.each([
    ['实际 DATABASE() 不是专用隔离库', { database: 'lithography_drill' }, 'database'],
    ['目标行不存在（existing_rows 与期望不符）', { existing_rows: '0' }, 'existing_rows'],
    ['目标字段与本轮预期事实不匹配', { field_mismatch_rows: '1' }, 'field_mismatch_rows'],
    ['存在阻碍删除的子记录引用', { child_rows: '1' }, 'child_rows'],
    ['删除后仍残留目标行', { residue_rows: '1' }, 'residue_rows'],
  ])('核验诊断不达标（%s）即抛错，且核验门始终在 DELETE 之前', (_label, overrides, key) => {
    process.env[OPT_IN_ENV] = '1';
    execFileSyncMock.mockReturnValue(cleanupDiagnostics(overrides));

    expect(() => deleteRepairRequestRowsByIds([VALID_TARGET])).toThrow(key);

    const sql = executedSqls()[0] as string;

    expect(sql.indexOf('INSERT INTO e2e_repair_request_cleanup_guard')).toBeLessThan(
      sql.indexOf('DELETE FROM repair_request'),
    );
  });

  it('拿不到或读不懂核验诊断时同样失败关闭（不把未知当成功）', () => {
    process.env[OPT_IN_ENV] = '1';
    execFileSyncMock.mockReturnValue('');

    expect(() => deleteRepairRequestRowsByIds([VALID_TARGET])).toThrow('维修申请物理清理核验失败');
  });

  it('多 ID 批中任一条核验失败：CLI 中止整批（单次进程、未提交即回滚）并失败关闭', () => {
    process.env[OPT_IN_ENV] = '1';
    const aborted = Object.assign(new Error('Command failed: mysql'), {
      stderr:
        "ERROR 3819 (HY000) at line 5: Check constraint 'e2e_repair_request_cleanup_must_be_zero' is violated.",
      stdout: [
        `920006\t${REQUEST_NO_A}\t9001\t8101\tE2E-REAL`,
        `920007\t${REQUEST_NO_B}\t9001\t8101\tE2E-REAL`,
        cleanupDiagnostics({ child_rows: '1' }, 2),
      ].join('\n'),
    });

    execFileSyncMock.mockImplementation(() => {
      throw aborted;
    });

    let thrown: Error | null = null;

    try {
      deleteRepairRequestRowsByIds([VALID_TARGET, SECOND_TARGET]);
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown?.message).toContain('维修申请物理清理事务中止（已回滚，未执行删除）');
    expect(thrown?.message).toContain('child_rows=1');
    // 整批在同一个 mysql 进程（同一连接同一事务）内完成，不拆成多次独立调用
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    // 密码只经 MYSQL_PWD 注入：既不在进程参数列表，也不进入错误文本与异常链
    expect((execFileSyncMock.mock.calls[0]?.[1] as string[]).join(' ')).not.toContain('secret');
    expect(thrown?.message).not.toContain('secret');
    expect(String(thrown?.cause)).not.toContain('secret');
  });
});

describe('real-backend 统一清理入口 cleanupE2ERepairRequest（创建 / 管理 spec 共用）', () => {
  const OPT_IN_ENV = 'E2E_ALLOW_PHYSICAL_CLEANUP';
  const originalOptIn = process.env[OPT_IN_ENV];
  const CLEANUP_REQUEST_NO = 'RR20260902000009EF56GH';
  const CLEANUP_ERROR_CODE = 'E2E-REAL';
  const DEDICATED_ENV = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_USER: 'root',
    DB_PASS: 'secret',
    DB_NAME: 'lithography_e2e',
  };
  const SHARED_ENV = { ...DEDICATED_ENV, DB_NAME: 'lithography_drill' };
  const SHARED_DB_FILE =
    'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=lithography_drill\n';
  const DEDICATED_DB_FILE =
    'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=lithography_e2e\n';
  const SOFT_DELETE_OK = {
    data: { deleteMyRepairRequest: { id: 920006, requestNo: CLEANUP_REQUEST_NO } },
  };

  const fetchMock = vi.fn();

  /** 真实通道 stub：登录换取 token，软删 mutation 返回指定结果 */
  function stubGraphqlFetch(deleteResult: unknown): void {
    fetchMock.mockImplementation(async (_url: string, init: { body?: string }) => {
      const payload = JSON.parse(init.body ?? '{}') as { query?: string };
      const body = payload.query?.includes('login(input:')
        ? { data: { login: { accessToken: 'e2e-token', accountId: 9001 } } }
        : deleteResult;

      return { json: async () => body, status: 200 };
    });
  }

  const cleanupOptions = {
    requestNo: CLEANUP_REQUEST_NO,
    customerAccountId: 9001,
    errorCode: CLEANUP_ERROR_CODE,
  };

  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    readFileSyncMock.mockReset().mockReturnValue(DEDICATED_DB_FILE);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env[OPT_IN_ENV];
  });

  afterAll(() => {
    vi.unstubAllGlobals();

    if (originalOptIn === undefined) {
      delete process.env[OPT_IN_ENV];
    } else {
      process.env[OPT_IN_ENV] = originalOptIn;
    }
  });

  it('非法申请编号在任何数据库 / 网络访问之前被拒绝', async () => {
    await expect(
      cleanupE2ERepairRequest({
        ...cleanupOptions,
        env: DEDICATED_ENV,
        requestNo: `${CLEANUP_REQUEST_NO}' OR '1'='1`,
      }),
    ).rejects.toThrow('未通过白名单校验');

    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-5', '1.5'])('按编号解析出的 ID（%s）非法时拒绝清理', async (rawId) => {
    execFileSyncMock.mockReturnValue(rawId);

    await expect(
      cleanupE2ERepairRequest({ ...cleanupOptions, env: DEDICATED_ENV }),
    ).rejects.toThrow('自建维修申请 ID 解析失败');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('自建行已不存在时是 no-op（幂等）：不发软删请求、不物理清理', async () => {
    process.env[OPT_IN_ENV] = '1';
    execFileSyncMock.mockReturnValue('');

    await expect(
      cleanupE2ERepairRequest({ ...cleanupOptions, env: DEDICATED_ENV }),
    ).resolves.toBeUndefined();

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('共享开发库 lithography_drill：即使显式授权也只走软删，不进入物理删除', async () => {
    process.env[OPT_IN_ENV] = '1';
    execFileSyncMock.mockReturnValue('920006');
    readFileSyncMock.mockReturnValue(SHARED_DB_FILE);
    stubGraphqlFetch(SOFT_DELETE_OK);

    await expect(
      cleanupE2ERepairRequest({ ...cleanupOptions, env: SHARED_ENV }),
    ).resolves.toBeUndefined();

    // 只有一次 mysql 进程（按编号解析 ID 的 SELECT），没有 DELETE / 事务脚本
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(executedSqls().join('\n')).not.toContain('DELETE');
  });

  it('专用隔离库但无显式授权：同样只软删，不物理删除', async () => {
    execFileSyncMock.mockReturnValue('920006');
    stubGraphqlFetch(SOFT_DELETE_OK);

    await expect(
      cleanupE2ERepairRequest({ ...cleanupOptions, env: DEDICATED_ENV }),
    ).resolves.toBeUndefined();

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(executedSqls().join('\n')).not.toContain('DELETE');
  });

  it('软删返回 GraphQL 错误时抛错，不声称清理完成、不进入物理删除', async () => {
    process.env[OPT_IN_ENV] = '1';
    execFileSyncMock.mockReturnValue('920006');
    stubGraphqlFetch({ errors: [{ message: 'forbidden' }] });

    await expect(
      cleanupE2ERepairRequest({ ...cleanupOptions, env: DEDICATED_ENV }),
    ).rejects.toThrow('软删失败，拒绝声称清理完成');
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it('专用隔离库 + 显式授权：先软删，再按精确 ID 走受保护物理清理', async () => {
    process.env[OPT_IN_ENV] = '1';
    execFileSyncMock
      .mockReset()
      .mockReturnValueOnce('920006')
      .mockReturnValue(
        'database=lithography_e2e expected_rows=1 existing_rows=1 field_mismatch_rows=0 child_rows=0 residue_rows=0',
      );
    stubGraphqlFetch(SOFT_DELETE_OK);

    await expect(
      cleanupE2ERepairRequest({ ...cleanupOptions, env: DEDICATED_ENV }),
    ).resolves.toBeUndefined();

    const sqls = executedSqls();

    expect(sqls).toHaveLength(2);
    expect(sqls[0]).toBe(
      `SELECT id FROM repair_request WHERE request_no = '${CLEANUP_REQUEST_NO}'`,
    );
    expect(sqls[1]).toContain('DELETE FROM repair_request WHERE id IN (920006)');
    expect(sqls[1]).toContain("(DATABASE() <> 'lithography_e2e')");
  });
});

describe('真实 E2E 清理路径统一收口（不再有仅凭编号的直接删除入口）', () => {
  const CLEANUP_CALL_SITES = [
    'repair-request-create.spec.ts',
    'repair-request-manage-real.spec.ts',
  ] as const;

  // 本文件 mock 了 node:fs，读仓库源码必须取真实实现
  async function readSource(relativePath: string): Promise<string> {
    const { readFileSync: readRealFileSync } =
      await vi.importActual<typeof import('node:fs')>('node:fs');

    return readRealFileSync(new URL(relativePath, import.meta.url), 'utf-8');
  }

  it.each(CLEANUP_CALL_SITES)('%s 只经统一安全入口清理，不再有按编号删除', async (specFile) => {
    const source = await readSource(`../${specFile}`);

    expect(source).toContain('cleanupE2ERepairRequest');
    expect(source).not.toContain('deleteRepairRequestByRequestNo');
    expect(source).not.toMatch(/DELETE\s+FROM\s+repair_request/i);
  });

  it('helper 自身不再导出按编号删除入口，维修申请 DELETE 只在受保护事务脚本内按 ID 精确执行', async () => {
    const source = await readSource('./real-backend.ts');

    expect(source).not.toMatch(/export\s+(async\s+)?function\s+deleteRepairRequestByRequestNo/);
    expect(source).toMatch(/DELETE FROM repair_request WHERE \$\{idPredicate\}/);
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

describe('real-backend 存储物理文件清理（0909 第二轮：按精确引用路径，不扫描批量删）', () => {
  const VALID_REFERENCE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf';

  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    existsSyncMock.mockReset().mockReturnValue(false);
    rmSyncMock.mockReset();
    readFileSyncMock
      .mockReset()
      .mockReturnValue(
        'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app\n',
      );
  });

  it('空 ID 列表是 no-op，不启动 mysql 进程', () => {
    expect(() => deleteE2EReferenceDocumentStorageFilesByIds([])).not.toThrow();
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])('非安全正整数 ID（%p）直接抛错且不访问数据库', (invalidId) => {
    expect(() => deleteE2EReferenceDocumentStorageFilesByIds([invalidId])).toThrow(
      '未通过正整数校验',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('合法引用：仅删除存储目录内解析后的精确路径，并带格式白名单校验', () => {
    execFileSyncMock.mockReturnValue(VALID_REFERENCE);
    existsSyncMock.mockReturnValue(true);

    deleteE2EReferenceDocumentStorageFilesByIds([970100]);

    // 先按精确 ID 查引用（SELECT），再删除解析后的唯一文件
    expect(executedSql()).toBe(
      "SELECT IFNULL(storage_reference, '') FROM reference_document WHERE id = 970100",
    );
    expect(rmSyncMock).toHaveBeenCalledTimes(1);

    const removedPath = rmSyncMock.mock.calls[0]?.[0] as string;

    expect(removedPath).toContain('var/reference-documents');
    expect(removedPath.endsWith(VALID_REFERENCE)).toBe(true);
    expect(removedPath).not.toContain('..');
  });

  it.each([
    ['路径穿越', '../../../etc/passwd'],
    ['非白名单格式', 'short-name.pdf'],
    ['目录拼接引用', `${VALID_REFERENCE}/../../evil.pdf`],
  ])('白名单外引用（%s）拒绝删除物理文件', (_label, reference) => {
    execFileSyncMock.mockReturnValue(reference);

    deleteE2EReferenceDocumentStorageFilesByIds([970100]);

    expect(rmSyncMock).not.toHaveBeenCalled();
  });

  it('无存储引用的行（纯文本资料）安全跳过', () => {
    execFileSyncMock.mockReturnValue('');

    deleteE2EReferenceDocumentStorageFilesByIds([970005]);

    expect(rmSyncMock).not.toHaveBeenCalled();
  });
});

describe('real-backend 数据库连接键运行时覆盖（R3：不改 .env 切换独立测试库）', () => {
  const DB_ENV_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME'] as const;
  const FILE_ENV =
    'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app\nOTHER_KEY=file-value\n';
  const originalValues: Partial<Record<(typeof DB_ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    readFileSyncMock.mockReset().mockReturnValue(FILE_ENV);
    for (const key of DB_ENV_KEYS) {
      originalValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of DB_ENV_KEYS) {
      if (originalValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValues[key];
      }
    }
  });

  it('无运行时覆盖时保持文件值', () => {
    expect(readBackendEnv()).toMatchObject({
      DB_HOST: '127.0.0.1',
      DB_PORT: '3306',
      DB_USER: 'root',
      DB_PASS: 'secret',
      DB_NAME: 'app',
      OTHER_KEY: 'file-value',
    });
  });

  it('DB_NAME=lithography_e2e 运行时覆盖生效', () => {
    process.env.DB_NAME = 'lithography_e2e';

    expect(readBackendEnv().DB_NAME).toBe('lithography_e2e');
  });

  it.each([[''], ['   '], ['\t']])('空白 DB_NAME 覆盖值（%p）不覆盖文件值', (blank) => {
    process.env.DB_NAME = blank;

    expect(readBackendEnv().DB_NAME).toBe('app');
  });

  it('mysqlQuery 与安全门使用同一个覆盖后的 DB_NAME（覆盖前拒绝、覆盖后放行且 SQL 连同一库）', () => {
    const optInKey = 'E2E_ALLOW_PHYSICAL_CLEANUP';
    const originalOptIn = process.env[optInKey];

    process.env[optInKey] = '1';
    try {
      // 未覆盖时：文件库名 app 不是测试库命名，安全门拒绝
      expect(() => assertPhysicalCleanupAllowed(readBackendEnv())).toThrow('不属于测试库命名');

      process.env.DB_NAME = 'lithography_e2e';

      // 覆盖后：安全门放行，且 mysqlQuery 实际连接的库名与安全门读到的是同一个值
      expect(() => assertPhysicalCleanupAllowed(readBackendEnv())).not.toThrow();
      mysqlQuery('SELECT 1');

      const args = execFileSyncMock.mock.lastCall?.[1] as string[];

      expect(args).toContain('lithography_e2e');
      expect(readBackendEnv().DB_NAME).toBe('lithography_e2e');
    } finally {
      if (originalOptIn === undefined) {
        delete process.env[optInKey];
      } else {
        process.env[optInKey] = originalOptIn;
      }
    }
  });

  it('非 DB 连接键不接受运行时覆盖（其他环境变量读取行为不变）', () => {
    process.env.OTHER_KEY = 'runtime-should-be-ignored';

    expect(readBackendEnv().OTHER_KEY).toBe('file-value');
  });
});
