// e2e/helpers/pr5-real-flow.spec.ts
// @vitest-environment node
// PR5 helper 的负例单测（vitest 运行；Playwright 的专用配置只收集 e2e-real 下的真实用例）。
//
// 覆盖目标（对齐 S5 评审 P3-2）：
// 1. 非法参数必须在**任何 SQL 组装/数据库进程启动之前**被拒绝（expect 断言不是安全边界）；
// 2. 归属绑定必须「三因子齐全 + 子行集合精确」，缺任一因子或扩大到父 ID 无差别删除都要变红
//    ——故此处以生成 SQL 的结构断言作为变异探针（改/删任一绑定因子即失配）；
// 3. 失败关闭路径（绑定不唯一、引用非法）必须抛错，绝不静默跳过删除。

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertPr5GeneratedId,
  buildPr5DocKeyword,
  countPr5ReferenceDocumentsByTitlePrefix,
  deletePr5ReferenceDocumentBound,
  deletePr5RepairRequestBound,
  findPr5ReferenceDocumentIdsByKeyword,
  PR5_DOC_KEYWORD_PATTERN,
  readPr5PrimaryKeySnapshot,
  readPr5ReferenceDocumentDeprecatedById,
  readPr5ReferenceDocumentSnapshot,
  readPr5ReferenceDocumentStorageReferenceBound,
  readPr5RepairRequestState,
} from './pr5-real-flow';

const { execFileSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

// mysql 进程与后端 env 文件替换为 mock：本文件不访问真实数据库、不依赖本地 env 文件
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: execFileSyncMock,
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  readFileSync: readFileSyncMock,
}));

const OPT_IN_ENV = 'E2E_ALLOW_PHYSICAL_CLEANUP';
const originalOptIn = process.env[OPT_IN_ENV];
const originalBackendOrigin = process.env.E2E_BACKEND_ORIGIN;

const VALID_REQUEST_NO = 'RR20260902000000AB12CD';
const VALID_KEYWORD = buildPr5DocKeyword('abcdefgh');
const VALID_REFERENCE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf';

/** 取最近一次 mysql 调用的 SQL 字面量 */
function executedSql(): string {
  const lastCallArgs = execFileSyncMock.mock.lastCall?.[1] as string[] | undefined;
  const flagIndex = lastCallArgs?.indexOf('-e') ?? -1;

  return (flagIndex >= 0 ? lastCallArgs?.[flagIndex + 1] : undefined) ?? '';
}

