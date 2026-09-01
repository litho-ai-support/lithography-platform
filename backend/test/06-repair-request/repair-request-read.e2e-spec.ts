// test/06-repair-request/repair-request-read.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { EngineerResponseEntity } from '@src/modules/lithography/entities/engineer-response.entity';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { EngineerResolutionStatus } from '@app-types/models/repair-request.types';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { getAccountIdByLoginName, login, postGql } from '../utils/e2e-graphql-utils';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

const MY_LIST_QUERY = `
  query MyRepairRequests($pagination: PaginationArgs!) {
    myRepairRequests(pagination: $pagination) {
      items {
        id
        requestNo
        errorCode
        createdAt
        isAccepted
        acceptedAt
        latestResolutionStatus
        equipmentModel { id modelCode modelName }
      }
      total
      page
      pageSize
    }
  }
`;

const ENGINEER_LIST_QUERY = `
  query EngineerRepairRequests($scope: String!, $pagination: PaginationArgs!) {
    engineerRepairRequests(scope: $scope, pagination: $pagination) {
      items {
        id
        requestNo
        isAccepted
        acceptedAt
        latestResolutionStatus
        equipmentModel { id modelCode modelName }
      }
      total
      page
      pageSize
    }
  }
`;

// 详情入口按角色分开（负责人 20260901 裁定）：同 DTO，不同 Guard/数据范围
const MY_DETAIL_QUERY = `
  query MyRepairRequest($id: Int!) {
    myRepairRequest(id: $id) {
      id
      requestNo
      errorCode
      faultDescription
      contentMd
      createdAt
      isAccepted
      acceptedAt
      latestResolutionStatus
      equipmentModel { id modelCode modelName }
      responses { id engineerNickname resolutionStatus responseText createdAt }
    }
  }
`;

const ENGINEER_DETAIL_QUERY = `
  query EngineerRepairRequest($id: Int!) {
    engineerRepairRequest(id: $id) {
      id
      requestNo
      errorCode
      faultDescription
      contentMd
      createdAt
      isAccepted
      acceptedAt
      latestResolutionStatus
      equipmentModel { id modelCode modelName }
      responses { id engineerNickname resolutionStatus responseText createdAt }
    }
  }
`;

const OFFSET_PAGINATION = { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true };

/**
 * 维修申请公共读模型回归（core 组）
 *
 * 覆盖负责人 20260901 裁定契约：
 * - 客户列表仅本人且未删除；工程师两范围（AVAILABLE 待接单 / MINE 我的接单）
 * - 详情按角色分入口（myRepairRequest / engineerRepairRequest，含回复时间线、机型、末条状态口径）
 * - 回复返回工程师安全昵称（实时关联，缺失回落「工程师」）；不返回工程师账号 ID
 * - 双角色读权限矩阵 + 越权/已删除/不存在统一拒绝（防探测）
 * - SUPER_ADMIN 按角色继承规则准入；未登录与守卫角色准入；分页参数（OFFSET 强制、withTotal）
 *
 * 造数固定主键（111~115 申请、121~122 回复、41 型号），
 * 依赖 global-setup-e2e 的全表 TRUNCATE 保证无冲突。
 */
