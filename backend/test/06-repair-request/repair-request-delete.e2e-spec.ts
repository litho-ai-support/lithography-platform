// test/06-repair-request/repair-request-delete.e2e-spec.ts
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

const DELETE_REPAIR_REQUEST_MUTATION = `
  mutation DeleteMyRepairRequest($id: Int!) {
    deleteMyRepairRequest(id: $id) { id requestNo }
  }
`;

const MY_REPAIR_REQUESTS_QUERY = `
  query MyRepairRequests($pagination: PaginationArgs!) {
    myRepairRequests(pagination: $pagination) { items { id requestNo } total }
  }
`;

/**
 * 客户删除维修申请 e2e（core 组）
 *
 * 与 repair-request-auth / flow / read 分工：本文件覆盖 deleteMyRepairRequest 端点，
 * 鉴权只回归守卫挂载（未登录 / 非客户角色），业务侧按负责人 20260901 裁定 5 钉住
 * 全部拒绝语义：不存在/非本人统一 NOT_FOUND（防探测）、已接单 CONFLICT、
 * 重复删除幂等成功；并验证软删除落库事实与列表可见性联动。
 * 业务拒绝分支的单元语义由 service/usecase 单测钉住，此处不重复展开。
 *
 * 造数固定主键（42 型号、141~144 申请），依赖 global-setup-e2e 的全表 TRUNCATE
 * 保证无冲突；各用例操作不同主键互不干扰，幂等用例对 141 顺序复用。
 */
