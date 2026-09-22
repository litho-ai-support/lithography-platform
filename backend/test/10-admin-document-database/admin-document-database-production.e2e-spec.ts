// test/10-admin-document-database/admin-document-database-production.e2e-spec.ts
//
// PR3 负责人 review #2（R2）回归：管理员文档数据库在**临时 production 配置**下的
// 真实 GraphQL 输入错误分类 E2E。
//
// 背景：三个带 @ValidateInput() 的列表 Query 抛 BadRequestException；生产环境的
// GqlAllExceptionsFilter 会把所有 HttpException 一律降级为 INTERNAL_SERVER_ERROR
// 并隐藏 message / errorCode，导致 DTO 校验失败被误分类为系统故障。R2 起本模块统一
// 使用模块局部 ValidateAdminDocumentDatabaseInput（DomainError → BAD_USER_INPUT）。
//
// 本文件断言（完整链路 DTO pipe → Resolver → Usecase → 实际 GqlAllExceptionsFilter
// 全部真实执行，仅过滤器拿到的 ConfigService 把 NODE_ENV 恒读为 production）：
// - 长度上限合法值在上限端点不误伤、全链路成功；
// - 长度上限 +1、equipmentModelId=0、非法 page/pageSize、日期范围倒置、非法详情 ID
//   在 production 均为 BAD_USER_INPUT + ADMIN_DOCUMENT_DATABASE_INVALID_PARAMS + 可读文案；
// - adminAiMessages（R2 修补前无任何 DTO 校验的 Query）同样走一致契约；
// - 未登录 / ENGINEER / CUSTOMER 仍为 UNAUTHENTICATED / FORBIDDEN；
// - 不存在的详情仍为 NOT_FOUND（非输入类 DomainError 分类不变）；
// - 注入的真实内部异常仍为 INTERNAL_SERVER_ERROR（不得伪装为 BAD_USER_INPUT；
//   生产文案固定为「系统繁忙，请稍后重试」，不泄漏内部细节）；
// - 合法输入成功路径不受影响（无 errors，total 为真实计数）。
//
// 哨兵（同 my-account-settings-write-production 范式）：
// 1. filterFactoryCalls：override 工厂被调用（单例装配）；
// 2. filterNodeEnvReads：每个被拒请求恰好触发一次被 override 过滤器的 NODE_ENV
//    判定读取（catch() 首行每异常读取一次），证明请求确实走进了生产过滤器实例。

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import { DataSource } from 'typeorm';

import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { ListAdminRepairRequestsUsecase } from '@src/usecases/admin-document-database/list-admin-repair-requests.usecase';
import { GqlAllExceptionsFilter } from '../../src/infrastructure/graphql/filters/graphql-exception.filter';
import { assertDataSourceOnAllowedE2eDatabase } from '../utils/e2e-db-guard';
import { login, postGql } from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

type GqlError = {
  message: string;
  extensions?: { code?: string; errorCode?: string; errorMessage?: string };
};

type GqlBody<T> = { data?: T | null; errors?: GqlError[] };

type AdminRepairRequestsData = {
  adminRepairRequests: { items: Array<{ id: number; requestNo: string }>; total: number };
};

type AdminConversationsData = { adminAiConversations: { items: unknown[]; total: number } };
type AdminMessagesData = { adminAiMessages: { items: unknown[]; total: number } };
type AdminReportsData = { adminAiReports: { items: unknown[]; total: number } };
type AdminReportDetailData = { adminAiReport: { id: number; reportTitle: string } };

const ADMIN_REPAIR_REQUESTS_QUERY = `
  query AdminRepairRequests($pagination: PaginationArgs!, $filter: AdminRepairRequestFilterInput) {
    adminRepairRequests(pagination: $pagination, filter: $filter) {
      items { id requestNo }
      total
    }
  }
`;

const ADMIN_AI_CONVERSATIONS_QUERY = `
  query AdminAiConversations($pagination: PaginationArgs!, $filter: AdminAiConversationFilterInput) {
    adminAiConversations(pagination: $pagination, filter: $filter) {
      items { id }
      total
    }
  }
`;

const ADMIN_AI_MESSAGES_QUERY = `
  query AdminAiMessages($conversationId: Int!, $pagination: PaginationArgs!) {
    adminAiMessages(conversationId: $conversationId, pagination: $pagination) {
      items { id messageSeq }
      total
    }
  }
`;

const ADMIN_AI_REPORTS_QUERY = `
  query AdminAiReports($pagination: PaginationArgs!, $filter: AdminAiReportFilterInput) {
    adminAiReports(pagination: $pagination, filter: $filter) {
      items { id reportTitle }
      total
    }
  }
`;

