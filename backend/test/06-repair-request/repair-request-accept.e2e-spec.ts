// test/06-repair-request/repair-request-accept.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { getAccountIdByLoginName, login, postGql } from '../utils/e2e-graphql-utils';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

const ACCEPT_MUTATION = `
  mutation AcceptRepairRequest($id: Int!) {
    acceptRepairRequest(id: $id) {
      id
      requestNo
      errorCode
      createdAt
      isAccepted
      acceptedAt
      latestResolutionStatus
      equipmentModel { id modelCode modelName }
      responses { id engineerNickname resolutionStatus responseText createdAt }
    }
  }
`;

const DELETE_MUTATION = `
  mutation DeleteMyRepairRequest($id: Int!) {
    deleteMyRepairRequest(id: $id) { id requestNo }
  }
`;

const ENGINEER_LIST_QUERY = `
  query EngineerRepairRequests($scope: String!, $pagination: PaginationArgs!) {
    engineerRepairRequests(scope: $scope, pagination: $pagination) {
      items { id isAccepted acceptedAt }
      total
    }
  }
`;

const OFFSET_PAGINATION = { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true };

/**
 * 工程师接单写链路回归（core 组）
 *
 * 与 read/flow spec 分工：本文件只覆盖 acceptRepairRequest Mutation：
 * - 成功路径：AVAILABLE → MINE、响应复用工程师详情读模型、
 *   数据库三个接单字段（is_accepted / accepted_by_engineer_account_id / accepted_at）
 *   与后端生成口径（接单人与时间均不可由客户端传入）
 * - 权限矩阵：CUSTOMER / SUPER_ADMIN / 未登录（写入口精确 ENGINEER，读继承不等于写继承）
 * - 错误分类：不存在/已删除 → NOT_FOUND；已接单（含本人重复接单）→ CONFLICT，文案中性
 * - 并发竞争：两名工程师抢单，以及客户删除与工程师接单竞争，数据库终态只能有一个赢家
 *
 * 造数固定主键（131~136 申请、42 型号），依赖 global-setup-e2e 的全表 TRUNCATE 保证无冲突。
 */
