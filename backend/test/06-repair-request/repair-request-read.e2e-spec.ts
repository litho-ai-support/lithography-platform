// test/06-repair-request/repair-request-read.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { EngineerResponseEntity } from '@src/modules/lithography/entities/engineer-response.entity';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { EngineerResolutionStatus } from '@src/modules/lithography/lithography.types';
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
  query EngineerRepairRequests($view: String!, $pagination: PaginationArgs!) {
    engineerRepairRequests(view: $view, pagination: $pagination) {
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

const DETAIL_QUERY = `
  query RepairRequestDetail($id: Int!) {
    repairRequestDetail(id: $id) {
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
      responses { id engineerAccountId resolutionStatus responseText createdAt }
    }
  }
`;

const OFFSET_PAGINATION = { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true };

/**
 * 维修申请公共读模型回归（core 组）
 *
 * 覆盖对接方案第一~三节契约：
 * - 客户列表仅本人且未删除；工程师两视图（待接单 / 我的接单）
 * - 共用详情（含回复时间线、机型、末条处理状态口径）
 * - 双角色读权限矩阵 + 越权/已删除/不存在统一拒绝（防探测）
 * - 未登录与守卫角色准入；分页参数（OFFSET 强制、withTotal）
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

  describe('engineerRepairRequests 工程师两视图', () => {
    it('AWAITING 视图仅返回未删除且未接单的申请', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { view: 'AWAITING', pagination: OFFSET_PAGINATION },
        token: engineerToken,
      }).expect(200);

      expect(response.body.errors).toBeUndefined();
      const page = response.body.data.engineerRepairRequests;
      expect(page.items.map((item: { id: number }) => item.id)).toEqual([114, 111]);
      expect(page.items.every((item: { isAccepted: boolean }) => item.isAccepted === false)).toBe(
        true,
      );
    });

    it('MINE 视图仅返回本人已接单的申请', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { view: 'MINE', pagination: OFFSET_PAGINATION },
        token: engineerToken,
      }).expect(200);

      const page = response.body.data.engineerRepairRequests;
      expect(page.items.map((item: { id: number }) => item.id)).toEqual([112]);
      expect(page.items[0].acceptedAt).not.toBeNull();
    });

    it('另一位工程师的 MINE 视图互不串扰', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { view: 'MINE', pagination: OFFSET_PAGINATION },
        token: otherEngineerToken,
      }).expect(200);

      const page = response.body.data.engineerRepairRequests;
      expect(page.items.map((item: { id: number }) => item.id)).toEqual([115]);
    });

    it('非法视图字符串拒绝', async () => {
      const response = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { view: 'ALL', pagination: OFFSET_PAGINATION },
        token: engineerToken,
      }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(response.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_INVALID_PARAMS');
    });
  });

  describe('repairRequestDetail 共用详情', () => {
    it('客户本人未接单申请可读（无回复时状态为空）', async () => {
      const response = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 111 },
        token: customerToken,
      }).expect(200);

      expect(response.body.errors).toBeUndefined();
      const detail = response.body.data.repairRequestDetail;
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

    it('客户本人已接单申请含回复时间线（时间正序，末条状态为最新）', async () => {
      const response = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 112 },
        token: customerToken,
      }).expect(200);

      const detail = response.body.data.repairRequestDetail;
      expect(detail.latestResolutionStatus).toBe('RESOLVED');
      expect(detail.responses.map((item: { id: number }) => item.id)).toEqual([121, 122]);
      expect(detail.responses[1]).toMatchObject({
        engineerAccountId: engineerAccountId,
        resolutionStatus: 'RESOLVED',
        responseText: '已更换部件，问题解决',
      });
    });

    it('工程师可读未接单申请与自己已接单的申请', async () => {
      const awaiting = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 114 },
        token: engineerToken,
      }).expect(200);
      expect(awaiting.body.errors).toBeUndefined();
      expect(awaiting.body.data.repairRequestDetail.id).toBe(114);

      const mine = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 112 },
        token: engineerToken,
      }).expect(200);
      expect(mine.body.errors).toBeUndefined();
      expect(mine.body.data.repairRequestDetail.id).toBe(112);
    });

    it('客户访问他人申请 / 本人已删除申请统一拒绝（防探测）', async () => {
      const others = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 114 },
        token: customerToken,
      }).expect(200);
      expect(others.body.errors).toHaveLength(1);
      expectAccessDenied(others.body.errors[0]);

      const deleted = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 113 },
        token: customerToken,
      }).expect(200);
      expect(deleted.body.errors).toHaveLength(1);
      expectAccessDenied(deleted.body.errors[0]);
    });

    it('工程师访问他人已接单申请 / 不存在申请统一拒绝', async () => {
      const others = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 115 },
        token: engineerToken,
      }).expect(200);
      expect(others.body.errors).toHaveLength(1);
      expectAccessDenied(others.body.errors[0]);

      const missing = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 999999 },
        token: engineerToken,
      }).expect(200);
      expect(missing.body.errors).toHaveLength(1);
      expectAccessDenied(missing.body.errors[0]);
    });

    it('SUPER_ADMIN 第一版不继承读权限（守卫层拒绝）', async () => {
      const response = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 111 },
        token: adminToken,
      }).expect(200);

      expect(response.body.errors).toHaveLength(1);
      const err = response.body.errors[0];
      expect(err.extensions.code).toBe('FORBIDDEN');
      expect(err.extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('端点守卫与未登录', () => {
    it('未登录访问三个读入口均返回 UNAUTHENTICATED', async () => {
      const myList = await postGql({
        app,
        query: MY_LIST_QUERY,
        variables: { pagination: OFFSET_PAGINATION },
      }).expect(200);
      expectUnauthenticated(myList.body.errors[0]);

      const engineerList = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { view: 'AWAITING', pagination: OFFSET_PAGINATION },
      }).expect(200);
      expectUnauthenticated(engineerList.body.errors[0]);

      const detail = await postGql({ app, query: DETAIL_QUERY, variables: { id: 111 } }).expect(
        200,
      );
      expectUnauthenticated(detail.body.errors[0]);
    });

    it('角色互斥：CUSTOMER 调工程师列表 / ENGINEER 调客户列表均被拒', async () => {
      const customerAsEngineer = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { view: 'AWAITING', pagination: OFFSET_PAGINATION },
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