const ADMIN_AI_REPORT_DETAIL_QUERY = `
  query AdminAiReport($id: Int!) {
    adminAiReport(id: $id) { id reportTitle }
  }
`;

/** E2E 日志配置：stdout 直写（无 pino/file transport），不触碰生产日志目录 */
const E2E_LOGGER_PARAMS = {
  pinoHttp: {
    level: 'info',
  },
} as unknown as Params;

/** 哨兵 1：override 工厂被调用的次数（期望恰 1：单例装配） */
let filterFactoryCalls = 0;
/** 哨兵 2：被 override 的过滤器实例读取 NODE_ENV production 判定的次数 */
let filterNodeEnvReads = 0;

/**
 * production 判定包装：NODE_ENV 恒读作 'production'（每次读取计数），
 * 其余配置键透传真实 ConfigService——保证除 production 判定外链路全部真实。
 */
function wrapConfigForProduction(configService: ConfigService): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) => {
      if (key === 'NODE_ENV') {
        filterNodeEnvReads += 1;

        return 'production';
      }

      return configService.get(key, defaultValue);
    },
  } as unknown as ConfigService;
}

const VALID_PAGINATION = { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true };

/** 与 DTO / usecase 校验断言的期望文案一一对应（生产环境必须保留可读文案） */
const INVALID_INPUT_CASES: ReadonlyArray<{
  readonly label: string;
  readonly query: string;
  readonly variables: Record<string, unknown>;
  readonly messagePart: string;
}> = [
  {
    label: 'requestNo 上限 +1（65 字符）',
    query: ADMIN_REPAIR_REQUESTS_QUERY,
    variables: {
      pagination: VALID_PAGINATION,
      filter: { requestNo: 'R'.repeat(65) },
    },
    messagePart: '申请编号搜索词不能超过 64 个字符',
  },
  {
    label: 'customerKeyword 上限 +1（101 字符）',
    query: ADMIN_REPAIR_REQUESTS_QUERY,
    variables: {
      pagination: VALID_PAGINATION,
      filter: { customerKeyword: '客'.repeat(101) },
    },
    messagePart: '客户关键字不能超过 100 个字符',
  },
  {
    label: 'equipmentModelId=0',
    query: ADMIN_REPAIR_REQUESTS_QUERY,
    variables: {
      pagination: VALID_PAGINATION,
      filter: { equipmentModelId: 0 },
    },
    messagePart: '设备型号 ID 必须大于 0',
  },
  {
    label: 'pageSize=101（超过上限）',
    query: ADMIN_REPAIR_REQUESTS_QUERY,
    variables: { pagination: { ...VALID_PAGINATION, pageSize: 101 } },
    messagePart: '每页数量不能超过 100',
  },
  {
    label: 'pageSize=0（低于下限）',
    query: ADMIN_REPAIR_REQUESTS_QUERY,
    variables: { pagination: { ...VALID_PAGINATION, pageSize: 0 } },
    messagePart: '每页数量必须大于等于 1',
  },
  {
    label: 'page=0（低于下限）',
    query: ADMIN_REPAIR_REQUESTS_QUERY,
    variables: { pagination: { ...VALID_PAGINATION, page: 0 } },
    messagePart: '页码必须大于等于 1',
  },
  {
    label: '日期范围倒置（usecase 层校验）',
    query: ADMIN_REPAIR_REQUESTS_QUERY,
    variables: {
      pagination: VALID_PAGINATION,
      filter: {
        createdAtFrom: '2026-02-01T00:00:00.000Z',
        createdAtTo: '2026-01-01T00:00:00.000Z',
      },
    },
    messagePart: '时间范围无效：起始时间不能晚于结束时间',
  },
  {
    label: 'AI 会话 engineerKeyword 上限 +1（101 字符）',
    query: ADMIN_AI_CONVERSATIONS_QUERY,
    variables: {
      pagination: VALID_PAGINATION,
      filter: { engineerKeyword: '工'.repeat(101) },
    },
    messagePart: '工程师关键字不能超过 100 个字符',
  },
  {
    label: 'AI 报告 reportType 上限 +1（101 字符）',
    query: ADMIN_AI_REPORTS_QUERY,
    variables: {
      pagination: VALID_PAGINATION,
      filter: { reportType: 'T'.repeat(101) },
    },
    messagePart: '报告类型不能超过 100 个字符',
  },
  {
    label: 'adminAiMessages pageSize=101（R2 新增校验覆盖）',
    query: ADMIN_AI_MESSAGES_QUERY,
    variables: { conversationId: 301, pagination: { ...VALID_PAGINATION, pageSize: 101 } },
    messagePart: '每页数量不能超过 100',
  },
  {
    label: '详情 ID=0（usecase 正整数校验）',
    query: ADMIN_AI_REPORT_DETAIL_QUERY,
    variables: { id: 0 },
    messagePart: 'AI 报告 ID无效',
  },
];