describe('维修申请公共读模型 (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let modelRepository: Repository<EquipmentModelEntity>;
  let requestRepository: Repository<RepairRequestEntity>;
  let responseRepository: Repository<EngineerResponseEntity>;
  let customerToken: string;
  let otherCustomerToken: string;
  let engineerToken: string;
  let otherEngineerToken: string;
  let adminToken: string;
  let customerAccountId: number;
  let otherCustomerAccountId: number;
  let engineerAccountId: number;
  let otherEngineerAccountId: number;

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);
    modelRepository = dataSource.getRepository(EquipmentModelEntity);
    requestRepository = dataSource.getRepository(RepairRequestEntity);
    responseRepository = dataSource.getRepository(EngineerResponseEntity);

    await app.init();

    // 清理顺序：回复 → 申请 → 账号 → 型号（外键 RESTRICT 方向）
    await responseRepository.createQueryBuilder().delete().execute();
    await requestRepository.createQueryBuilder().delete().execute();
    await cleanupTestAccounts(dataSource);
    await modelRepository.createQueryBuilder().delete().execute();

    await seedTestAccounts({
      dataSource,
      createAccountUsecase: app.get(CreateAccountUsecase),
      includeKeys: ['staff', 'staffSecondary', 'guestPrimary', 'guestSecondary', 'admin'],
    });
    customerToken = await login({
      app,
      loginName: testAccountsConfig.guestPrimary.loginName,
      loginPassword: testAccountsConfig.guestPrimary.loginPassword,
    });
    otherCustomerToken = await login({
      app,
      loginName: testAccountsConfig.guestSecondary.loginName,
      loginPassword: testAccountsConfig.guestSecondary.loginPassword,
    });
    engineerToken = await login({
      app,
      loginName: testAccountsConfig.staff.loginName,
      loginPassword: testAccountsConfig.staff.loginPassword,
    });
    otherEngineerToken = await login({
      app,
      loginName: testAccountsConfig.staffSecondary.loginName,
      loginPassword: testAccountsConfig.staffSecondary.loginPassword,
    });
    adminToken = await login({
      app,
      loginName: testAccountsConfig.admin.loginName,
      loginPassword: testAccountsConfig.admin.loginPassword,
    });
    customerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.guestPrimary.loginName,
    );
    otherCustomerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.guestSecondary.loginName,
    );
    engineerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.staff.loginName,
    );
    otherEngineerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.staffSecondary.loginName,
    );

    await modelRepository.save(
      modelRepository.create([
        { id: 41, modelCode: 'E2E-READ', modelName: '读模型型号', enabled: true, sortOrder: 1 },
      ]),
    );
    // 111 客户甲未接单；112 客户甲由工程师甲接单（含两条回复）；113 客户甲已软删除；
    // 114 客户乙未接单（待接单池）；115 客户乙由工程师乙接单（他人已接单）
    await requestRepository.save(
      requestRepository.create([
        {
          id: 111,
          requestNo: 'E2E-RD-111',
          customerAccountId,
          equipmentModelId: 41,
          errorCode: 'E-1001',
          faultDescription: '未接单场景',
          contentMd: '# E2E-111',
          createdAt: new Date('2026-08-25T01:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 112,
          requestNo: 'E2E-RD-112',
          customerAccountId,
          equipmentModelId: 41,
          errorCode: 'E-1002',
          faultDescription: '本人接单场景',
          contentMd: '# E2E-112',
          createdAt: new Date('2026-08-26T01:00:00.000Z'),
          isAccepted: true,
          acceptedByEngineerAccountId: engineerAccountId,
          acceptedAt: new Date('2026-08-27T01:00:00.000Z'),
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 113,
          requestNo: 'E2E-RD-113',
          customerAccountId,
          equipmentModelId: 41,
          errorCode: 'E-1003',
          faultDescription: '已删除场景',
          contentMd: '# E2E-113',
          createdAt: new Date('2026-08-27T01:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: true,
          deletedAt: new Date('2026-08-27T02:00:00.000Z'),
        },
        {
          id: 114,
          requestNo: 'E2E-RD-114',
          customerAccountId: otherCustomerAccountId,
          equipmentModelId: 41,
          errorCode: 'E-1004',
          faultDescription: '他人未接单场景',
          contentMd: '# E2E-114',
          createdAt: new Date('2026-08-28T01:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 115,
          requestNo: 'E2E-RD-115',
          customerAccountId: otherCustomerAccountId,
          equipmentModelId: 41,
          errorCode: 'E-1005',
          faultDescription: '他人已接单场景',
          contentMd: '# E2E-115',
          createdAt: new Date('2026-08-29T01:00:00.000Z'),
          isAccepted: true,
          acceptedByEngineerAccountId: otherEngineerAccountId,
          acceptedAt: new Date('2026-08-29T02:00:00.000Z'),
          deprecated: false,
          deletedAt: null,
        },
      ]),
    );
    await responseRepository.save(
      responseRepository.create([
        {
          id: 121,
          requestId: 112,
          engineerAccountId,
          customerAccountId,
          resolutionStatus: EngineerResolutionStatus.PENDING,
          responseText: '已受理，排查中',
          createdAt: new Date('2026-08-27T02:00:00.000Z'),
        },
        {
          id: 122,
          requestId: 112,
          engineerAccountId,
          customerAccountId,
          resolutionStatus: EngineerResolutionStatus.RESOLVED,
          responseText: '已更换部件，问题解决',
          createdAt: new Date('2026-08-27T03:00:00.000Z'),
        },
      ]),
    );
  }, 60000);

  afterAll(async () => {
    try {
      if (dataSource && dataSource.isInitialized) {
        await responseRepository.createQueryBuilder().delete().execute();
        await requestRepository.createQueryBuilder().delete().execute();
        await cleanupTestAccounts(dataSource);
        await modelRepository.createQueryBuilder().delete().execute();
      }
    } catch (error) {
      console.error('afterAll 清理失败:', error);
    } finally {
      if (app) {
        try {
          await app.close();
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (closeError) {
          console.warn('应用关闭时出现警告:', closeError);
        }
      }
    }
  });

  const expectAccessDenied = (error: unknown): void => {
    const err = error as { extensions: Record<string, unknown> };
    expect(err.extensions.code).toBe('FORBIDDEN');
    expect(err.extensions.errorCode).toBe('ACCESS_DENIED');
  };

  const expectUnauthenticated = (error: unknown): void => {
    const err = error as { extensions: Record<string, unknown> };
    expect(err.extensions.code).toBe('UNAUTHENTICATED');
    expect(err.extensions.errorCode).toBe('JWT_AUTHENTICATION_FAILED');
  };

  describe('myRepairRequests 客户列表', () => {
    it('仅返回本人未删除申请，创建时间倒序，含机型与末条处理状态', async () => {
      const response = await postGql({
        app,
        query: MY_LIST_QUERY,
        variables: { pagination: OFFSET_PAGINATION },
        token: customerToken,
      }).expect(200);

      expect(response.body.errors).toBeUndefined();
      const page = response.body.data.myRepairRequests;
      expect(page.items.map((item: { id: number }) => item.id)).toEqual([112, 111]);
      expect(page.total).toBe(2);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(10);
      expect(page.items[0]).toMatchObject({
        requestNo: 'E2E-RD-112',
        isAccepted: true,
        latestResolutionStatus: 'RESOLVED',
        equipmentModel: { id: 41, modelCode: 'E2E-READ', modelName: '读模型型号' },
      });
      expect(page.items[1].latestResolutionStatus).toBeNull();
      // 契约防泄漏：输出不得含归属类账号 ID
      for (const item of page.items) {
        expect(item).not.toHaveProperty('customerAccountId');
        expect(item).not.toHaveProperty('acceptedByEngineerAccountId');
      }
    });

    it('分页参数生效（pageSize=1 第二页取到次新一条）', async () => {
      const response = await postGql({
        app,
        query: MY_LIST_QUERY,
        variables: { pagination: { mode: 'OFFSET', page: 2, pageSize: 1, withTotal: true } },
        token: customerToken,
      }).expect(200);

      const page = response.body.data.myRepairRequests;
      expect(page.items.map((item: { id: number }) => item.id)).toEqual([111]);
      expect(page.total).toBe(2);
      expect(page.page).toBe(2);
      expect(page.pageSize).toBe(1);
    });

    it('CURSOR 分页第一版拒绝', async () => {
      const response = await postGql({
        app,
        query: MY_LIST_QUERY,
        variables: { pagination: { mode: 'CURSOR', limit: 5 } },
        token: customerToken,
      }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(response.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_INVALID_PARAMS');
    });
  });

  describe('engineerRepairRequests 工程师两范围', () => {
    it('AVAILABLE 范围仅返回未删除且未接单的申请', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { scope: 'AVAILABLE', pagination: OFFSET_PAGINATION },
        token: engineerToken,
      }).expect(200);

      expect(response.body.errors).toBeUndefined();
      const page = response.body.data.engineerRepairRequests;
      expect(page.items.map((item: { id: number }) => item.id)).toEqual([114, 111]);
      expect(page.items.every((item: { isAccepted: boolean }) => item.isAccepted === false)).toBe(
        true,
      );
    });

    it('MINE 范围仅返回本人已接单的申请', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { scope: 'MINE', pagination: OFFSET_PAGINATION },
        token: engineerToken,
      }).expect(200);

      const page = response.body.data.engineerRepairRequests;
      expect(page.items.map((item: { id: number }) => item.id)).toEqual([112]);
      expect(page.items[0].acceptedAt).not.toBeNull();
    });

    it('另一位工程师的 MINE 范围互不串扰', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { scope: 'MINE', pagination: OFFSET_PAGINATION },
        token: otherEngineerToken,
      }).expect(200);

      const page = response.body.data.engineerRepairRequests;
      expect(page.items.map((item: { id: number }) => item.id)).toEqual([115]);
    });

    it('非法范围字符串拒绝', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { scope: 'ALL', pagination: OFFSET_PAGINATION },
        token: engineerToken,
      }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(response.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_INVALID_PARAMS');
    });
  });

  describe('myRepairRequest / engineerRepairRequest 详情（按角色分入口）', () => {
    const getExpectedEngineerNickname = async (): Promise<string> => {
      const userInfo = await dataSource
        .getRepository(UserInfoEntity)
        .findOne({ where: { accountId: engineerAccountId } });
      const nickname = userInfo?.nickname?.trim();
      return nickname ? nickname : '工程师';
    };

    it('客户本人未接单申请可读（无回复时状态为空）', async () => {
      const response = await postGql({
        app,
        query: MY_DETAIL_QUERY,
        variables: { id: 111 },
        token: customerToken,
      }).expect(200);

      expect(response.body.errors).toBeUndefined();
      const detail = response.body.data.myRepairRequest;
      expect(detail).toMatchObject({
        id: 111,
        requestNo: 'E2E-RD-111',
        faultDescription: '未接单场景',
        contentMd: '# E2E-111',
        isAccepted: false,
        latestResolutionStatus: null,
        equipmentModel: { id: 41, modelCode: 'E2E-READ', modelName: '读模型型号' },
        responses: [],
      });
      expect(detail).not.toHaveProperty('customerAccountId');
    });

    it('客户本人已接单申请含回复时间线与工程师当前昵称（时间正序，末条状态为最新）', async () => {
      const expectedNickname = await getExpectedEngineerNickname();
      const response = await postGql({
        app,
        query: MY_DETAIL_QUERY,
        variables: { id: 112 },
        token: customerToken,
      }).expect(200);

      const detail = response.body.data.myRepairRequest;
      expect(detail.latestResolutionStatus).toBe('RESOLVED');
      expect(detail.responses.map((item: { id: number }) => item.id)).toEqual([121, 122]);
      expect(detail.responses[1]).toMatchObject({
        engineerNickname: expectedNickname,
        resolutionStatus: 'RESOLVED',
        responseText: '已更换部件，问题解决',
      });
    });

    it('工程师可读未接单申请与自己已接单的申请（工程师入口）', async () => {
      const awaiting = await postGql({
        app,
        query: ENGINEER_DETAIL_QUERY,
        variables: { id: 114 },
        token: engineerToken,
      }).expect(200);
      expect(awaiting.body.errors).toBeUndefined();
      expect(awaiting.body.data.engineerRepairRequest.id).toBe(114);

      const mine = await postGql({
        app,
        query: ENGINEER_DETAIL_QUERY,
        variables: { id: 112 },
        token: engineerToken,
      }).expect(200);
      expect(mine.body.errors).toBeUndefined();
      expect(mine.body.data.engineerRepairRequest.id).toBe(112);
    });

    it('客户访问他人申请 / 本人已删除申请统一拒绝（防探测）', async () => {
      const others = await postGql({
        app,
        query: MY_DETAIL_QUERY,
        variables: { id: 114 },
        token: customerToken,
      }).expect(200);
      expect(others.body.errors).toHaveLength(1);
      expectAccessDenied(others.body.errors[0]);

      const deleted = await postGql({
        app,
        query: MY_DETAIL_QUERY,
        variables: { id: 113 },
        token: customerToken,
      }).expect(200);
      expect(deleted.body.errors).toHaveLength(1);
      expectAccessDenied(deleted.body.errors[0]);
    });

    it('工程师访问他人已接单申请 / 不存在申请统一拒绝', async () => {
      const others = await postGql({
        app,
        query: ENGINEER_DETAIL_QUERY,
        variables: { id: 115 },
        token: engineerToken,
      }).expect(200);
      expect(others.body.errors).toHaveLength(1);
      expectAccessDenied(others.body.errors[0]);

      const missing = await postGql({
        app,
        query: ENGINEER_DETAIL_QUERY,
        variables: { id: 999999 },
        token: engineerToken,
      }).expect(200);
      expect(missing.body.errors).toHaveLength(1);
      expectAccessDenied(missing.body.errors[0]);
    });

    it('CUSTOMER 调工程师详情入口被守卫拒绝（入口按角色分开）', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_DETAIL_QUERY,
        variables: { id: 111 },
        token: customerToken,
      }).expect(200);

      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].extensions.code).toBe('FORBIDDEN');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('回复契约不再包含 engineerAccountId 字段（负责人裁定 3，查询未知字段拒绝）', async () => {
      const legacyQuery = `
        query MyRepairRequest($id: Int!) {
          myRepairRequest(id: $id) {
            responses { id engineerAccountId }
          }
        }
      `;
      const response = await postGql({
        app,
        query: legacyQuery,
        variables: { id: 112 },
        token: customerToken,
      });

      // 未知字段在 schema 校验阶段被拒（400 或 200+errors），且不返回数据
      expect([200, 400]).toContain(response.status);
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(JSON.stringify(response.body.errors)).toContain('engineerAccountId');
      expect(response.body.data ?? null).toBeNull();
    });
  });

  describe('SUPER_ADMIN 按角色继承规则准入（负责人 20260901 裁定 2）', () => {
    it('超管经工程师入口可读未接单申请（继承工程师访问能力）', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_DETAIL_QUERY,
        variables: { id: 111 },
        token: adminToken,
      }).expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.engineerRepairRequest.id).toBe(111);
    });

    it('超管继承工程师身份仍不可读他人已接单申请', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_DETAIL_QUERY,
        variables: { id: 115 },
        token: adminToken,
      }).expect(200);

      expect(response.body.errors).toHaveLength(1);
      expectAccessDenied(response.body.errors[0]);
    });

    it('超管经客户入口仅见本人名下申请（不可见客户申请）', async () => {
      const response = await postGql({
        app,
        query: MY_DETAIL_QUERY,
        variables: { id: 111 },
        token: adminToken,
      }).expect(200);

      expect(response.body.errors).toHaveLength(1);
      expectAccessDenied(response.body.errors[0]);
    });

    it('超管调工程师列表可见待接单池', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { scope: 'AVAILABLE', pagination: OFFSET_PAGINATION },
        token: adminToken,
      }).expect(200);

      expect(response.body.errors).toBeUndefined();
      const page = response.body.data.engineerRepairRequests;
      expect(page.items.map((item: { id: number }) => item.id)).toEqual([114, 111]);
    });
  });

  describe('端点守卫与未登录', () => {
    it('未登录访问读入口均返回 UNAUTHENTICATED', async () => {
      const myList = await postGql({
        app,
        query: MY_LIST_QUERY,
        variables: { pagination: OFFSET_PAGINATION },
      }).expect(200);
      expectUnauthenticated(myList.body.errors[0]);

      const engineerList = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { scope: 'AVAILABLE', pagination: OFFSET_PAGINATION },
      }).expect(200);
      expectUnauthenticated(engineerList.body.errors[0]);

      const myDetail = await postGql({
        app,
        query: MY_DETAIL_QUERY,
        variables: { id: 111 },
      }).expect(200);
      expectUnauthenticated(myDetail.body.errors[0]);

      const engineerDetail = await postGql({
        app,
        query: ENGINEER_DETAIL_QUERY,
        variables: { id: 111 },
      }).expect(200);
      expectUnauthenticated(engineerDetail.body.errors[0]);
    });

    it('角色互斥：CUSTOMER 调工程师列表 / ENGINEER 调客户列表均被拒', async () => {
      const customerAsEngineer = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { scope: 'AVAILABLE', pagination: OFFSET_PAGINATION },
        token: customerToken,
      }).expect(200);
      expect(customerAsEngineer.body.errors[0].extensions.code).toBe('FORBIDDEN');

      const engineerAsCustomer = await postGql({
        app,
        query: MY_LIST_QUERY,
        variables: { pagination: OFFSET_PAGINATION },
        token: engineerToken,
      }).expect(200);
      expect(engineerAsCustomer.body.errors[0].extensions.code).toBe('FORBIDDEN');

      const customerB = await postGql({
        app,
        query: MY_LIST_QUERY,
        variables: { pagination: OFFSET_PAGINATION },
        token: otherCustomerToken,
      }).expect(200);
      expect(customerB.body.errors).toBeUndefined();
      expect(customerB.body.data.myRepairRequests.items.map((i: { id: number }) => i.id)).toEqual([
        115, 114,
      ]);
    });
  });
});
