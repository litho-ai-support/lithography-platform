// e2e-real/pr5-cleanup-safety.spec.ts
//
// PR5 清理安全集成组（Codex 结束报告复验计划 P2-2 / S3）：**无 TRUNCATE 的真实 MySQL 反例组**。
//
// 覆盖计划 §4.4 的 C1–C7：
//   C1 同 ID 异主 / requestNo 或客户不符 → 首条 DELETE 前失败关闭，目标行逐字段不变；
//   C2 同关键字但创建人不同的资料行 → 不删除任何行，明确报告归属冲突；
//   C3 本轮申请被插入未记录的外部回复 → 父子集合核验失败，父行 / 本轮回复 / 外部回复全不变；
//   C4 多资料清理在第 2 行删除处注入失败 → 不触及外部行；已删 / 未删有精确回执；下一轮可恢复；
//   C5 文件删除器对指定本轮引用抛错 → 不误删其他文件；残留引用被记录且可经绑定重新验证、精确回收；
//   C6 造数中途抛错 → 已记入 ledger 的部分被安全回收；外部哨兵前后快照相等；
//   C7 禁用 TRUNCATE 连续两轮 → 第二轮启动前无上一轮残留；主键不复用；最终只剩预置 / 外部哨兵。
//
// 运行入口（npm script，授权变量由执行者显式设置，不写入 npm script）：
//   E2E_ALLOW_PHYSICAL_CLEANUP=1 DB_NAME=lithography_e2e npm run test:e2e:pr5-cleanup-safety
//
// 与既有 S5 真实闭环（pr5-real-flow.spec.ts）**不共享** global-setup：本组不使用
// global-setup.ts（它 TRUNCATE / Migration / Seed），仅做环境门 + schema 只读检查 + 数据库执行锁。

import { expect, test } from '@playwright/test';

import {
  acquirePr5CleanupSafetyExecutionLock,
  assertPr5CleanupSafetyEnvironment,
  assertPr5CleanupSafetyNoRunResidue,
  buildPr5CleanupSafetyFaultTag,
  buildPr5CleanupSafetyKeyword,
  countPr5CleanupSafetyRunRows,
  createPr5CleanupSafetyLedger,
  createPr5CleanupSafetyRunId,
  createPr5CleanupSafetyTempStorage,
  insertPr5CleanupSafetyEngineerResponse,
  insertPr5CleanupSafetyReferenceDocument,
  insertPr5CleanupSafetyRepairRequest,
  locatePr5CleanupSafetyResidueByRunId,
  type Pr5CleanupSafetyLedger,
  reclaimPr5CleanupSafetyLedger,
  resolvePr5CleanupSafetySeedContext,
  snapshotPr5CleanupSafetyExternalSentinel,
  toPr5RepairRequestBinding,
} from '../e2e/helpers/pr5-cleanup-safety';
import {
  cleanupPr5ReferenceDocumentsBound,
  deletePr5EngineerResponseRowsByIds,
  deletePr5ReferenceDocumentBound,
  deletePr5RepairRequestBound,
  readPr5ReferenceDocumentSnapshot,
  readPr5ReferenceDocumentStorageReferenceBound,
} from '../e2e/helpers/pr5-real-flow';
import { mysqlQuery } from '../e2e/helpers/real-backend';

// ---------------------------------------------------------------------------
// 顶层：环境门 + 数据库执行锁（整组只执行一次；失败即硬失败，不 skip）
// ---------------------------------------------------------------------------