describe('admin-document-database 生产环境输入错误分类 (e2e, NODE_ENV=production)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let engineerToken: string;
  let customerToken: string;

  beforeAll(async () => {
    // 应用保持 E2E 配置初始化；仅真实 GqlAllExceptionsFilter 接收 production 判定，
    // 因而不会走 production logger 的默认日志目录。动态 import 保持 schema 初始化顺序。
    const [{ initGraphQLSchema }, { ApiModule: apiModule }] = await Promise.all([
      import('../../src/adapters/api/graphql/schema/schema.init'),
      import('../../src/bootstraps/api/api.module'),
    ]);

    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [apiModule],
    })
      .overrideProvider(PARAMS_PROVIDER_TOKEN)
      .useValue(E2E_LOGGER_PARAMS)
      .overrideProvider(GqlAllExceptionsFilter)
      .useFactory({
        inject: [ConfigService],
        factory: (configService: ConfigService) => {
          filterFactoryCalls += 1;

          return new GqlAllExceptionsFilter(wrapConfigForProduction(configService));
        },
      })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // 🔒 第一条 DELETE 之前复用不可跳过的目标库白名单守卫（0918 P0）
    await assertDataSourceOnAllowedE2eDatabase(dataSource);
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      createAccountUsecase: app.get(CreateAccountUsecase),
      includeKeys: ['admin', 'staff', 'guestPrimary'],
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
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const gql = async <T>(params: {
    query: string;
    variables?: unknown;
    token?: string;
  }): Promise<GqlBody<T>> => {
    const response = await postGql({
      app,
      query: params.query,
      variables: params.variables,
      token: params.token,
    }).expect((res) => {
      expect([200, 400]).toContain(res.status);
    });
    return response.body as GqlBody<T>;
  };

  const expectSingleError = (body: GqlBody<unknown>, code: string, errorCode: string): void => {
    expect(body.errors).toBeDefined();
    expect(body.errors).toHaveLength(1);
    expect(body.errors?.[0]?.extensions?.code).toBe(code);
    expect(body.errors?.[0]?.extensions?.errorCode).toBe(errorCode);
  };

  /**
   * 断言被 override 的过滤器真实处理了本次请求：catch() 首行每异常恰好读取一次
   * NODE_ENV，故拒绝请求后读取计数必须精确 +1（缺失即证明 override 未生效）。
   */
  const expectRejectionViaOverriddenFilter = async (run: () => Promise<unknown>): Promise<void> => {
    const readsBefore = filterNodeEnvReads;

    await run();

    expect(filterNodeEnvReads).toBe(readsBefore + 1);
  };

  /** production 下的输入类拒绝：BAD_USER_INPUT + 业务码 + 可读文案（不得是兜底「请求失败」） */
  const expectBadUserInput = async (
    run: () => Promise<GqlBody<unknown>>,
    messagePart: string,
  ): Promise<void> => {
    await expectRejectionViaOverriddenFilter(async () => {
      const body = await run();

      expectSingleError(body, 'BAD_USER_INPUT', 'ADMIN_DOCUMENT_DATABASE_INVALID_PARAMS');
      expect(body.errors?.[0]?.message).toContain(messagePart);
      expect(body.errors?.[0]?.message).not.toBe('请求失败');
    });
  };

  it('生产分类链路有效性：全局过滤器来自 override 工厂（单例装配）', () => {
    expect(filterFactoryCalls).toBe(1);
    expect(app.get(GqlAllExceptionsFilter)).toBeDefined();
  });

  it('未登录：UNAUTHENTICATED（JWT_AUTHENTICATION_FAILED），不因生产环境塌缩为 500', async () => {
    await expectRejectionViaOverriddenFilter(async () => {
      const body = await gql<AdminRepairRequestsData>({
        query: ADMIN_REPAIR_REQUESTS_QUERY,
        variables: { pagination: VALID_PAGINATION },
      });

      expectSingleError(body, 'UNAUTHENTICATED', 'JWT_AUTHENTICATION_FAILED');
    });
  });

  it.each([
    { label: 'ENGINEER', tokenKey: 'engineer' as const },
    { label: 'CUSTOMER', tokenKey: 'customer' as const },
  ])('$label 直调：FORBIDDEN（INSUFFICIENT_PERMISSIONS）', async ({ tokenKey }) => {
    const token = tokenKey === 'engineer' ? engineerToken : customerToken;

    await expectRejectionViaOverriddenFilter(async () => {
      const body = await gql<AdminRepairRequestsData>({
        query: ADMIN_REPAIR_REQUESTS_QUERY,
        variables: { pagination: VALID_PAGINATION },
        token,
      });

      expectSingleError(body, 'FORBIDDEN', 'INSUFFICIENT_PERMISSIONS');
    });
  });

  it('边界合法（上限值）不误伤：requestNo 64 字符 + customerKeyword 100 字符 + pageSize=100 成功', async () => {
    const body = await gql<AdminRepairRequestsData>({
      query: ADMIN_REPAIR_REQUESTS_QUERY,
      variables: {
        pagination: { ...VALID_PAGINATION, pageSize: 100 },
        filter: { requestNo: 'R'.repeat(64), customerKeyword: '客'.repeat(100) },
      },
      token: adminToken,
    });

    expect(body.errors).toBeUndefined();
    expect(body.data?.adminRepairRequests.total).toBe(0);
  });

  it('边界合法（上限值）不误伤：engineerKeyword 100 字符 + reportType 100 字符成功', async () => {
    const conversations = await gql<AdminConversationsData>({
      query: ADMIN_AI_CONVERSATIONS_QUERY,
      variables: {
        pagination: { ...VALID_PAGINATION, pageSize: 100 },
        filter: { engineerKeyword: '工'.repeat(100) },
      },
      token: adminToken,
    });
    expect(conversations.errors).toBeUndefined();
    expect(conversations.data?.adminAiConversations.total).toBe(0);

    const reports = await gql<AdminReportsData>({
      query: ADMIN_AI_REPORTS_QUERY,
      variables: {
        pagination: { ...VALID_PAGINATION, pageSize: 100 },
        filter: { reportType: 'T'.repeat(100) },
      },
      token: adminToken,
    });
    expect(reports.errors).toBeUndefined();
    expect(reports.data?.adminAiReports.total).toBe(0);
  });

  it('合法输入成功路径不受新校验影响：adminAiMessages 空页语义（total 0，非报错）', async () => {
    const body = await gql<AdminMessagesData>({
      query: ADMIN_AI_MESSAGES_QUERY,
      variables: { conversationId: 999999, pagination: { ...VALID_PAGINATION, pageSize: 100 } },
      token: adminToken,
    });

    expect(body.errors).toBeUndefined();
    expect(body.data?.adminAiMessages.items).toEqual([]);
    expect(body.data?.adminAiMessages.total).toBe(0);
  });

  it.each(INVALID_INPUT_CASES)(
    '生产分类：$label → BAD_USER_INPUT + 可读文案',
    async ({ query, variables, messagePart }) => {
      await expectBadUserInput(
        () => gql<unknown>({ query, variables, token: adminToken }),
        messagePart,
      );
    },
  );

  it('非输入类 DomainError 分类不变：不存在的报告为 NOT_FOUND（非 BAD_USER_INPUT / 500）', async () => {
    await expectRejectionViaOverriddenFilter(async () => {
      const body = await gql<AdminReportDetailData>({
        query: ADMIN_AI_REPORT_DETAIL_QUERY,
        variables: { id: 99999999 },
        token: adminToken,
      });

      expectSingleError(body, 'NOT_FOUND', 'ADMIN_DOCUMENT_DATABASE_NOT_FOUND');
      expect(body.data?.adminAiReport).toBeUndefined();
    });
  });

  it('注入的真实内部异常仍为 INTERNAL_SERVER_ERROR（不得伪装为参数错误，且不泄漏细节）', async () => {
    const listUsecase = app.get(ListAdminRepairRequestsUsecase);
    // 故障注入：仅本次调用拒绝，其余用例继续使用真实 usecase（finally 恢复）
    const spy = jest
      .spyOn(listUsecase, 'execute')
      .mockRejectedValueOnce(new Error('测试注入的内部错误（不得外泄）'));

    try {
      await expectRejectionViaOverriddenFilter(async () => {
        const body = await gql<unknown>({
          query: ADMIN_REPAIR_REQUESTS_QUERY,
          variables: { pagination: VALID_PAGINATION },
          token: adminToken,
        });

        expect(body.errors).toHaveLength(1);
        expect(body.errors?.[0]?.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
        // 生产环境不返回 errorCode / 原始 message，只给安全兜底文案
        expect(body.errors?.[0]?.extensions?.errorCode).toBeUndefined();
        expect(body.errors?.[0]?.message).toBe('系统繁忙，请稍后重试');
        expect(body.errors?.[0]?.message).not.toContain('测试注入');
      });
    } finally {
      spy.mockRestore();
    }
  });
});
