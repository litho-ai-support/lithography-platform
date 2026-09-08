// test/09-reference-document/reference-document.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { ReferenceDocumentEntity } from '@src/modules/lithography/entities/reference-document.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { getAccountIdByLoginName, login, postGql } from '../utils/e2e-graphql-utils';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

const LIST_QUERY = `
  query ReferenceDocuments($pagination: PaginationArgs!) {
    referenceDocuments(pagination: $pagination) {
      items { id title equipmentModelName creatorNickname }
      total
    }
  }
`;

const DETAIL_QUERY = `
  query ReferenceDocument($id: Int!) {
    referenceDocument(id: $id) { id title contentText mimeType originalFilename creatorNickname }
  }
`;

const CREATE_MUTATION = `
  mutation CreateReferenceDocument($input: CreateReferenceDocumentInput!) {
    createReferenceDocument(input: $input) { id }
  }
`;

const UPDATE_MUTATION = `
  mutation UpdateReferenceDocument($id: Int!, $input: UpdateReferenceDocumentInput!) {
    updateReferenceDocument(id: $id, input: $input) { id }
  }
`;

const SOFT_DELETE_MUTATION = `
  mutation SoftDeleteReferenceDocument($id: Int!) {
    softDeleteReferenceDocument(id: $id) { id }
  }
`;

const LIST_SEARCH_QUERY = `
  query ReferenceDocuments($pagination: PaginationArgs!, $filter: ReferenceDocumentFilterInput) {
    referenceDocuments(pagination: $pagination, filter: $filter) {
      items { id title }
      total
    }
  }
`;

/**
 * AI 参考资料库端点级回归（core 组）
 *
 * 鉴权只回归守卫挂载（未登录 / CUSTOMER 读也禁 / ENGINEER 只读 / SUPER_ADMIN 全通），
 * 权限口径为 0907.docx 任务二：读=ENGINEER+SUPER_ADMIN，写=仅 SUPER_ADMIN。
 * 业务侧钉住：已软删与不存在详情统一 NOT_FOUND（防删除状态探测）、
 * contentText 空白创建拒绝（本周仅文本内容来源）、非法型号友好错误，
 * 以及创建/编辑/软删的落库事实与列表可见性联动。
 * 分支语义由单测钉住的部分（部分提交合并、超长拒绝等）此处不重复。
 *
 * 造数固定主键（43 型号、971~973 资料），依赖 global-setup-e2e 的全表 TRUNCATE；
 * 创建路径使用自增 ID 的返回值回查，不与固定主键冲突。
 */