describe('客户删除维修申请 (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let modelRepository: Repository<EquipmentModelEntity>;
  let requestRepository: Repository<RepairRequestEntity>;
  let customerToken: string;
  let engineerToken: string;
  let adminToken: string;

  const deleteMutation = (id: number, token: string) =>
    postGql({
      app,
      query: DELETE_REPAIR_REQUEST_MUTATION,
      variables: { id },
      token,
    });

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

    // 清理顺序：先删申请（customer_account_id 外键 RESTRICT 指向账号），再删账号、型号
    await requestRepository.createQueryBuilder().delete().execute();
    await cleanupTestAccounts(dataSource);
    await modelRepository.createQueryBuilder().delete().execute();

    await seedTestAccounts({
      dataSource,
      createAccountUsecase: app.get(CreateAccountUsecase),
      includeKeys: ['staff', 'guestPrimary', 'guestSecondary', 'admin'],
    });
    customerToken = await login({
      app,
      loginName: testAccountsConfig.guestPrimary.loginName,
      loginPassword: testAccountsConfig.guestPrimary.loginPassword,
    });
    engineerToken = await login({
      app,
      loginName: testAccountsConfig.staff.loginName,
      loginPassword: testAccountsConfig.staff.loginPassword,
    });
    adminToken = await login({
      app,
      loginName: testAccountsConfig.admin.loginName,
      loginPassword: testAccountsConfig.admin.loginPassword,
    });
    const customerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.guestPrimary.loginName,
    );
    const otherCustomerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.guestSecondary.loginName,
    );
    const engineerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.staff.loginName,
    );

    await modelRepository.save(
      modelRepository.create([
        { id: 42, modelCode: 'E2E-DEL', modelName: '删除链路型号', enabled: true, sortOrder: 1 },
      ]),
    );
    // 141 客户甲未接单（happy path 删除目标，幂等用例顺序复用）；
    // 142 客户甲已接单（CONFLICT）；143 客户乙未接单 / 144 客户乙已接单（防探测）
    await requestRepository.save(
      requestRepository.create([
        {
          id: 141,
          requestNo: 'E2E-DEL-141',
          customerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3001',
          faultDescription: '删除成功场景',
          contentMd: '# E2E-DEL-141',
          createdAt: new Date('2026-08-30T01:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 142,
          requestNo: 'E2E-DEL-142',
          customerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3002',
          faultDescription: '已接单删除拒绝场景',
          contentMd: '# E2E-DEL-142',
          createdAt: new Date('2026-08-30T02:00:00.000Z'),
          isAccepted: true,
          acceptedByEngineerAccountId: engineerAccountId,
          acceptedAt: new Date('2026-08-30T03:00:00.000Z'),
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 143,
          requestNo: 'E2E-DEL-143',
          customerAccountId: otherCustomerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3003',
          faultDescription: '他人未接单防探测场景',
          contentMd: '# E2E-DEL-143',
          createdAt: new Date('2026-08-30T04:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 144,
          requestNo: 'E2E-DEL-144',
          customerAccountId: otherCustomerAccountId,
          equipmentModelId: 42,
          errorCode: 'E-3004',
          faultDescription: '他人已接单防探测场景',
          contentMd: '# E2E-DEL-144',
          createdAt: new Date('2026-08-30T05:00:00.000Z'),
          isAccepted: true,
          acceptedByEngineerAccountId: engineerAccountId,
          acceptedAt: new Date('2026-08-30T06:00:00.000Z'),
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

  describe('端点鉴权（守卫挂载回归）', () => {
    it('未登录应返回 UNAUTHENTICATED', async () => {
      const response = await postGql({
        app,
        query: DELETE_REPAIR_REQUEST_MUTATION,
        variables: { id: 141 },
      }).expect(200);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('ENGINEER 应返回 FORBIDDEN（requiredRoles 仅 CUSTOMER）', async () => {
      const response = await deleteMutation(141, engineerToken).expect(200);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].extensions.code).toBe('FORBIDDEN');
      expect(response.body.errors[0].extensions.details).toMatchObject({
        requiredRoles: ['CUSTOMER'],
        userRoles: ['ENGINEER'],
      });
    });

    it('SUPER_ADMIN 应返回 FORBIDDEN（裁定 2：超管不以客户身份删除）', async () => {
      const response = await deleteMutation(141, adminToken).expect(200);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].extensions.code).toBe('FORBIDDEN');
      expect(response.body.errors[0].extensions.details).toMatchObject({
        requiredRoles: ['CUSTOMER'],
        userRoles: ['SUPER_ADMIN'],
      });
    });
  });

  describe('业务语义（裁定 5）', () => {
    it('删除本人未接单申请成功，落库为软删除且从列表消失', async () => {
      const response = await deleteMutation(141, customerToken).expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.deleteMyRepairRequest).toEqual({
        id: 141,
        requestNo: 'E2E-DEL-141',
      });

      const row = await requestRepository.findOne({ where: { id: 141 } });
      expect(row).not.toBeNull();
      expect(row!.deprecated).toBe(true);
      expect(row!.deletedAt).not.toBeNull();
      expect(row!.isAccepted).toBe(false);

      // 列表可见性联动：已删申请不再出现，其他申请不受影响
      const list = await postGql({
        app,
        query: MY_REPAIR_REQUESTS_QUERY,
        variables: { pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true } },
        token: customerToken,
      }).expect(200);
      expect(list.body.errors).toBeUndefined();
      const ids = list.body.data.myRepairRequests.items.map((item: { id: number }) => item.id);
      expect(ids).not.toContain(141);
      expect(ids).toContain(142);
    });

    it('重复删除同一申请幂等成功，返回与首次一致的结果', async () => {
      const response = await deleteMutation(141, customerToken).expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.deleteMyRepairRequest).toEqual({
        id: 141,
        requestNo: 'E2E-DEL-141',
      });
    });

    it('删除不存在的申请返回 NOT_FOUND', async () => {
      const response = await deleteMutation(999999, customerToken).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('NOT_FOUND');
      expect(response.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_NOT_FOUND');
    });

    it.each([
      [143, '他人未接单'],
      [144, '他人已接单'],
    ])('删除%s的申请统一返回 NOT_FOUND（防探测，不泄露存在性与状态）', async (otherRequestId) => {
      const response = await deleteMutation(otherRequestId, customerToken).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('NOT_FOUND');
      expect(response.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_NOT_FOUND');
      // 防探测基准：他人可删除状态的申请也不被误删
      const row = await requestRepository.findOne({ where: { id: otherRequestId } });
      expect(row!.deprecated).toBe(false);
    });

    it('删除本人已接单申请返回 CONFLICT 且落库未变（接单/删除互斥）', async () => {
      const response = await deleteMutation(142, customerToken).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('CONFLICT');
      expect(response.body.errors[0].extensions.errorCode).toBe('REPAIR_REQUEST_ALREADY_ACCEPTED');

      const row = await requestRepository.findOne({ where: { id: 142 } });
      expect(row!.deprecated).toBe(false);
      expect(row!.deletedAt).toBeNull();
      expect(row!.isAccepted).toBe(true);
    });
  });
});
