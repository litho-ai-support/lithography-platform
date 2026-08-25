// test/06-repair-request/repair-request-flow.e2e-spec.ts
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

const EQUIPMENT_MODELS_QUERY = 'query { equipmentModels { id modelCode modelName } }';

const CREATE_REPAIR_REQUEST_MUTATION = `
  mutation CreateRepairRequest($input: CreateRepairRequestInput!) {
    createRepairRequest(input: $input) {
      id
      requestNo
      equipmentModelId
      errorCode
      faultDescription
      createdAt
      isAccepted
    }
  }
`;

/**
 * 维修申请业务流程回归（core 组）
 *
 * 与 repair-request-auth.e2e-spec.ts 分工：鉴权路径由后者覆盖，
 * 本文件覆盖 CUSTOMER 通过鉴权后的业务正路径与错误路径，
 * 并回归 @ValidateInput 装配（超长输入必须在 DTO 层被拒）。
 */
describe('维修申请业务流程 (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let modelRepository: Repository<EquipmentModelEntity>;
  let requestRepository: Repository<RepairRequestEntity>;
  let customerToken: string;

  const createMutation = (input: Record<string, unknown>) =>
    postGql({
      app,
      query: CREATE_REPAIR_REQUEST_MUTATION,
      variables: { input },
      token: customerToken,
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
  }, 30000);

  afterAll(async () => {
    try {
      if (dataSource && dataSource.isInitialized) {
        // 清理顺序：先删申请（customer_account_id 外键 RESTRICT 指向账号），再删账号；
        // 用无 WHERE 的 DELETE 而非 clear：clear 走 TRUNCATE，会被 ai_conversation 对 repair_request 的外键阻断
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

  beforeEach(async () => {
    // 清理顺序：先删申请（customer_account_id 外键 RESTRICT 指向账号），再删账号；
    // 用无 WHERE 的 DELETE 而非 clear：clear 走 TRUNCATE，会被 ai_conversation 对 repair_request 的外键阻断
    await requestRepository.createQueryBuilder().delete().execute();
    await cleanupTestAccounts(dataSource);
    await modelRepository.createQueryBuilder().delete().execute();
    await seedTestAccounts({
      dataSource,
      createAccountUsecase: app.get(CreateAccountUsecase),
      includeKeys: ['guestPrimary'],
    });
    customerToken = await login({
      app,
      loginName: testAccountsConfig.guestPrimary.loginName,
      loginPassword: testAccountsConfig.guestPrimary.loginPassword,
    });
  });

  const seedModels = (rows: Array<Partial<EquipmentModelEntity>>) =>
    modelRepository.save(modelRepository.create(rows));

  describe('equipmentModels 查询', () => {
    it('只返回启用型号并按 sortOrder 升序', async () => {
      await seedModels([
        { id: 11, modelCode: 'E2E-B', modelName: '型号B', sortOrder: 2, enabled: true },
        { id: 12, modelCode: 'E2E-A', modelName: '型号A', sortOrder: 1, enabled: true },
        { id: 13, modelCode: 'E2E-OFF', modelName: '已停用', sortOrder: 0, enabled: false },
      ]);

      const response = await postGql({
        app,
        query: EQUIPMENT_MODELS_QUERY,
        token: customerToken,
      }).expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.equipmentModels).toEqual([
        { id: 12, modelCode: 'E2E-A', modelName: '型号A' },
        { id: 11, modelCode: 'E2E-B', modelName: '型号B' },
      ]);
    });
  });

  describe('createRepairRequest 正路径', () => {
    it('创建成功且数据库记录与后端生成字段正确', async () => {
      await seedModels([{ id: 21, modelCode: 'E2E-OK', modelName: '可用型号', enabled: true }]);

      const response = await createMutation({
        equipmentModelId: 21,
        errorCode: 'E-2001',
        faultDescription: '双工件台干涉仪报错',
      }).expect(200);

      expect(response.body.errors).toBeUndefined();
      const result = response.body.data.createRepairRequest;
      expect(result.requestNo).toMatch(/^RR\d{14}[A-Z0-9]{6}$/);
      expect(result.equipmentModelId).toBe(21);
      expect(result.isAccepted).toBe(false);

      const row = await requestRepository.findOne({
        where: { requestNo: result.requestNo },
      });
      expect(row).not.toBeNull();
      const customerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.guestPrimary.loginName,
      );
      expect(row!.customerAccountId).toBe(customerAccountId);
      expect(row!.isAccepted).toBe(false);
      expect(row!.deprecated).toBe(false);
      expect(row!.acceptedByEngineerAccountId).toBeNull();
      expect(row!.contentMd).toContain(result.requestNo);
      expect(row!.contentMd).toContain('E-2001');
    });
  });

  describe('createRepairRequest 错误路径', () => {
    it('型号不存在时拒绝且不落库', async () => {
      const response = await createMutation({
        equipmentModelId: 999999,
        errorCode: 'E-2001',
        faultDescription: '型号不存在场景',
      }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('NOT_FOUND');
      expect(response.body.errors[0].extensions.errorCode).toBe(
        'REPAIR_REQUEST_EQUIPMENT_MODEL_NOT_FOUND',
      );
      expect(await requestRepository.count()).toBe(0);
    });

    it('型号已停用时拒绝且不落库', async () => {
      await seedModels([
        { id: 22, modelCode: 'E2E-DISABLED', modelName: '停用型号', enabled: false },
      ]);

      const response = await createMutation({
        equipmentModelId: 22,
        errorCode: 'E-2001',
        faultDescription: '型号停用场景',
      }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(response.body.errors[0].extensions.errorCode).toBe(
        'REPAIR_REQUEST_EQUIPMENT_MODEL_DISABLED',
      );
      expect(await requestRepository.count()).toBe(0);
    });

    it('错误码为空白时拒绝', async () => {
      await seedModels([{ id: 21, modelCode: 'E2E-OK', modelName: '可用型号', enabled: true }]);

      const response = await createMutation({
        equipmentModelId: 21,
        errorCode: '   ',
        faultDescription: '空白错误码场景',
      }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(response.body.errors[0].extensions.errorCode).toBe(
        'INPUT_NORMALIZE_REQUIRED_TEXT_EMPTY',
      );
    });

    it('错误码超 100 字符在 DTO 层被拒', async () => {
      const response = await createMutation({
        equipmentModelId: 21,
        errorCode: 'E'.repeat(101),
        faultDescription: '超长错误码场景',
      }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(response.body.errors[0].message).toContain('错误码不能超过 100 个字符');
    });

    it('故障描述超 5000 字符在 DTO 层被拒（@ValidateInput 装配回归）', async () => {
      const response = await createMutation({
        equipmentModelId: 21,
        errorCode: 'E-2001',
        faultDescription: '长'.repeat(5001),
      }).expect(200);

      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(response.body.errors[0].message).toContain('故障描述不能超过 5000 个字符');
    });
  });
});