describe('AI 参考资料库 (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let modelRepository: Repository<EquipmentModelEntity>;
  let documentRepository: Repository<ReferenceDocumentEntity>;
  let adminToken: string;
  let engineerToken: string;
  let customerToken: string;
  let adminAccountId: number;

  const PAGE = { mode: 'OFFSET', page: 1, pageSize: 20 };

  const expectUnauthenticated = (error: unknown): void => {
    const err = error as { message: string; extensions: Record<string, unknown> };
    expect(err.extensions.code).toBe('UNAUTHENTICATED');
    expect(err.extensions.errorCode).toBe('JWT_AUTHENTICATION_FAILED');
  };

  const expectForbidden = (error: unknown, requiredRoles: string[], userRoles: string[]): void => {
    const err = error as { message: string; extensions: Record<string, unknown> };
    expect(err.message).toContain('缺少所需角色');
    expect(err.extensions.code).toBe('FORBIDDEN');
    expect(err.extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    expect(err.extensions.details).toMatchObject({ requiredRoles, userRoles });
  };

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);
    modelRepository = dataSource.getRepository(EquipmentModelEntity);
    documentRepository = dataSource.getRepository(ReferenceDocumentEntity);

    await app.init();

    // 清理顺序：先删资料（created_by_account_id / equipment_model_id 外键 RESTRICT），再删账号、型号
    await documentRepository.createQueryBuilder().delete().execute();
    await cleanupTestAccounts(dataSource);
    await modelRepository.createQueryBuilder().delete().execute();

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
    adminAccountId = await getAccountIdByLoginName(dataSource, testAccountsConfig.admin.loginName);

    await modelRepository.save(
      modelRepository.create([
        { id: 43, modelCode: 'E2E-REF', modelName: '资料库链路型号', enabled: true, sortOrder: 1 },
      ]),
    );
    // 971 指定型号 + storage 元数据（详情展示「后续版本提供」提示的数据形状）；
    // 972 通用资料无型号；973 已软删（列表不可见 + 详情统一 NOT_FOUND）
    await documentRepository.save(
      documentRepository.create([
        {
          id: 971,
          title: 'E2E 错误码手册',
          documentType: 'ERROR_CODE_MANUAL',
          equipmentModelId: 43,
          description: '端到端用',
          originalFilename: 'e2e-manual.pdf',
          mimeType: 'application/pdf',
          contentText: 'E-CHUCK-101',
          storageBackend: 'LOCAL',
          storageReference: 'e2e/reference-971.pdf',
          createdByAccountId: adminAccountId,
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 972,
          title: 'E2E 通用安全规范',
          documentType: 'SAFETY_SPEC',
          equipmentModelId: null,
          description: null,
          originalFilename: null,
          mimeType: null,
          contentText: '通用内容',
          storageBackend: null,
          storageReference: null,
          createdByAccountId: adminAccountId,
          deprecated: false,
          deletedAt: null,
        },
        {
          id: 973,
          title: 'E2E 已停用检查表',
          documentType: 'CHECKLIST',
          equipmentModelId: null,
          description: null,
          originalFilename: null,
          mimeType: null,
          contentText: '旧版内容',
          storageBackend: null,
          storageReference: null,
          createdByAccountId: adminAccountId,
          deprecated: true,
          deletedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ]),
    );
  }, 30000);

  afterAll(async () => {
    try {
      if (dataSource && dataSource.isInitialized) {
        await documentRepository.createQueryBuilder().delete().execute();
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

  describe('未登录（无 Token）', () => {
    it('五个端点全部返回 UNAUTHENTICATED', async () => {
      const queries = [
        { query: LIST_QUERY, variables: { pagination: PAGE } },
        { query: DETAIL_QUERY, variables: { id: 971 } },
        {
          query: CREATE_MUTATION,
          variables: { input: { title: 'x', documentType: 'MANUAL', contentText: 'y' } },
        },
        {
          query: UPDATE_MUTATION,
          variables: { id: 971, input: { title: 'x' } },
        },
        { query: SOFT_DELETE_MUTATION, variables: { id: 971 } },
      ];
      for (const item of queries) {
        const response = await postGql({ app, ...item }).expect(200);
        expect(response.body.errors).toHaveLength(1);
        expectUnauthenticated(response.body.errors[0]);
      }
    });
  });

  describe('CUSTOMER 读也禁（资料无归属概念，客户整体不参与）', () => {
    it('列表与详情 FORBIDDEN（requiredRoles 含 ENGINEER 与 SUPER_ADMIN）', async () => {
      const listResponse = await postGql({
        app,
        query: LIST_QUERY,
        variables: { pagination: PAGE },
        token: customerToken,
      }).expect(200);
      expect(listResponse.body.errors).toHaveLength(1);
      expectForbidden(listResponse.body.errors[0], ['ENGINEER', 'SUPER_ADMIN'], ['CUSTOMER']);

      const detailResponse = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 971 },
        token: customerToken,
      }).expect(200);
      expect(detailResponse.body.errors).toHaveLength(1);
      expectForbidden(detailResponse.body.errors[0], ['ENGINEER', 'SUPER_ADMIN'], ['CUSTOMER']);
    });

    it('直调三个写 Mutation FORBIDDEN（requiredRoles 仅 SUPER_ADMIN）', async () => {
      const cases = [
        {
          query: CREATE_MUTATION,
          variables: { input: { title: 'x', documentType: 'MANUAL', contentText: 'y' } },
        },
        { query: UPDATE_MUTATION, variables: { id: 971, input: { title: 'x' } } },
        { query: SOFT_DELETE_MUTATION, variables: { id: 971 } },
      ];
      for (const item of cases) {
        const response = await postGql({ app, ...item, token: customerToken }).expect(200);
        expect(response.body.errors).toHaveLength(1);
        expectForbidden(response.body.errors[0], ['SUPER_ADMIN'], ['CUSTOMER']);
      }
    });
  });

  describe('ENGINEER 只读（docx 第一版工程师不负责增删资料）', () => {
    it('列表与详情通过：含昵称富集与元数据，不出现已软删行', async () => {
      const listResponse = await postGql({
        app,
        query: LIST_QUERY,
        variables: { pagination: PAGE },
        token: engineerToken,
      }).expect(200);
      expect(listResponse.body.errors).toBeUndefined();
      const items = listResponse.body.data.referenceDocuments.items as Array<{
        id: number;
        creatorNickname: string;
      }>;
      expect(items.map((item) => item.id)).toEqual([972, 971]);
      expect(items[0].creatorNickname).toBe('testadmin_nickname');
      expect(items).toHaveLength(2);

      const detailResponse = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 971 },
        token: engineerToken,
      }).expect(200);
      expect(detailResponse.body.errors).toBeUndefined();
      expect(detailResponse.body.data.referenceDocument).toMatchObject({
        id: 971,
        contentText: 'E-CHUCK-101',
        mimeType: 'application/pdf',
        originalFilename: 'e2e-manual.pdf',
      });
    });

    it('三个写 Mutation FORBIDDEN', async () => {
      const cases = [
        {
          query: CREATE_MUTATION,
          variables: { input: { title: 'x', documentType: 'MANUAL', contentText: 'y' } },
        },
        { query: UPDATE_MUTATION, variables: { id: 971, input: { title: 'x' } } },
        { query: SOFT_DELETE_MUTATION, variables: { id: 971 } },
      ];
      for (const item of cases) {
        const response = await postGql({ app, ...item, token: engineerToken }).expect(200);
        expect(response.body.errors).toHaveLength(1);
        expectForbidden(response.body.errors[0], ['SUPER_ADMIN'], ['ENGINEER']);
      }
    });
  });

  describe('SUPER_ADMIN 全通与业务分支', () => {
    it('列表通过且已软删 973 不出现（withTotal 只计未软删）', async () => {
      const response = await postGql({
        app,
        query: LIST_QUERY,
        variables: { pagination: { ...PAGE, withTotal: true } },
        token: adminToken,
      }).expect(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.referenceDocuments.total).toBe(2);
      const items = response.body.data.referenceDocuments.items as Array<{ id: number }>;
      expect(items.map((item) => item.id)).toEqual([972, 971]);
    });

    it('已软删与不存在详情统一 NOT_FOUND（防删除状态探测）', async () => {
      for (const id of [973, 999999]) {
        const response = await postGql({
          app,
          query: DETAIL_QUERY,
          variables: { id },
          token: adminToken,
        }).expect(200);
        const err = response.body.errors[0] as {
          extensions: Record<string, unknown>;
        };
        expect(err.extensions.code).toBe('NOT_FOUND');
        expect(err.extensions.errorCode).toBe('REFERENCE_DOCUMENT_NOT_FOUND');
      }
    });

    it('contentText 空白创建拒绝（本周仅文本内容来源，双空必须失败）', async () => {
      const response = await postGql({
        app,
        query: CREATE_MUTATION,
        variables: {
          input: { title: 'E2E 空白', documentType: 'MANUAL', contentText: '   ' },
        },
        token: adminToken,
      }).expect(200);
      const err = response.body.errors[0] as { extensions: Record<string, unknown> };
      expect(err.extensions.errorCode).toBe('REFERENCE_DOCUMENT_INVALID_PARAMS');
    });

    it('非法设备型号创建拒绝（EQUIPMENT_MODEL_NOT_FOUND）', async () => {
      const response = await postGql({
        app,
        query: CREATE_MUTATION,
        variables: {
          input: {
            title: 'E2E 非法型号',
            documentType: 'MANUAL',
            equipmentModelId: 999999,
            contentText: '内容',
          },
        },
        token: adminToken,
      }).expect(200);
      const err = response.body.errors[0] as { extensions: Record<string, unknown> };
      expect(err.extensions.errorCode).toBe('REFERENCE_DOCUMENT_EQUIPMENT_MODEL_NOT_FOUND');
    });

    it('创建成功：返回 ID 且落库事实正确（创建人取自 Session、初始未软删），列表可见', async () => {
      const response = await postGql({
        app,
        query: CREATE_MUTATION,
        variables: {
          input: {
            title: 'E2E 新增资料',
            documentType: 'MANUAL',
            equipmentModelId: 43,
            contentText: '新增内容',
          },
        },
        token: adminToken,
      }).expect(200);
      expect(response.body.errors).toBeUndefined();
      const createdId = response.body.data.createReferenceDocument.id as number;

      const saved = await documentRepository.findOne({ where: { id: createdId } });
      expect(saved).toMatchObject({
        title: 'E2E 新增资料',
        equipmentModelId: 43,
        createdByAccountId: adminAccountId,
        deprecated: false,
        deletedAt: null,
      });

      const listResponse = await postGql({
        app,
        query: LIST_QUERY,
        variables: { pagination: PAGE },
        token: adminToken,
      }).expect(200);
      const items = listResponse.body.data.referenceDocuments.items as Array<{ id: number }>;
      expect(items.map((item) => item.id)).toContain(createdId);
    });

    it('编辑部分提交：title 更新而 contentText 保持原值（落库断言）', async () => {
      const updateResponse = await postGql({
        app,
        query: UPDATE_MUTATION,
        variables: { id: 971, input: { title: 'E2E 错误码手册（已修订）' } },
        token: adminToken,
      }).expect(200);
      expect(updateResponse.body.errors).toBeUndefined();

      const saved = await documentRepository.findOne({ where: { id: 971 } });
      expect(saved).toMatchObject({
        title: 'E2E 错误码手册（已修订）',
        contentText: 'E-CHUCK-101',
        deprecated: false,
      });
    });

    it('编辑显式 null 清空型号与说明（PATCH 语义落库断言）；必填 title null 拒绝且不落库', async () => {
      const clearResponse = await postGql({
        app,
        query: UPDATE_MUTATION,
        variables: { id: 971, input: { equipmentModelId: null, description: null } },
        token: adminToken,
      }).expect(200);
      expect(clearResponse.body.errors).toBeUndefined();

      const cleared = await documentRepository.findOne({ where: { id: 971 } });
      expect(cleared).toMatchObject({
        equipmentModelId: null,
        description: null,
        title: 'E2E 错误码手册（已修订）',
        contentText: 'E-CHUCK-101',
      });

      const nullTitleResponse = await postGql({
        app,
        query: UPDATE_MUTATION,
        variables: { id: 971, input: { title: null } },
        token: adminToken,
      }).expect(200);
      expect(nullTitleResponse.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(nullTitleResponse.body.errors[0].extensions.errorCode).toBe(
        'REFERENCE_DOCUMENT_INVALID_PARAMS',
      );
      // 拒绝后落库不变：title 未被置空
      const afterReject = await documentRepository.findOne({ where: { id: 971 } });
      expect(afterReject?.title).toBe('E2E 错误码手册（已修订）');
    });

    it('编辑指定不存在型号统一 NOT_FOUND + errorCode 细化（前端 model-not-found 映射的契约来源）；落库不受影响', async () => {
      const updateResponse = await postGql({
        app,
        query: UPDATE_MUTATION,
        variables: { id: 971, input: { equipmentModelId: 999999 } },
        token: adminToken,
      }).expect(200);
      expect(updateResponse.body.errors[0].extensions.code).toBe('NOT_FOUND');
      expect(updateResponse.body.errors[0].extensions.errorCode).toBe(
        'REFERENCE_DOCUMENT_EQUIPMENT_MODEL_NOT_FOUND',
      );

      const saved = await documentRepository.findOne({ where: { id: 971 } });
      expect(saved?.equipmentModelId).toBeNull();
    });

    it('软删除：deprecated 与 deleted_at 同步落库，列表不再可见', async () => {
      const deleteResponse = await postGql({
        app,
        query: SOFT_DELETE_MUTATION,
        variables: { id: 971 },
        token: adminToken,
      }).expect(200);
      expect(deleteResponse.body.errors).toBeUndefined();

      const saved = await documentRepository.findOne({ where: { id: 971 } });
      expect(saved).toMatchObject({ deprecated: true });
      expect(saved?.deletedAt).not.toBeNull();

      const detailResponse = await postGql({
        app,
        query: DETAIL_QUERY,
        variables: { id: 971 },
        token: adminToken,
      }).expect(200);
      expect(detailResponse.body.errors[0].extensions.errorCode).toBe(
        'REFERENCE_DOCUMENT_NOT_FOUND',
      );
    });

    it('标题模糊搜索：子串命中、无关键词零结果、通配符按字面匹配不扩大范围', async () => {
      // 创建含 LIKE 通配符字面量的行（自增 ID，与固定主键不冲突；afterAll 全表清理）
      const createResponse = await postGql({
        app,
        query: CREATE_MUTATION,
        variables: {
          input: {
            title: 'E2E 搜索 100% 命中_行',
            documentType: 'CHECKLIST',
            equipmentModelId: null,
            description: null,
            contentText: '通配符转义链路验证',
          },
        },
        token: adminToken,
      }).expect(200);
      expect(createResponse.body.errors).toBeUndefined();
      const createdId = createResponse.body.data.createReferenceDocument.id as number;

      const searchByCreated = async (
        keyword: string | null,
      ): Promise<{
        ids: number[];
        total: number;
      }> => {
        const response = await postGql({
          app,
          query: LIST_SEARCH_QUERY,
          variables: {
            pagination: { ...PAGE, withTotal: true },
            filter: keyword === null ? undefined : { title: keyword },
          },
          token: adminToken,
        }).expect(200);
        expect(response.body.errors).toBeUndefined();
        const payload = response.body.data.referenceDocuments as {
          items: Array<{ id: number }>;
          total: number;
        };
        return { ids: payload.items.map((item) => item.id), total: payload.total };
      };

      // 正向：既有种子标题按子串命中（971 已在前序用例软删，取未软删的 972）
      const seedHit = await searchByCreated('安全规范');
      expect(seedHit.ids).toContain(972);

      // 正向：新建行按含 % 的子串字面命中
      const wildcardHit = await searchByCreated('100%');
      expect(wildcardHit.ids).toEqual([createdId]);

      // 通配符不扩大范围：搜「%」按字面匹配，只命中标题本身含 % 的行
      const percentOnly = await searchByCreated('%');
      expect(percentOnly.ids).toEqual([createdId]);

      // 反向：无命中关键词零结果
      const noHit = await searchByCreated('ZZZ_无此行_');
      expect(noHit.ids).toEqual([]);
      expect(noHit.total).toBe(0);
    });
  });
});