describe('pr5-real-flow 参数白名单（非法参数绝不启动 mysql 进程）', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    readFileSyncMock
      .mockReset()
      .mockReturnValue(
        'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app_e2e\n',
      );
    // 安全门与代号一致性门全部放行：让「非法参数」成为唯一可能的失败原因
    process.env[OPT_IN_ENV] = '1';
    delete process.env.E2E_BACKEND_ORIGIN;
  });

  afterAll(() => {
    if (originalOptIn === undefined) {
      delete process.env[OPT_IN_ENV];
    } else {
      process.env[OPT_IN_ENV] = originalOptIn;
    }

    if (originalBackendOrigin === undefined) {
      delete process.env.E2E_BACKEND_ORIGIN;
    } else {
      process.env.E2E_BACKEND_ORIGIN = originalBackendOrigin;
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    '维修申请清理：非法 ID（%p）直接抛错',
    (invalidId) => {
      expect(() =>
        deletePr5RepairRequestBound({
          customerAccountId: 2,
          id: invalidId,
          requestNo: VALID_REQUEST_NO,
          responseIds: [],
        }),
      ).toThrow('未通过正整数校验');
      expect(execFileSyncMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['注入引号', `RR20260902000000AB12CD' OR '1'='1`],
    ['分号拼接', 'RR20260902000000AB12CD; DROP TABLE repair_request;--'],
    ['大写前缀以外的任意内容', 'NOT-A-REQUEST-NO'],
  ])('维修申请清理：非法编号（%s）直接抛错', (_label, invalidRequestNo) => {
    expect(() =>
      deletePr5RepairRequestBound({
        customerAccountId: 2,
        id: 1,
        requestNo: invalidRequestNo,
        responseIds: [],
      }),
    ).toThrow('未通过白名单校验');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([0, -3, 2.5])('维修申请清理：非法客户账号（%p）直接抛错', (invalidAccountId) => {
    expect(() =>
      deletePr5RepairRequestBound({
        customerAccountId: invalidAccountId,
        id: 1,
        requestNo: VALID_REQUEST_NO,
        responseIds: [],
      }),
    ).toThrow('未通过正整数校验');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([0, -3, 4.5])('维修申请清理：非法回复 ID（%p）直接抛错', (invalidResponseId) => {
    expect(() =>
      deletePr5RepairRequestBound({
        customerAccountId: 2,
        id: 1,
        requestNo: VALID_REQUEST_NO,
        responseIds: [invalidResponseId],
      }),
    ).toThrow('未通过正整数校验');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([
    ['关键词含 LIKE 通配符', 'PR5真实链路验收行·abc%def'],
    ['关键词含引号', "PR5真实链路验收行·abc'def"],
    ['关键词缺前缀', 'abcdefgh'],
    ['关键词以中文括号收尾（越权前缀专用形态）', 'PR5真实链路验收行·abcdefgh（'],
  ])('资料清理：非法标题关键字（%s）直接抛错', (_label, invalidKeyword) => {
    const binding = { createdByAccountId: 2, id: 1, titleKeyword: invalidKeyword };

    expect(() => deletePr5ReferenceDocumentBound(binding)).toThrow('未通过白名单校验');
    expect(() => readPr5ReferenceDocumentStorageReferenceBound(binding)).toThrow(
      '未通过白名单校验',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([0, -3, 1.5])('资料清理：非法创建人账号（%p）直接抛错', (invalidAccountId) => {
    expect(() =>
      deletePr5ReferenceDocumentBound({
        createdByAccountId: invalidAccountId,
        id: 1,
        titleKeyword: VALID_KEYWORD,
      }),
    ).toThrow('未通过正整数校验');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([
    ['关键词直接拼 LIKE 通配符 %', `${VALID_KEYWORD}%`],
    ['关键词含下划线 _', `${VALID_KEYWORD}_x`],
    ['关键词含单引号', `${VALID_KEYWORD}' OR '1'='1`],
    ['关键词含反斜杠', `${VALID_KEYWORD}\\`],
    ['关键词含空白', `${VALID_KEYWORD} x`],
  ])('资料反查：非法关键字（%s）直接抛错', (_label, invalidKeyword) => {
    expect(() => findPr5ReferenceDocumentIdsByKeyword(invalidKeyword)).toThrow('未通过白名单校验');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([1.5, 0, -1])('资料快照：非法 ID（%p）直接抛错', (invalidId) => {
    expect(() => readPr5ReferenceDocumentSnapshot(invalidId)).toThrow('未通过正整数校验');
    expect(() => readPr5ReferenceDocumentDeprecatedById(invalidId)).toThrow('未通过正整数校验');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it.each([1.5, 0])('维修申请状态读取：非法客户账号（%p）直接抛错', (invalidAccountId) => {
    expect(() => readPr5RepairRequestState(VALID_REQUEST_NO, invalidAccountId)).toThrow(
      '未通过正整数校验',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('维修申请状态读取：非法编号直接抛错', () => {
    expect(() => readPr5RepairRequestState("RR20260902000000AB12C'", 2)).toThrow(
      '未通过白名单校验',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('主键快照：非白名单表名直接抛错', () => {
    expect(() =>
      readPr5PrimaryKeySnapshot('base_user_account' as unknown as 'repair_request'),
    ).toThrow('未通过白名单校验');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });
});

describe('deletePr5RepairRequestBound 子行集合精确绑定（P1-3）', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    readFileSyncMock
      .mockReset()
      .mockReturnValue(
        'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app_e2e\n',
      );
    process.env[OPT_IN_ENV] = '1';
  });

  it('SQL 同时携带父行三因子与子行集合断言（删/改任一因子即失配）', () => {
    deletePr5RepairRequestBound({
      customerAccountId: 42,
      id: 970100,
      requestNo: VALID_REQUEST_NO,
      responseIds: [11, 22],
    });

    const sql = executedSql();

    // 父行三因子：id + request_no + customer_account_id
    expect(sql).toContain(
      `FROM repair_request WHERE id = 970100 AND request_no = '${VALID_REQUEST_NO}' AND customer_account_id = 42`,
    );
    expect(sql).toContain(
      'pr5_repair_request_binding_id_request_no_customer_must_match_exactly_one',
    );
    // 子行集合：总数与实际回复集合都必须精确等于本轮 responseIds
    expect(sql).toContain(
      'SET @pr5_rr_child_total = (SELECT COUNT(*) FROM engineer_response WHERE request_id = 970100)',
    );
    expect(sql).toContain(
      'SET @pr5_rr_child_matched = (SELECT COUNT(*) FROM engineer_response WHERE request_id = 970100 AND id IN (11, 22))',
    );
    expect(sql).toContain(
      "IF(@pr5_rr_child_total = 2 AND @pr5_rr_child_matched = 2, 'SELECT 1', 'SELECT pr5_engineer_response_child_binding_must_match_this_run')",
    );
    // 子行删除必须带 request_id + 精确 ID 集合，绝不按父 ID 无差别删除
    expect(sql).toContain(
      'DELETE FROM engineer_response WHERE request_id = 970100 AND id IN (11, 22)',
    );
    expect(sql).not.toContain('DELETE FROM engineer_response WHERE request_id = 970100;');
    // 残留核对为 0 后才提交
    expect(sql).toContain('pr5_repair_request_residue_must_be_zero');
    expect(sql).toContain('COMMIT');
  });

  it('无回复时以 IN (0) 占位，等价于「本轮允许的回复集合为空」', () => {
    deletePr5RepairRequestBound({
      customerAccountId: 42,
      id: 970100,
      requestNo: VALID_REQUEST_NO,
      responseIds: [],
    });

    const sql = executedSql();

    expect(sql).toContain('AND id IN (0))');
    expect(sql).toContain("IF(@pr5_rr_child_total = 0 AND @pr5_rr_child_matched = 0, 'SELECT 1'");
  });

  it('绑定断言失败（哨兵）会让 mysql 客户端在 DELETE 之前报错退出：异常必须上抛', () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error(
        'ERROR 1054 (42S22): Unknown column pr5_engineer_response_child_binding_must_match_this_run',
      );
    });

    expect(() =>
      deletePr5RepairRequestBound({
        customerAccountId: 42,
        id: 970100,
        requestNo: VALID_REQUEST_NO,
        responseIds: [11],
      }),
    ).toThrow('pr5_engineer_response_child_binding_must_match_this_run');
  });
});

describe('readPr5RepairRequestState 客户绑定（D4-3）', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
    readFileSyncMock
      .mockReset()
      .mockReturnValue(
        'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app_e2e\n',
      );
    process.env[OPT_IN_ENV] = '1';
  });

  it('只读 SQL 按编号 + 客户双重绑定（与清理路径口径一致）', () => {
    execFileSyncMock.mockReturnValue('1\t0\t0');

    const state = readPr5RepairRequestState(VALID_REQUEST_NO, 42);

    expect(executedSql()).toBe(
      `SELECT is_accepted, deprecated, deleted_at IS NOT NULL FROM repair_request WHERE request_no = '${VALID_REQUEST_NO}' AND customer_account_id = 42`,
    );
    expect(state).toEqual({ deletedAtIsNotNull: '0', deprecated: '0', isAccepted: '1' });
  });

  it('列数异常时抛错，不返回半残结果', () => {
    execFileSyncMock.mockReturnValue('1\t0');

    expect(() => readPr5RepairRequestState(VALID_REQUEST_NO, 42)).toThrow('读取结果异常');
  });
});

describe('参考资料归属核验与精确引用（P1-2 / D4-1）', () => {
  const validBinding = { createdByAccountId: 7, id: 970100, titleKeyword: VALID_KEYWORD };

  beforeEach(() => {
    execFileSyncMock.mockReset().mockReturnValue('');
    readFileSyncMock
      .mockReset()
      .mockReturnValue(
        'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app_e2e\n',
      );
    process.env[OPT_IN_ENV] = '1';
  });

  it('核验 SQL 同时携带 id + 创建人 + 标题关键字（缺任一因子即失配）', () => {
    execFileSyncMock.mockReturnValue(`1|${VALID_REFERENCE}`);

    expect(readPr5ReferenceDocumentStorageReferenceBound(validBinding)).toBe(VALID_REFERENCE);
    expect(executedSql()).toBe(
      `SELECT CONCAT(COUNT(*), '|', IFNULL(MAX(storage_reference), '')) FROM reference_document WHERE id = 970100 AND created_by_account_id = 7 AND title LIKE '%${VALID_KEYWORD}%'`,
    );
  });

  it.each([['0'], ['2'], ['abc']])('绑定未精确命中 1 行（%s）时失败关闭', (boundCount) => {
    execFileSyncMock.mockReturnValue(`${boundCount}|${VALID_REFERENCE}`);

    expect(() => readPr5ReferenceDocumentStorageReferenceBound(validBinding)).toThrow(
      '归属核验未精确命中 1 行',
    );
  });

  it.each([[''], ['NULL']])('无存储引用（%p）返回 null，不误删文件', (emptyReference) => {
    execFileSyncMock.mockReturnValue(`1|${emptyReference}`);

    expect(readPr5ReferenceDocumentStorageReferenceBound(validBinding)).toBeNull();
  });

  it.each([
    ['路径穿越', '../../../etc/passwd'],
    ['非白名单格式', 'short-name.pdf'],
  ])('白名单外引用（%s）拒绝返回，绝不落到删除路径', (_label, reference) => {
    execFileSyncMock.mockReturnValue(`1|${reference}`);

    expect(() => readPr5ReferenceDocumentStorageReferenceBound(validBinding)).toThrow(
      '未通过白名单校验',
    );
  });

  it('读取结果缺列异常时抛错（不把解析异常当成「无引用」放行）', () => {
    execFileSyncMock.mockReturnValue('1');

    expect(() => readPr5ReferenceDocumentStorageReferenceBound(validBinding)).toThrow(
      '读取结果异常',
    );
  });

  it('反查兜底不按 deprecated 过滤（软删行同样属于本轮自建行，必须可回收）', () => {
    execFileSyncMock.mockReturnValue('970100\n970101');

    expect(findPr5ReferenceDocumentIdsByKeyword(VALID_KEYWORD)).toEqual([970100, 970101]);
    expect(executedSql()).toBe(
      `SELECT id FROM reference_document WHERE title LIKE '%${VALID_KEYWORD}%'`,
    );
    expect(executedSql()).not.toContain('deprecated');
  });

  it('反查结果过滤非法数值，不把 NaN 带入后续删除路径', () => {
    execFileSyncMock.mockReturnValue('970100\n\nabc\n-1\n970101');

    expect(findPr5ReferenceDocumentIdsByKeyword(VALID_KEYWORD)).toEqual([970100, 970101]);
  });

  it('越权前缀计数走白名单函数，SQL 使用前缀 LIKE 且不含关键字通配符', () => {
    execFileSyncMock.mockReturnValue('0');

    const prefix = `${VALID_KEYWORD}（工程师越权`;

    expect(countPr5ReferenceDocumentsByTitlePrefix(prefix)).toBe(0);
    expect(executedSql()).toBe(
      `SELECT COUNT(*) FROM reference_document WHERE title LIKE '${prefix}%'`,
    );
  });

  it.each([
    [`${VALID_KEYWORD}（工程师越权%`],
    [`${VALID_KEYWORD}（越权_`],
    [`${VALID_KEYWORD}（引号'`],
  ])('越权前缀计数：白名单外前缀（%s）直接抛错', (invalidPrefix) => {
    expect(() => countPr5ReferenceDocumentsByTitlePrefix(invalidPrefix)).toThrow(
      '未通过白名单校验',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('删除 SQL 携带三因子绑定断言 + 残留核对 + COMMIT', () => {
    deletePr5ReferenceDocumentBound(validBinding);

    const sql = executedSql();

    expect(sql).toContain(
      `FROM reference_document WHERE id = 970100 AND created_by_account_id = 7 AND title LIKE '%${VALID_KEYWORD}%'`,
    );
    expect(sql).toContain(
      'pr5_reference_document_binding_id_creator_keyword_must_match_exactly_one',
    );
    expect(sql).toContain('pr5_reference_document_residue_must_be_zero');
    expect(sql).toContain('COMMIT');
  });

  it('快照读取使用静态列白名单（不拼接外部输入）', () => {
    execFileSyncMock.mockReturnValue('t\t1\t2\td\tc\tf\tm\t0');

    expect(readPr5ReferenceDocumentSnapshot(970100)).toBe('t\t1\t2\td\tc\tf\tm\t0');
    expect(executedSql()).toBe(
      'SELECT title, document_type, equipment_model_id, description, content_text, original_filename, mime_type, deprecated FROM reference_document WHERE id = 970100',
    );
  });
});

describe('主键快照与「DB 生成 ID」证据', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
    readFileSyncMock
      .mockReset()
      .mockReturnValue(
        'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=root\nDB_PASS=secret\nDB_NAME=app_e2e\n',
      );
    process.env[OPT_IN_ENV] = '1';
  });

  it('快照解析正整数集合；命中快照即证明「复用了既有主键」并抛错', () => {
    execFileSyncMock.mockReturnValue('970001\n970002\n');

    const snapshot = readPr5PrimaryKeySnapshot('reference_document');

    expect(snapshot).toEqual(new Set([970001, 970002]));
    expect(() => assertPr5GeneratedId(970001, snapshot, '本轮资料')).toThrow('复用了既有主键');
    expect(() => assertPr5GeneratedId(970100, snapshot, '本轮资料')).not.toThrow();
  });

  it('快照含非法数值时抛错，不静默丢弃', () => {
    execFileSyncMock.mockReturnValue('970001\nnot-a-number\n');

    expect(() => readPr5PrimaryKeySnapshot('repair_request')).toThrow('主键快照解析异常');
  });

  it('本轮 ID 未通过正整数校验时抛错', () => {
    expect(() => assertPr5GeneratedId(0, new Set<number>(), '本轮资料')).toThrow(
      '未通过正整数校验',
    );
  });
});

describe('运行级关键字形态', () => {
  it('buildPr5DocKeyword 产出的关键字必须过白名单', () => {
    expect(PR5_DOC_KEYWORD_PATTERN.test(buildPr5DocKeyword('abcdefgh'))).toBe(true);
    expect(buildPr5DocKeyword('abcdefgh')).toBe('PR5真实链路验收行·abcdefgh');
  });
});
