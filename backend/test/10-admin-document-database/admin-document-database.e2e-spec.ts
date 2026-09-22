// test/10-admin-document-database/admin-document-database.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { AiConversationEntity } from '@src/modules/lithography/entities/ai-conversation.entity';
import { AiMessageEntity } from '@src/modules/lithography/entities/ai-message.entity';
import { AiReportEntity } from '@src/modules/lithography/entities/ai-report.entity';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';

import { AccountStatus } from '@app-types/models/account.types';
import { AiConversationStatus, AiMessageRole } from '@app-types/models/ai-conversation.types';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { DataSource, In } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { getAccountIdByLoginName, login, postGql } from '../utils/e2e-graphql-utils';
import { assertDataSourceOnAllowedE2eDatabase } from '../utils/e2e-db-guard';
import { seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';
import {
  cleanupAdminDocumentFixture,
  runAdminDocFixtureTeardown,
} from './admin-document-database-fixture';

/**
 * PR3 S4：管理员文档数据库只读聚合 E2E（真实 MySQL + 真实 GraphQL 链路）。
 *
 * 覆盖计划表 S4.3/S4.7 的接口层回归：
 * - 角色矩阵：SUPER_ADMIN 成功；ENGINEER / CUSTOMER FORBIDDEN；匿名 UNAUTHENTICATED；
 * - 软删除默认过滤与真实 total（比对 total 与列表长度）；
 * - 100 轮会话 200 条消息按 messageSeq ASC 的分页稳定顺序读取；
 * - M-04 权威口径：报告 requestNo 以会话归属申请为准 + requestMismatch 审计标记；
 * - 空筛选结果为正式空页（items 空、total 0），不报错。
 */
describe('AdminDocumentDatabase (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let engineerToken: string;
  let customerToken: string;
  let engineerAccountId: number;
  let customerAccountId: number;
  /** R1：仅当 beforeAll 在「写夹具之前」完成白名单验证才置位，afterAll 据此决定能否清理。 */
  let fixtureTargetValidated = false;

  const REQUEST_NO_A = 'E2E-ADM-211';
  const CONVERSATION_A = 301;
  const TOTAL_MESSAGES = 200; // 100 轮 × 每轮 USER + ASSISTANT

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);

    await app.init();

    // 🔒 首次删除夹具之前，复用与 global-setup 同一不可跳过的目标库白名单守卫：
    //    即使有人用 E2E_SKIP_INFRA_CHECKS / E2E_SKIP_DB_CLEANUP 绕过了全局清理校验，
    //    本 spec 也绝不会在未验证（非隔离 E2E 库）的数据库上执行 DELETE。
    await assertDataSourceOnAllowedE2eDatabase(dataSource);

    // R1：守卫通过后才允许清理（写夹具之前置位）；守卫拒绝 / 半途失败时
    // afterAll 只关闭 app，不会在未授权目标上 DELETE。
    fixtureTargetValidated = true;

    // 造数前精确回收同名夹具（保证连跑两遍幂等），不整表删除业务数据
    await cleanupAdminDocumentFixture(dataSource);

    await seedTestAccounts({
      dataSource,
      createAccountUsecase: app.get(CreateAccountUsecase),
      includeKeys: ['staff', 'guestPrimary', 'admin'],
    });
    adminToken = await login({
      app,
      loginName: testAccountsConfig.admin.loginName,
      loginPassword: testAccountsConfig.admin.loginPassword,
    });
    engineerToken = await login({
      app,
      loginName: testAccountsConfig.staff.loginName,
      loginPassword: testAccountsConfig.staff.loginPassword,
    });
    customerToken = await login({
      app,
      loginName: testAccountsConfig.guestPrimary.loginName,
      loginPassword: testAccountsConfig.guestPrimary.loginPassword,
    });
    engineerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.staff.loginName,
    );
    customerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.guestPrimary.loginName,
    );

    const modelRepo = dataSource.getRepository(EquipmentModelEntity);
    const requestRepo = dataSource.getRepository(RepairRequestEntity);
    await modelRepo.save(
      modelRepo.create([
        { id: 51, modelCode: 'E2E-ADM', modelName: '管理员聚合型号', enabled: true, sortOrder: 1 },
      ]),
    );
    await requestRepo.save(
      requestRepo.create([
        {
          id: 211,
          requestNo: REQUEST_NO_A,
          customerAccountId,
          equipmentModelId: 51,
          errorCode: 'E-2001',
          faultDescription: '管理员聚合未接单',
          contentMd: '# E2E-ADM-211',
          createdAt: new Date('2026-08-25T01:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 212,
          requestNo: 'E2E-ADM-212',
          customerAccountId,
          equipmentModelId: 51,
          errorCode: 'E-2002',
          faultDescription: '已软删除，不应出现',
          contentMd: '# E2E-ADM-212',
          createdAt: new Date('2026-08-26T01:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: true,
          deletedAt: new Date('2026-08-27T01:00:00.000Z'),
        },
        {
          id: 213,
          requestNo: 'E2E-ADM-213',
          customerAccountId,
          equipmentModelId: 51,
          errorCode: 'E-2003',
          faultDescription: '管理员聚合未接单二号',
          contentMd: '# E2E-ADM-213',
          createdAt: new Date('2026-08-20T01:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        },
      ]),
    );

    const conversationRepo = dataSource.getRepository(AiConversationEntity);
    await conversationRepo.save(
      conversationRepo.create([
        {
          id: CONVERSATION_A,
          requestId: 211,
          engineerAccountId,
          status: AiConversationStatus.COMPLETED,
          aiFeedback: 'E2E 会话反馈',
          completedAt: new Date('2026-09-02T10:00:00.000Z'),
          createdAt: new Date('2026-09-02T09:00:00.000Z'),
        },
        {
          id: 302,
          requestId: 211,
          engineerAccountId,
          status: AiConversationStatus.ACTIVE,
          aiFeedback: null,
          completedAt: null,
          createdAt: new Date('2026-09-03T09:00:00.000Z'),
        },
      ]),
    );

    // 100 轮 × 每轮 USER + ASSISTANT = 200 条消息（messageSeq 1..200，turnNo 1..100）
    const messageRepo = dataSource.getRepository(AiMessageEntity);
    const messages = Array.from({ length: TOTAL_MESSAGES }, (_, index) => {
      const messageSeq = index + 1;
      const isUser = messageSeq % 2 === 1;
      return messageRepo.create({
        conversationId: CONVERSATION_A,
        messageSeq,
        turnNo: Math.ceil(messageSeq / 2),
        role: isUser ? AiMessageRole.USER : AiMessageRole.ASSISTANT,
        contentText: `E2E 消息 #${messageSeq}`,
        createdAt: new Date(
          2026,
          8,
          2,
          9,
          0,
          Math.floor(messageSeq / 60),
          (messageSeq % 60) * 1000,
        ),
      });
    });
    await messageRepo.save(messages);

    const reportRepo = dataSource.getRepository(AiReportEntity);
    await reportRepo.save(
      reportRepo.create([
        {
          id: 401,
          requestId: 211,
          conversationId: CONVERSATION_A,
          engineerAccountId,
          reportTitle: '诊断报告 401',
          reportType: 'DIAGNOSIS',
          contentMd: '# 报告 401 正文',
          createdAt: new Date('2026-09-02T10:30:00.000Z'),
        },
        {
          id: 402,
          // M-04 场景：报告记录的申请（212，已软删）与会话归属申请（211）不一致
          requestId: 212,
          conversationId: 302,
          engineerAccountId,
          reportTitle: '排障报告 402',
          reportType: 'TROUBLESHOOTING',
          contentMd: '# 报告 402 正文',
          createdAt: new Date('2026-09-03T10:30:00.000Z'),
        },
      ]),
    );
  });

  afterAll(async () => {
    // R1：守卫拒绝、模块装配失败、连接未完成 → 只关闭已创建的 app，不做任何删除；
    // 清理失败不吞错且仍会关闭 app（try/finally 在 helper 内实现）。
    await runAdminDocFixtureTeardown({
      app,
      dataSource,
      targetValidated: fixtureTargetValidated,
      cleanup: cleanupAdminDocumentFixture,
    });
  });

  const executeGql = (query: string, token?: string, variables?: unknown) =>
    postGql({ app, query, token, variables });

  describe('角色矩阵（计划表 S4.3）', () => {
    const listQuery = `
      query AdminRepairRequests($pagination: PaginationArgs!) {
        adminRepairRequests(pagination: $pagination) {
          items { id requestNo }
          total
        }
      }
    `;
    const pagination = { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true };

    it('SUPER_ADMIN 读取成功且 total 与列表一致', async () => {
      const response = await executeGql(listQuery, adminToken, { pagination }).expect(200);

      const page = (
        response.body as { data: { adminRepairRequests: { items: unknown[]; total: number } } }
      ).data.adminRepairRequests;
      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(2);
    });

    it('ENGINEER 直调返回 FORBIDDEN', async () => {
      const response = await executeGql(listQuery, engineerToken, { pagination }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('FORBIDDEN');
      expect(response.body.data).toBeNull();
    });

    it('CUSTOMER 直调返回 FORBIDDEN', async () => {
      const response = await executeGql(listQuery, customerToken, { pagination }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('FORBIDDEN');
    });

    it('匿名（无 token）返回 UNAUTHENTICATED', async () => {
      const response = await executeGql(listQuery, undefined, { pagination }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('软删除过滤、真实总数与筛选', () => {
    it('默认排除软删除申请：212 不出现在列表与总数', async () => {
      const response = await executeGql(
        `
        query ($pagination: PaginationArgs!) {
          adminRepairRequests(pagination: $pagination) {
            items { id requestNo errorCode isAccepted customerNickname }
            total
          }
        }
      `,
        adminToken,
        { pagination: { mode: 'OFFSET', page: 1, pageSize: 50, withTotal: true } },
      ).expect(200);

      const page = (
        response.body as {
          data: { adminRepairRequests: { items: Array<{ requestNo: string }>; total: number } };
        }
      ).data.adminRepairRequests;
      expect(page.total).toBe(2);
      const requestNos = page.items.map((item) => item.requestNo);
      expect(requestNos).toContain(REQUEST_NO_A);
      expect(requestNos).not.toContain('E2E-ADM-212');
    });

    it('requestNo 模糊筛选命中唯一申请（SQL 侧筛选 + 真实 total）', async () => {
      const response = await executeGql(
        `
        query ($filter: AdminRepairRequestFilterInput, $pagination: PaginationArgs!) {
          adminRepairRequests(filter: $filter, pagination: $pagination) {
            items { requestNo }
            total
          }
        }
      `,
        adminToken,
        {
          filter: { requestNo: '211' },
          pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true },
        },
      ).expect(200);

      const page = (
        response.body as {
          data: { adminRepairRequests: { items: Array<{ requestNo: string }>; total: number } };
        }
      ).data.adminRepairRequests;
      expect(page.total).toBe(1);
      expect(page.items[0].requestNo).toBe(REQUEST_NO_A);
    });

    it('无命中筛选返回正式空页（items 空、total 0，不报错）', async () => {
      const response = await executeGql(
        `
        query ($filter: AdminRepairRequestFilterInput, $pagination: PaginationArgs!) {
          adminRepairRequests(filter: $filter, pagination: $pagination) {
            items { requestNo }
            total
          }
        }
      `,
        adminToken,
        {
          filter: { requestNo: 'E2E-不存在-999' },
          pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true },
        },
      ).expect(200);

      const page = (
        response.body as { data: { adminRepairRequests: { items: unknown[]; total: number } } }
      ).data.adminRepairRequests;
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
    });
  });

  describe('100 轮会话消息稳定顺序（计划表 S4.2）', () => {
    const messagesQuery = `
      query AdminAiMessages($conversationId: Int!, $pagination: PaginationArgs!) {
        adminAiMessages(conversationId: $conversationId, pagination: $pagination) {
          items { id messageSeq turnNo role contentText }
          total
        }
      }
    `;

    it('total 为 200（100 轮 × 2）；第一页 messageSeq 1..100 严格递增', async () => {
      const response = await executeGql(messagesQuery, adminToken, {
        conversationId: CONVERSATION_A,
        pagination: { mode: 'OFFSET', page: 1, pageSize: 100, withTotal: true },
      }).expect(200);

      const page = (
        response.body as {
          data: {
            adminAiMessages: { items: Array<{ messageSeq: number; role: string }>; total: number };
          };
        }
      ).data.adminAiMessages;
      expect(page.total).toBe(TOTAL_MESSAGES);
      expect(page.items).toHaveLength(100);
      const seqs = page.items.map((item) => item.messageSeq);
      expect(seqs).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
      // 每轮 USER → ASSISTANT 交替
      expect(page.items[0].role).toBe('USER');
      expect(page.items[1].role).toBe('ASSISTANT');
      expect(page.items[2].role).toBe('USER');
    });

    it('第二页衔接第一页（messageSeq 101..200），分页不重不漏', async () => {
      const response = await executeGql(messagesQuery, adminToken, {
        conversationId: CONVERSATION_A,
        pagination: { mode: 'OFFSET', page: 2, pageSize: 100, withTotal: true },
      }).expect(200);

      const page = (
        response.body as { data: { adminAiMessages: { items: Array<{ messageSeq: number }> } } }
      ).data.adminAiMessages;
      expect(page.items.map((item) => item.messageSeq)).toEqual(
        Array.from({ length: 100 }, (_, i) => i + 101),
      );
    });

    it('不存在的会话返回空页（分页语义，不报错）', async () => {
      const response = await executeGql(messagesQuery, adminToken, {
        conversationId: 999999,
        pagination: { mode: 'OFFSET', page: 1, pageSize: 50, withTotal: true },
      }).expect(200);

      const page = (
        response.body as { data: { adminAiMessages: { items: unknown[]; total: number } } }
      ).data.adminAiMessages;
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
    });
  });

  describe('M-04 权威口径与统计（真实 count）', () => {
    it('报告详情：requestNo 以会话归属申请为权威，mismatch 标记准确', async () => {
      const response = await executeGql(
        `
        query {
          r401: adminAiReport(id: 401) { id requestNo requestMismatch }
          r402: adminAiReport(id: 402) { id requestNo requestMismatch }
        }
      `,
        adminToken,
      ).expect(200);

      const data = (
        response.body as {
          data: {
            r401: { requestNo: string; requestMismatch: boolean };
            r402: { requestNo: string; requestMismatch: boolean };
          };
        }
      ).data;
      // 401：报告申请与会话归属一致
      expect(data.r401.requestNo).toBe(REQUEST_NO_A);
      expect(data.r401.requestMismatch).toBe(false);
      // 402：报告记录的申请是 212（软删），会话归属 211 —— 展示权威编号并标记审计
      expect(data.r402.requestNo).toBe(REQUEST_NO_A);
      expect(data.r402.requestMismatch).toBe(true);
    });

    it('统计四类计数与夹具一致（参考资料全空 → 0，无演示数字）', async () => {
      const response = await executeGql(
        `
        query {
          adminDocumentDatabaseStats {
            repairRequestTotal
            referenceDocumentTotal
            aiConversationTotal
            aiReportTotal
          }
        }
      `,
        adminToken,
      ).expect(200);

      const stats = (
        response.body as { data: { adminDocumentDatabaseStats: Record<string, number> } }
      ).data.adminDocumentDatabaseStats;
      expect(stats).toEqual({
        repairRequestTotal: 2,
        referenceDocumentTotal: 0,
        aiConversationTotal: 2,
        aiReportTotal: 2,
      });
    });
  });

  describe('R1 清理边界：夹具外哨兵链不被误删（真实隔离库）', () => {
    const SENTINEL_LOGIN = 'e2e-adm-sentinel';
    const SENTINEL_MODEL_ID = 9972;
    const SENTINEL_REQUEST_ID = 9973;
    const SENTINEL_REQUEST_NO = 'E2E-ADM-SENTINEL';
    const FIXTURE_REQUEST_IDS = [211, 212, 213];

    it('完整夹具清理后：只按固定标识精确删除；独立哨兵链（账号+型号+申请）原样存在', async () => {
      const accountRepo = dataSource.getRepository(AccountEntity);
      const modelRepo = dataSource.getRepository(EquipmentModelEntity);
      const requestRepo = dataSource.getRepository(RepairRequestEntity);

      // 哨兵链不引用任何夹具父行（夹具账号/型号会被清理），从而在外键 RESTRICT 下仍然合法
      const sentinelAccount = await accountRepo.save(
        accountRepo.create({
          loginName: SENTINEL_LOGIN,
          loginEmail: null,
          loginPassword: 'e2e-not-a-login-hash',
          status: AccountStatus.ACTIVE,
          recentLoginHistory: null,
          identityHint: null,
        }),
      );
      await modelRepo.save(
        modelRepo.create({
          id: SENTINEL_MODEL_ID,
          modelCode: 'E2E-ADM-SENTINEL',
          modelName: '哨兵型号（夹具外）',
          enabled: true,
          sortOrder: 999,
        }),
      );
      await requestRepo.save(
        requestRepo.create({
          id: SENTINEL_REQUEST_ID,
          requestNo: SENTINEL_REQUEST_NO,
          customerAccountId: sentinelAccount.id,
          equipmentModelId: SENTINEL_MODEL_ID,
          errorCode: 'E-9999',
          faultDescription: 'R1 哨兵：夹具外独立链，清理不得误删',
          contentMd: '# sentinel',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        }),
      );

      try {
        await cleanupAdminDocumentFixture(dataSource);

        // 夹具固定标识（申请 / 型号 / 三个 seed 账号）已被精确回收
        expect(await requestRepo.count({ where: { id: In(FIXTURE_REQUEST_IDS) } })).toBe(0);
        expect(await modelRepo.count({ where: { id: 51 } })).toBe(0);
        expect(
          await accountRepo.count({
            where: {
              loginName: In([
                testAccountsConfig.admin.loginName,
                testAccountsConfig.staff.loginName,
                testAccountsConfig.guestPrimary.loginName,
              ]),
            },
          }),
        ).toBe(0);

        // 夹具外哨兵链必须原样存在（≠ 整表 / 范围删除）
        const sentinelRequest = await requestRepo.findOne({
          where: { id: SENTINEL_REQUEST_ID },
        });
        expect(sentinelRequest?.requestNo).toBe(SENTINEL_REQUEST_NO);
        expect(await modelRepo.count({ where: { id: SENTINEL_MODEL_ID } })).toBe(1);
        expect(await accountRepo.count({ where: { loginName: SENTINEL_LOGIN } })).toBe(1);
      } finally {
        await requestRepo.delete(SENTINEL_REQUEST_ID);
        await modelRepo.delete(SENTINEL_MODEL_ID);
        await accountRepo.delete({ loginName: SENTINEL_LOGIN });
      }
    });

    it('夹具写入中途失败（仅部分夹具落库）时：清理不报错、只移除已写夹具，哨兵不受影响', async () => {
      const modelRepo = dataSource.getRepository(EquipmentModelEntity);

      // 模拟 beforeAll 在写夹具中途失败：只落下型号 51，其余夹具行均不存在
      await modelRepo.save(
        modelRepo.create({
          id: 51,
          modelCode: 'E2E-ADM',
          modelName: '管理员聚合型号',
          enabled: true,
          sortOrder: 1,
        }),
      );
      await modelRepo.save(
        modelRepo.create({
          id: 9974,
          modelCode: 'E2E-ADM-SENTINEL-2',
          modelName: '哨兵型号二（夹具外）',
          enabled: true,
          sortOrder: 998,
        }),
      );

      try {
        // 对不存在的固定标识（申请/会话/报告/账号）执行删除必须是无害 no-op
        await cleanupAdminDocumentFixture(dataSource);

        expect(await modelRepo.count({ where: { id: 51 } })).toBe(0);
        expect(await modelRepo.count({ where: { id: 9974 } })).toBe(1);
      } finally {
        await modelRepo.delete(9974);
      }
    });
  });
});
