// test/10-admin-document-database/admin-document-database.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { EngineerResponseEntity } from '@src/modules/lithography/entities/engineer-response.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { AiConversationEntity } from '@src/modules/lithography/entities/ai-conversation.entity';
import { AiMessageEntity } from '@src/modules/lithography/entities/ai-message.entity';
import { AiReportEntity } from '@src/modules/lithography/entities/ai-report.entity';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';

import { AiConversationStatus, AiMessageRole } from '@app-types/models/ai-conversation.types';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { DataSource, In } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { getAccountIdByLoginName, login, postGql } from '../utils/e2e-graphql-utils';
import { seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

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

  const REQUEST_NO_A = 'E2E-ADM-211';
  const CONVERSATION_A = 301;
  const TOTAL_MESSAGES = 200; // 100 轮 × 每轮 USER + ASSISTANT

  // 本用例独占的固定主键/标识：清理只针对这些，不整表删除业务数据（0918 决策 #3）。
  const FIXTURE_EQUIPMENT_MODEL_IDS = [51];
  const FIXTURE_REQUEST_IDS = [211, 212, 213];
  const FIXTURE_CONVERSATION_IDS = [301, 302];
  const FIXTURE_REPORT_IDS = [401, 402];
  const FIXTURE_ACCOUNT_LOGIN_NAMES = [
    testAccountsConfig.admin.loginName, // testadmin
    testAccountsConfig.staff.loginName, // teststaff
    testAccountsConfig.guestPrimary.loginName, // testguestprimary
  ];

  /**
   * 精确回收本用例创建的夹具：沿外键 RESTRICT 反向，按固定主键/标识删除，
   * 只动本用例数据，不整表清空业务表，也不为清账号而删除其他账号。
   */
  const cleanupAdminFixture = async (ds: DataSource): Promise<void> => {
    // 报告 → 消息 → 回复 → 会话 → 申请 → 型号（均为本用例固定 ID）
    await ds.getRepository(AiReportEntity).delete(FIXTURE_REPORT_IDS);
    await ds
      .getRepository(AiMessageEntity)
      .delete({ conversationId: In(FIXTURE_CONVERSATION_IDS) });
    await ds.getRepository(EngineerResponseEntity).delete({ requestId: In(FIXTURE_REQUEST_IDS) });
    await ds.getRepository(AiConversationEntity).delete(FIXTURE_CONVERSATION_IDS);
    await ds.getRepository(RepairRequestEntity).delete(FIXTURE_REQUEST_IDS);
    await ds.getRepository(EquipmentModelEntity).delete(FIXTURE_EQUIPMENT_MODEL_IDS);
    // 账号域：先按本用例 loginName 定位 accountId，再 user_info → account
    const accountRepo = ds.getRepository(AccountEntity);
    const accounts = await accountRepo.find({
      where: { loginName: In(FIXTURE_ACCOUNT_LOGIN_NAMES) },
      select: { id: true },
    });
    const accountIds = accounts.map((account) => account.id);
    if (accountIds.length > 0) {
      await ds.getRepository(UserInfoEntity).delete({ accountId: In(accountIds) });
      await accountRepo.delete({ id: In(accountIds) });
    }
  };

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);

    await app.init();

    // 造数前精确回收同名夹具（保证连跑两遍幂等），不整表删除业务数据
    await cleanupAdminFixture(dataSource);

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
    // 用例结束后精确回收本夹具数据，不留残留、不触碰非本用例数据
    await cleanupAdminFixture(dataSource);
    await app.close();
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
});