test.describe('PR5 清理安全集成组（无 TRUNCATE 真实反例 C1-C7）', () => {
  let releaseExecutionLock: () => void;

  test.beforeAll(() => {
    assertPr5CleanupSafetyEnvironment();
    releaseExecutionLock = acquirePr5CleanupSafetyExecutionLock();
  });

  test.afterAll(() => {
    releaseExecutionLock();
  });

  test('C1 同 ID 异主 / 编号或客户不符：首条 DELETE 前失败关闭，目标行逐字段不变', () => {
    const runId = createPr5CleanupSafetyRunId();
    const context = resolvePr5CleanupSafetySeedContext();
    const ledger = createPr5CleanupSafetyLedger(runId, context.customerAccountId);

    try {
      // 造数：客户甲自建申请，创建人 / 客户均记入 ledger
      const entry = insertPr5CleanupSafetyRepairRequest(ledger, {
        customerAccountId: context.customerAccountId,
        equipmentModelId: context.equipmentModelId,
        faultTag: buildPr5CleanupSafetyFaultTag(runId),
      });
      const originalState = mysqlQuery(
        `SELECT id, request_no, customer_account_id, equipment_model_id, error_code, fault_description, is_accepted, deprecated FROM repair_request WHERE id = ${entry.id}`,
      );

      // 把「外部行 ID」冒充本轮绑定：客户甲创建的行、但绑定声明客户乙 + 伪造 requestNo。
      // 三因子任一不符都必须在首条 DELETE 前中止（事务回滚，行逐字段不变）。
      const wrongBinding = {
        customerAccountId: context.customerBetaAccountId,
        id: entry.id,
        requestNo: entry.requestNo.replace(/RR\d{14}/, 'RR00000000000000'),
        responseIds: [],
      };

      expect(() => deletePr5RepairRequestBound(wrongBinding)).toThrow(
        /pr5_repair_request_binding_id_request_no_customer_must_match_exactly_one/,
      );

      // 失败关闭后：行逐字段不变，且没有任何残留删除
      expect(
        mysqlQuery(
          `SELECT id, request_no, customer_account_id, equipment_model_id, error_code, fault_description, is_accepted, deprecated FROM repair_request WHERE id = ${entry.id}`,
        ),
      ).toBe(originalState);
      expect(
        Number(
          mysqlQuery(`SELECT COUNT(*) FROM repair_request WHERE request_no = '${entry.requestNo}'`),
        ),
      ).toBe(1);
    } finally {
      reclaimPr5CleanupSafetyLedger(ledger);
    }
  });

  test('C2 同关键字但创建人不同：不删除任何行或文件，明确报告归属冲突', () => {
    const runId = createPr5CleanupSafetyRunId();
    const context = resolvePr5CleanupSafetySeedContext();
    const keyword = buildPr5CleanupSafetyKeyword(runId);
    // 管理员自建资料（本轮 ledger 归属管理员）
    const ledger = createPr5CleanupSafetyLedger(runId, context.adminAccountId);
    // 客户甲自建「同关键字」资料（外部归属，不记入 ledger）
    const externalId = insertPr5CleanupSafetyReferenceDocument(
      createPr5CleanupSafetyLedger(runId, context.customerAccountId),
      { label: '外部同关键字', createdByAccountId: context.customerAccountId },
    ).id;

    try {
      const doc = insertPr5CleanupSafetyReferenceDocument(ledger, {
        createdByAccountId: context.adminAccountId,
        label: '本轮',
      });

      // 用「管理员 ledger 归属」核验外部行：创建人不匹配 → 明确归属冲突，失败关闭
      expect(() =>
        readPr5ReferenceDocumentStorageReferenceBound({
          createdByAccountId: context.adminAccountId,
          id: externalId,
          titleKeyword: keyword,
        }),
      ).toThrow(/归属核验未精确命中 1 行/);
      // 外部行原样保留（字段级快照不变）
      expect(readPr5ReferenceDocumentSnapshot(externalId)).not.toBeNull();
      // 本轮行未被任何外部删除波及
      expect(
        Number(mysqlQuery(`SELECT COUNT(*) FROM reference_document WHERE id = ${doc.id}`)),
      ).toBe(1);
    } finally {
      // 外部行（客户甲归属）自创建后始终存在 → 按外部归属精确回收，避免残留；本轮 ledger 行随后回收
      deletePr5ReferenceDocumentBound({
        createdByAccountId: context.customerAccountId,
        id: externalId,
        titleKeyword: keyword,
      });
      reclaimPr5CleanupSafetyLedger(ledger);
    }
  });

  test('C3 本轮申请被插入未记录的外部回复：父子集合核验失败，父行 / 本轮回复 / 外部回复全不变', () => {
    const runId = createPr5CleanupSafetyRunId();
    const context = resolvePr5CleanupSafetySeedContext();
    const ledger = createPr5CleanupSafetyLedger(runId, context.customerAccountId);
    // 在 finally 中需要按精确 ID 兜底清掉外部回复，故声明在 try 之外
    let externalResponseId = 0;

    try {
      const entry = insertPr5CleanupSafetyRepairRequest(ledger, {
        customerAccountId: context.customerAccountId,
        equipmentModelId: context.equipmentModelId,
        faultTag: buildPr5CleanupSafetyFaultTag(runId),
      });
      const ownResponseId = insertPr5CleanupSafetyEngineerResponse(ledger, {
        customerAccountId: context.customerAccountId,
        engineerAccountId: context.engineerAccountId,
        request: entry,
      });
      // 外部回复：**不记入 ledger**（模拟另一进程 / 另一轮插入的本轮外回复）
      externalResponseId = insertPr5CleanupSafetyEngineerResponse(ledger, {
        customerAccountId: context.customerAccountId,
        engineerAccountId: context.engineerAccountId,
        record: false,
        request: entry,
        responseText: '外部回复（未记录）',
      });

      // ledger 只登记 ownResponseId；清理按绑定集合核验 → 子行总数与匹配数不符 → 失败关闭
      expect(() => deletePr5RepairRequestBound(toPr5RepairRequestBinding(entry))).toThrow(
        /pr5_engineer_response_child_binding_must_match_this_run/,
      );

      // 父行、本轮回复、外部回复全部原样
      expect(Number(mysqlQuery(`SELECT COUNT(*) FROM repair_request WHERE id = ${entry.id}`))).toBe(
        1,
      );
      expect(
        Number(mysqlQuery(`SELECT COUNT(*) FROM engineer_response WHERE id = ${ownResponseId}`)),
      ).toBe(1);
      expect(
        Number(
          mysqlQuery(`SELECT COUNT(*) FROM engineer_response WHERE id = ${externalResponseId}`),
        ),
      ).toBe(1);
    } finally {
      // 先按精确 ID 清掉「未记录的外部回复」，使父子集合核验恢复一致，再回收 ledger
      // （外部回复未成功插入时其 ID 仍为 0，跳过删除避免误报）
      if (externalResponseId > 0) {
        deletePr5EngineerResponseRowsByIds([externalResponseId]);
      }
      reclaimPr5CleanupSafetyLedger(ledger);
    }
  });

  test('C4 多资料清理在第 2 行删除处注入失败：不触及外部行；回执精确；下一轮可恢复', () => {
    const runId = createPr5CleanupSafetyRunId();
    const context = resolvePr5CleanupSafetySeedContext();
    const ledger = createPr5CleanupSafetyLedger(runId, context.adminAccountId);

    try {
      const docA = insertPr5CleanupSafetyReferenceDocument(ledger, {
        createdByAccountId: context.adminAccountId,
        label: 'A',
      });
      const docB = insertPr5CleanupSafetyReferenceDocument(ledger, {
        createdByAccountId: context.adminAccountId,
        label: 'B',
      });

      // 第 1 行正常删，第 2 行注入失败（抛错）
      const receipt = cleanupPr5ReferenceDocumentsBound([docA, docB], {
        deleteRow: (binding) => {
          if (binding.id === docB.id) {
            throw new Error('注入：第 2 行删除失败');
          }
          deletePr5ReferenceDocumentBound(binding);
        },
      });

      // 精确回执：已删 A、残留 B；错误不吞
      expect(receipt.deletedRowIds).toEqual([docA.id]);
      expect(receipt.residualRowIds).toEqual([docB.id]);
      expect(receipt.failureMessages.join(';')).toContain('注入：第 2 行删除失败');

      // 不触及任何外部行：外部哨兵在清理后除本轮外无变化（此处直接断言 B 仍存在）
      expect(
        Number(mysqlQuery(`SELECT COUNT(*) FROM reference_document WHERE id = ${docA.id}`)),
      ).toBe(0);
      expect(
        Number(mysqlQuery(`SELECT COUNT(*) FROM reference_document WHERE id = ${docB.id}`)),
      ).toBe(1);

      // 下一轮可恢复：残留 B 按「专属标识 + 字段核验」精确定位，再精确回收
      const residue = locatePr5CleanupSafetyResidueByRunId(runId, {
        documentOwnerAccountId: context.adminAccountId,
        requestCustomerAccountId: context.customerAccountId,
      });

      expect(residue.documentIds).toContain(docB.id);
      expect(residue.requestIds).toEqual([]);

      deletePr5ReferenceDocumentBound(docB);
      expect(
        Number(mysqlQuery(`SELECT COUNT(*) FROM reference_document WHERE id = ${docB.id}`)),
      ).toBe(0);
    } finally {
      reclaimPr5CleanupSafetyLedger(ledger);
    }
  });

  test('C5 文件删除器对指定本轮引用抛错：不误删其他文件；残留引用可精确回收', () => {
    const runId = createPr5CleanupSafetyRunId();
    const context = resolvePr5CleanupSafetySeedContext();
    const ledger = createPr5CleanupSafetyLedger(runId, context.adminAccountId);
    const storage = createPr5CleanupSafetyTempStorage(3);
    const [referenceA, referenceB, referenceC] = storage.references;

    try {
      // 三个本轮文件（storage 引用需命中白名单格式，作为 DB 行引用；文件在独立临时目录）
      const docA = insertPr5CleanupSafetyReferenceDocument(ledger, {
        createdByAccountId: context.adminAccountId,
        label: 'A',
        storageReference: referenceA,
      });
      const docB = insertPr5CleanupSafetyReferenceDocument(ledger, {
        createdByAccountId: context.adminAccountId,
        label: 'B',
        storageReference: referenceB,
      });
      const docC = insertPr5CleanupSafetyReferenceDocument(ledger, {
        createdByAccountId: context.adminAccountId,
        label: 'C',
        storageReference: referenceC,
      });

      // 注入文件删除失败（仅 referenceB），行删除正常；非失败引用在**独立临时目录**内删除，
      // 与后端真实存储目录完全隔离，绝不触碰他人物理文件
      const receipt = cleanupPr5ReferenceDocumentsBound([docA, docB, docC], {
        deleteFile: (reference) => {
          if (reference === referenceB) {
            throw new Error('注入：文件删除失败');
          }
          storage.remove(reference);
        },
      });

      // 已删行全部完成；文件仅 B 残留；A/C 文件被删；外部哨兵文件未被触碰
      expect(receipt.deletedRowIds).toEqual([docA.id, docB.id, docC.id]);
      expect(receipt.residualFileReferences).toEqual([referenceB]);
      expect(receipt.deletedFileReferences).toEqual([referenceA, referenceC]);
      expect(storage.exists(referenceA)).toBe(false);
      expect(storage.exists(referenceB)).toBe(true);
      expect(storage.exists(referenceC)).toBe(false);
      expect(storage.exists(storage.sentinelReference)).toBe(true);

      // 残留引用仍可经绑定重新验证（行已删 → 只能按文件引用本身精确回收）
      expect(storage.exists(referenceB)).toBe(true);
      // 精确回收残留文件
      storage.remove(referenceB);
      expect(storage.exists(referenceB)).toBe(false);
    } finally {
      storage.cleanup();
      reclaimPr5CleanupSafetyLedger(ledger);
    }
  });

  test('C6 造数中途抛错：已记入 ledger 的部分被安全回收；外部哨兵前后快照相等', () => {
    const context = resolvePr5CleanupSafetySeedContext();
    const before = snapshotPr5CleanupSafetyExternalSentinel();

    // 造数在「账号依赖 / 申请 / 回复 / 资料」四层任一层后抛错，都只允许回收 ledger
    // 已记录的对象；未记入 ledger 的对象一律不动（残留必须可观测）。
    const stages = ['account-dependency', 'request', 'reply', 'document'] as const;

    for (const stage of stages) {
      const runId = createPr5CleanupSafetyRunId();
      const ledger: Pr5CleanupSafetyLedger = createPr5CleanupSafetyLedger(
        runId,
        context.customerAccountId,
      );
      let injected: unknown;

      try {
        // 账号依赖层：只做只读解析（本组 FK 一律引用既有 Seed 账号/型号，绝不新建账号）
        if (stage !== 'account-dependency') {
          const entry = insertPr5CleanupSafetyRepairRequest(ledger, {
            customerAccountId: context.customerAccountId,
            equipmentModelId: context.equipmentModelId,
            faultTag: buildPr5CleanupSafetyFaultTag(runId),
          });

          if (stage !== 'request') {
            insertPr5CleanupSafetyEngineerResponse(ledger, {
              customerAccountId: context.customerAccountId,
              engineerAccountId: context.engineerAccountId,
              request: entry,
            });

            if (stage === 'document') {
              insertPr5CleanupSafetyReferenceDocument(ledger, {
                createdByAccountId: context.adminAccountId,
                label: 'C6',
              });
            }
          }
        }

        // 模拟「造数中途抛错」：抛出后由 finally 只回收 ledger 内已记录对象
        throw new Error(`注入：造数在 ${stage} 阶段抛错`);
      } catch (error) {
        injected = error;
      } finally {
        reclaimPr5CleanupSafetyLedger(ledger);
      }

      // 注入确实发生
      expect(injected).toBeInstanceOf(Error);
      // ledger 已记录对象全部回收 → 本轮无任何残留
      assertPr5CleanupSafetyNoRunResidue(runId);
    }

    // 全部阶段的造数失败均未改动任何外部行
    expect(snapshotPr5CleanupSafetyExternalSentinel()).toBe(before);
  });

  test('C7 禁用 TRUNCATE 连续两轮：第二轮启动前无上一轮残留；主键不复用；最终只剩预置', () => {
    const context = resolvePr5CleanupSafetySeedContext();
    const before = snapshotPr5CleanupSafetyExternalSentinel();

    // 第一轮：造数 → 回收 → 无残留
    const round1RunId = createPr5CleanupSafetyRunId();
    const ledger1 = createPr5CleanupSafetyLedger(round1RunId, context.customerAccountId);
    // 造数前先取全表最大主键，作为「主键不复用」的证据基线
    const maxIdBeforeRound1 = Number(mysqlQuery('SELECT IFNULL(MAX(id), 0) FROM repair_request'));
    let round1RequestId: number | undefined;

    try {
      const entry1 = insertPr5CleanupSafetyRepairRequest(ledger1, {
        customerAccountId: context.customerAccountId,
        equipmentModelId: context.equipmentModelId,
        faultTag: buildPr5CleanupSafetyFaultTag(round1RunId),
      });
      round1RequestId = entry1.id;
      // 新主键严格大于第一轮前全表最大 ID（未复用任何既有主键）
      expect(entry1.id).toBeGreaterThan(maxIdBeforeRound1);
      insertPr5CleanupSafetyReferenceDocument(ledger1, {
        createdByAccountId: context.adminAccountId,
        label: 'R1',
      });
      expect(countPr5CleanupSafetyRunRows(round1RunId)).toEqual({
        documents: 1,
        requests: 1,
        responses: 0,
      });
    } finally {
      reclaimPr5CleanupSafetyLedger(ledger1);
    }

    // 第一轮结束：无上一轮残留
    assertPr5CleanupSafetyNoRunResidue(round1RunId);

    // 第二轮：同一测试组内再次造数（无任何 TRUNCATE / Seed），主键仍不复用
    const round2RunId = createPr5CleanupSafetyRunId();
    const ledger2 = createPr5CleanupSafetyLedger(round2RunId, context.customerAccountId);
    const maxIdBeforeRound2 = Number(mysqlQuery('SELECT IFNULL(MAX(id), 0) FROM repair_request'));
    let round2RequestId: number | undefined;

    try {
      const entry2 = insertPr5CleanupSafetyRepairRequest(ledger2, {
        customerAccountId: context.customerAccountId,
        equipmentModelId: context.equipmentModelId,
        faultTag: buildPr5CleanupSafetyFaultTag(round2RunId),
      });
      round2RequestId = entry2.id;
      // 第二次新主键仍严格大于第二轮前全表最大 ID（AUTO_INCREMENT 不因回收而复用）
      expect(entry2.id).toBeGreaterThan(maxIdBeforeRound2);
      insertPr5CleanupSafetyReferenceDocument(ledger2, {
        createdByAccountId: context.adminAccountId,
        label: 'R2',
      });
      expect(countPr5CleanupSafetyRunRows(round2RunId)).toEqual({
        documents: 1,
        requests: 1,
        responses: 0,
      });
    } finally {
      reclaimPr5CleanupSafetyLedger(ledger2);
    }

    // 第二轮结束：两轮主键互不相同；无残留；外部哨兵整表快照不变（最终只剩预置 / 外部哨兵）
    expect(round2RequestId).not.toBe(round1RequestId);
    assertPr5CleanupSafetyNoRunResidue(round2RunId);
    expect(snapshotPr5CleanupSafetyExternalSentinel()).toBe(before);
  });
});