describe('工程师接单写链路 (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let modelRepository: Repository<EquipmentModelEntity>;
  let requestRepository: Repository<RepairRequestEntity>;
  let engineerToken: string;
  let otherEngineerToken: string;
  let customerToken: string;
  let adminToken: string;
  let engineerAccountId: number;
  let otherEngineerAccountId: number;

  const acceptMutation = (token: string | undefined, id: number) =>
    postGql({ app, query: ACCEPT_MUTATION, variables: { id }, token });

  const expectForbidden = (error: unknown): void => {
    const err = error as { extensions: Record<string, unknown> };
    expect(err.extensions.code).toBe('FORBIDDEN');
    expect(err.extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
  };

  const expectUnauthenticated = (error: unknown): void => {
    const err = error as { extensions: Record<string, unknown> };
    expect(err.extensions.code).toBe('UNAUTHENTICATED');
    expect(err.extensions.errorCode).toBe('JWT_AUTHENTICATION_FAILED');
  };

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);
    modelRepository = dataSource.getRepository(EquipmentModelEntity);
    requestRepository = dataSource.getRepository(RepairRequestEntity);

    await app.init();

    // 清理顺序：申请 → 账号 → 型号（外键 RESTRICT 方向）
    await requestRepository.createQueryBuilder().delete().execute();
    await cleanupTestAccounts(dataSource);
    await modelRepository.createQueryBuilder().delete().execute();

    await seedTestAccounts({
      dataSource,
      createAccountUsecase: app.get(CreateAccountUsecase),
      includeKeys: ['staff', 'staffSecondary', 'guestPrimary', 'admin'],
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
    customerToken = await login({
      app,
      loginName: testAccountsConfig.guestPrimary.loginName,
      loginPassword: testAccountsConfig.guestPrimary.loginPassword,
    });
    adminToken = await login({
      app,
      loginName: testAccountsConfig.admin.loginName,
      loginPassword: testAccountsConfig.admin.loginPassword,
    });
    engineerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.staff.loginName,
    );
    otherEngineerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.staffSecondary.loginName,
    );
    const customerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.guestPrimary.loginName,
    );

    await modelRepository.save(
      modelRepository.create({
        id: 42,
        modelCode: 'E2E-ACCEPT',
        modelName: '接单型号',
        enabled: true,
        sortOrder: 1,
      }),
    );
    // 131 未接单（成功路径目标）；132 已被工程师甲接单（冲突/重复接单目标）；
    // 133 已删除未接单（NOT_FOUND 目标）；134 未接单（权限拒绝目标，全程不产生写入）；
    // 135 未接单（并发竞争目标，测试内即时造数）
    await requestRepository.save(
      requestRepository.create([
        {
          id: 131,
          requestNo: 'E2E-AC-131',
          customerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3001',
          faultDescription: '接单成功场景',
          contentMd: '# E2E-131',
          createdAt: new Date('2026-08-30T01:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 132,
          requestNo: 'E2E-AC-132',
          customerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3002',
          faultDescription: '已被接单场景',
          contentMd: '# E2E-132',
          createdAt: new Date('2026-08-30T02:00:00.000Z'),
          isAccepted: true,
          acceptedByEngineerAccountId: engineerAccountId,
          acceptedAt: new Date('2026-08-30T03:00:00.000Z'),
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 133,
          requestNo: 'E2E-AC-133',
          customerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3003',
          faultDescription: '已删除场景',
          contentMd: '# E2E-133',
          createdAt: new Date('2026-08-30T04:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: true,
          deletedAt: new Date('2026-08-30T05:00:00.000Z'),
        },
        {
          id: 134,
          requestNo: 'E2E-AC-134',
          customerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3004',
          faultDescription: '权限拒绝场景',
          contentMd: '# E2E-134',
          createdAt: new Date('2026-08-30T06:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        },
      ]),
    );
  }, 60000);

  afterAll(async () => {
    try {
      if (dataSource && dataSource.isInitialized) {
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

  describe('权限矩阵', () => {
    it('CUSTOMER 调接单被守卫拒绝（写入口精确 ENGINEER）', async () => {
      const response = await acceptMutation(customerToken, 134).expect(200);

      expect(response.body.errors).toHaveLength(1);
      expectForbidden(response.body.errors[0]);

      const row = await requestRepository.findOneOrFail({ where: { id: 134 } });
      expect(row.isAccepted).toBe(false);
      expect(row.acceptedByEngineerAccountId).toBeNull();
      expect(row.acceptedAt).toBeNull();
    });

    it('SUPER_ADMIN 调接单被守卫拒绝（读权限继承不等于写权限继承）', async () => {
      const response = await acceptMutation(adminToken, 134).expect(200);

      expect(response.body.errors).toHaveLength(1);
      expectForbidden(response.body.errors[0]);

      const row = await requestRepository.findOneOrFail({ where: { id: 134 } });
      expect(row.isAccepted).toBe(false);
    });

    it('未登录调接单返回 UNAUTHENTICATED', async () => {
      const response = await acceptMutation(undefined, 134).expect(200);

      expect(response.body.errors).toHaveLength(1);
      expectUnauthenticated(response.body.errors[0]);
    });
  });

  describe('错误分类', () => {
    it('接单不存在的申请返回 NOT_FOUND', async () => {
      const response = await acceptMutation(engineerToken, 999999).expect(200);

      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].extensions.code).toBe('NOT_FOUND');
      expect(response.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_NOT_FOUND');
      // 前端契约依赖点：业务消息只读 extensions.errorMessage
      expect(typeof response.body.errors[0].extensions.errorMessage).toBe('string');
      expect(response.body.errors[0].extensions.errorMessage.length).toBeGreaterThan(0);
    });

    it('接单已删除的申请统一返回 NOT_FOUND（防探测，不区分不存在与已删除）', async () => {
      const response = await acceptMutation(engineerToken, 133).expect(200);

      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].extensions.code).toBe('NOT_FOUND');
      expect(response.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_NOT_FOUND');

      // 不产生写入：已删除申请的接单状态保持原样
      const row = await requestRepository.findOneOrFail({ where: { id: 133 } });
      expect(row.isAccepted).toBe(false);
      expect(row.acceptedByEngineerAccountId).toBeNull();
    });

    it('接单已被他人接单的申请返回 CONFLICT', async () => {
      const response = await acceptMutation(otherEngineerToken, 132).expect(200);

      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].extensions.code).toBe('CONFLICT');
      expect(response.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_ALREADY_ACCEPTED');

      // 冲突不覆盖原接单人
      const row = await requestRepository.findOneOrFail({ where: { id: 132 } });
      expect(row.acceptedByEngineerAccountId).toBe(engineerAccountId);
    });

    it('本人重复接单同样 CONFLICT，文案与他人的接单冲突中性一致', async () => {
      const selfResponse = await acceptMutation(engineerToken, 132).expect(200);
      const otherResponse = await acceptMutation(otherEngineerToken, 132).expect(200);

      const selfError = selfResponse.body.errors[0];
      const otherError = otherResponse.body.errors[0];
      expect(selfError.extensions.code).toBe('CONFLICT');
      expect(selfError.extensions.errorCode).toBe('REPAIR_REQUEST_ALREADY_ACCEPTED');
      // 中性文案：不区分本人重复接单与他人接单，不泄漏接单工程师身份
      expect(selfError.extensions.errorMessage).toBe(otherError.extensions.errorMessage);
      // 错误 details 仅含 requestId，不含接单人与身份类字段
      expect(selfError.extensions.details).toEqual({ requestId: 132 });
      expect(JSON.stringify(selfError)).not.toContain('engineerAccountId');
    });
  });

  describe('成功路径（AVAILABLE → MINE）', () => {
    it('接单成功：响应复用工程师详情读模型，数据库三个接单字段正确', async () => {
      const response = await acceptMutation(engineerToken, 131).expect(200);

      expect(response.body.errors).toBeUndefined();
      const detail = response.body.data.acceptRepairRequest;
      expect(detail).toMatchObject({
        id: 131,
        requestNo: 'E2E-AC-131',
        isAccepted: true,
      });
      expect(detail.acceptedAt).not.toBeNull();
      // 接单成功后申请仍无回复，读模型字段齐全
      expect(detail.responses).toEqual([]);

      const row = await requestRepository.findOneOrFail({ where: { id: 131 } });
      expect(row.isAccepted).toBe(true);
      expect(row.acceptedByEngineerAccountId).toBe(engineerAccountId);
      expect(row.acceptedAt).not.toBeNull();
    });

    it('接单后 AVAILABLE 范围移除该申请，MINE 范围收录该申请', async () => {
      const available = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { scope: 'AVAILABLE', pagination: OFFSET_PAGINATION },
        token: engineerToken,
      }).expect(200);
      expect(
        available.body.data.engineerRepairRequests.items.some(
          (item: { id: number }) => item.id === 131,
        ),
      ).toBe(false);

      const mine = await postGql({
        app,
        query: ENGINEER_LIST_QUERY,
        variables: { scope: 'MINE', pagination: OFFSET_PAGINATION },
        token: engineerToken,
      }).expect(200);
      const mineItem = mine.body.data.engineerRepairRequests.items.find(
        (item: { id: number }) => item.id === 131,
      );
      expect(mineItem).toBeDefined();
      expect(mineItem.isAccepted).toBe(true);
      expect(mineItem.acceptedAt).not.toBeNull();
    });
  });

  describe('并发竞争', () => {
    it('两名工程师真实并发接单同一申请：仅一方成功，数据库最终只有一个接单人', async () => {
      const customerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.guestPrimary.loginName,
      );
      await requestRepository.save(
        requestRepository.create({
          id: 135,
          requestNo: 'E2E-AC-135',
          customerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3005',
          faultDescription: '并发竞争场景',
          contentMd: '# E2E-135',
          createdAt: new Date('2026-08-30T07:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        }),
      );

      // 同一事件循环真实并发发出两个 Mutation，不做任何先后编排
      const [first, second] = await Promise.all([
        acceptMutation(engineerToken, 135),
        acceptMutation(otherEngineerToken, 135),
      ]);

      const bodies = [first.body, second.body];
      const successBodies = bodies.filter((body) => body.data?.acceptRepairRequest);
      const conflictBodies = bodies.filter((body) => body.errors?.length > 0);

      // 恰好一方成功、一方冲突（胜负顺序不固定）
      expect(successBodies).toHaveLength(1);
      expect(conflictBodies).toHaveLength(1);
      expect(successBodies[0].data.acceptRepairRequest.isAccepted).toBe(true);
      expect(conflictBodies[0].errors[0].extensions.code).toBe('CONFLICT');
      expect(conflictBodies[0].errors[0].extensions.errorCode).toBe(
        'REPAIR_REQUEST_ALREADY_ACCEPTED',
      );

      // 数据库终态：有且仅有一个接单人；接单人 ID 不在响应 DTO 中（契约防泄漏），
      // 胜负与接单人身份以数据库为准，来自会话而非客户端传入
      const row = await requestRepository.findOneOrFail({ where: { id: 135 } });
      expect(row.isAccepted).toBe(true);
      expect([engineerAccountId, otherEngineerAccountId]).toContain(
        row.acceptedByEngineerAccountId,
      );
      expect(row.acceptedAt).not.toBeNull();
    });

    it('客户删除与工程师接单真实并发同一申请：仅一方成功，数据库终态互斥', async () => {
      const customerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.guestPrimary.loginName,
      );
      await requestRepository.save(
        requestRepository.create({
          id: 136,
          requestNo: 'E2E-AC-136',
          customerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3006',
          faultDescription: '删除与接单并发竞争场景',
          contentMd: '# E2E-136',
          createdAt: new Date('2026-08-30T08:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        }),
      );

      const [acceptResponse, deleteResponse] = await Promise.all([
        acceptMutation(engineerToken, 136),
        postGql({
          app,
          query: DELETE_MUTATION,
          variables: { id: 136 },
          token: customerToken,
        }),
      ]);

      const acceptSucceeded = Boolean(acceptResponse.body.data?.acceptRepairRequest);
      const deleteSucceeded = Boolean(deleteResponse.body.data?.deleteMyRepairRequest);
      expect(Number(acceptSucceeded) + Number(deleteSucceeded)).toBe(1);

      const row = await requestRepository.findOneOrFail({ where: { id: 136 } });
      if (acceptSucceeded) {
        expect(deleteResponse.body.errors[0].extensions.code).toBe('CONFLICT');
        expect(deleteResponse.body.errors[0].extensions.errorCode).toBe(
          'REPAIR_REQUEST_ALREADY_ACCEPTED',
        );
        expect(row).toMatchObject({
          isAccepted: true,
          acceptedByEngineerAccountId: engineerAccountId,
          deprecated: false,
          deletedAt: null,
        });
        expect(row.acceptedAt).not.toBeNull();
      } else {
        expect(acceptResponse.body.errors[0].extensions.code).toBe('NOT_FOUND');
        expect(acceptResponse.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_NOT_FOUND');
        expect(row).toMatchObject({
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: true,
        });
        expect(row.deletedAt).not.toBeNull();
      }

      expect(row.isAccepted && row.deprecated).toBe(false);
    });
  });
});
