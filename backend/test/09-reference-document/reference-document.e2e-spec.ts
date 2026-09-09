// test/09-reference-document/reference-document.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { ReferenceDocumentEntity } from '@src/modules/lithography/entities/reference-document.entity';
import { REFERENCE_DOCUMENT_STORAGE } from '@src/usecases/reference-document/reference-document-storage.contract';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
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

// REST 上传/下载用运行级临时存储目录：先于 beforeAll 设置 env，使 config 加载时读到
// 本规格专属目录（不污染默认 var/）；finally 按精确路径清理（呼应 0909 阻塞 1 边界纪律）
const e2eStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'refdoc-e2e-storage-'));
process.env.REFERENCE_DOCUMENT_STORAGE_DIR = e2eStorageRoot;

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
      // 临时存储目录按精确路径清理，并还原环境变量避免泄漏到后续规格
      fs.rmSync(e2eStorageRoot, { recursive: true, force: true });
      delete process.env.REFERENCE_DOCUMENT_STORAGE_DIR;
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

    it('设备型号筛选：指定型号命中，通用资料与未匹配型号被排除', async () => {
      // 自建指定型号行（自增 ID 回查；971 已在前序用例软删，不依赖固定种子行）
      const createResponse = await postGql({
        app,
        query: CREATE_MUTATION,
        variables: {
          input: {
            title: 'E2E 型号筛选行',
            documentType: 'CHECKLIST',
            equipmentModelId: 43,
            description: null,
            contentText: '型号筛选链路验证',
          },
        },
        token: adminToken,
      }).expect(200);
      expect(createResponse.body.errors).toBeUndefined();
      const createdId = createResponse.body.data.createReferenceDocument.id as number;

      const listByModel = async (
        equipmentModelId: number,
      ): Promise<{ ids: number[]; total: number }> => {
        const response = await postGql({
          app,
          query: LIST_SEARCH_QUERY,
          variables: {
            pagination: { ...PAGE, withTotal: true },
            filter: { equipmentModelId },
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

      // 正向：指定型号 43 命中自建行
      const modelHit = await listByModel(43);
      expect(modelHit.ids).toContain(createdId);
      // 通用资料（无型号，972）不被型号筛选命中
      expect(modelHit.ids).not.toContain(972);
      // 反向：未匹配型号零结果
      const noModel = await listByModel(44);
      expect(noModel.ids).toEqual([]);
      expect(noModel.total).toBe(0);
    });

    it('数据库删除一致性约束：绕过应用层的非法软删状态被 DB 两个方向拒绝', async () => {
      // 方向一：已软删行（971，deprecated=1）不允许把 deleted_at 抹回 NULL
      await expect(
        dataSource.query('UPDATE reference_document SET deleted_at = NULL WHERE id = 971'),
      ).rejects.toThrow(/chk_reference_document_deletion_consistency/);

      // 方向二：未删行（972，deprecated=0）不允许只置 deprecated=1 而不写 deleted_at
      await expect(
        dataSource.query('UPDATE reference_document SET deprecated = 1 WHERE id = 972'),
      ).rejects.toThrow(/chk_reference_document_deletion_consistency/);

      // 约束拒绝为语句级回滚，972 数据不变
      const saved = await documentRepository.findOne({ where: { id: 972 } });
      expect(saved).toMatchObject({ deprecated: false });
      expect(saved?.deletedAt).toBeNull();
    });
  });

  /**
   * REST 文件上传/下载（0909 第二轮阻塞项 1）
   *
   * 用例顺序依赖：上传成功用例产生的行供后续下载/软删用例复用（
   * jest 默认按声明顺序串行执行）；存储目录为本规格专属临时目录，
   * finally 按精确路径清理。
   */
  describe('REST 文件上传/下载', () => {
    let uploadedDocumentId: number;
    let fileOnlyDocumentId: number;

    const upload = (
      token: string | null,
      fileName: string,
      buffer: Buffer,
      fields: Record<string, string> = {},
    ) => {
      const req = request(app.getHttpServer()).post('/api/reference-documents/upload');
      if (token) {
        req.set('Authorization', `Bearer ${token}`);
      }
      for (const [key, value] of Object.entries(fields)) {
        req.field(key, value);
      }
      return req.attach('file', buffer, fileName);
    };

    const download = (token: string | null, id: number) => {
      const req = request(app.getHttpServer()).get(`/api/reference-documents/${id}/download`);
      if (token) {
        req.set('Authorization', `Bearer ${token}`);
      }
      return req;
    };

    const storageFiles = (): string[] => fs.readdirSync(e2eStorageRoot).sort();

    it('SUPER_ADMIN 上传成功：引用格式/四列落库/物理文件字节一致', async () => {
      const response = await upload(adminToken, 'e2e-upload.pdf', Buffer.from('e2e-pdf-content'), {
        title: 'E2E REST 上传行',
        documentType: 'MANUAL',
        equipmentModelId: '43',
        description: 'REST 上传',
        contentText: '附带正文',
      }).expect(201);
      uploadedDocumentId = response.body.data.id as number;

      const row = await documentRepository.findOne({ where: { id: uploadedDocumentId } });
      expect(row).toMatchObject({
        title: 'E2E REST 上传行',
        originalFilename: 'e2e-upload.pdf',
        mimeType: 'application/pdf',
        storageBackend: 'local',
        contentText: '附带正文',
      });
      expect(row?.storageReference).toMatch(/^[0-9a-f]{32}\.pdf$/);
      expect(
        fs.readFileSync(path.join(e2eStorageRoot, row?.storageReference ?? '')).toString(),
      ).toBe('e2e-pdf-content');
    });

    it('仅文件创建（contentText 缺省）：落库 contentText 为 NULL，双空判定不误拦', async () => {
      const response = await upload(
        adminToken,
        'e2e-file-only.txt',
        Buffer.from('file-only-bytes'),
        { title: 'E2E 仅文件行', documentType: 'MANUAL' },
      ).expect(201);
      fileOnlyDocumentId = response.body.data.id as number;

      const row = await documentRepository.findOne({ where: { id: fileOnlyDocumentId } });
      expect(row).toMatchObject({
        contentText: null,
        originalFilename: 'e2e-file-only.txt',
        mimeType: 'text/plain',
        storageBackend: 'local',
      });
    });

    it('中文文件名上传：latin1 误码还原落库，下载文件名按 RFC 5987 正确编码', async () => {
      // supertest 以 UTF-8 字节写入 multipart filename，multer 按 latin1 解码——与浏览器行为一致；
      // 修复前此处落库即乱码，本用例端到端钉住还原链路
      const response = await upload(adminToken, 'E2E 中文报告.md', Buffer.from('中文内容'), {
        title: 'E2E 中文文件名行',
        documentType: 'MANUAL',
      }).expect(201);
      const chineseFilenameDocumentId = response.body.data.id as number;

      const row = await documentRepository.findOne({ where: { id: chineseFilenameDocumentId } });
      expect(row?.originalFilename).toBe('E2E 中文报告.md');
      expect(row?.mimeType).toBe('text/markdown');

      const downloaded = await download(adminToken, chineseFilenameDocumentId).expect(200);
      expect(downloaded.headers['content-disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent('E2E 中文报告.md')}`,
      );
      expect(downloaded.text).toBe('中文内容');
    });

    it('工程师/客户上传 403；匿名 401（REST 统一错误体）', async () => {
      const engineerRes = await upload(engineerToken, 'a.pdf', Buffer.from('x')).expect(403);
      expect(engineerRes.body.data).toMatchObject({
        statusCode: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
      const customerRes = await upload(customerToken, 'a.pdf', Buffer.from('x')).expect(403);
      expect(customerRes.body.data).toMatchObject({
        statusCode: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
      const anonRes = await upload(null, 'a.pdf', Buffer.from('x')).expect(401);
      expect(anonRes.body.data).toMatchObject({
        statusCode: 401,
        code: 'JWT_AUTHENTICATION_FAILED',
      });
    });

    it('白名单外扩展名 415（以扩展名为主判定，不信任客户端 MIME）', async () => {
      const response = await upload(adminToken, 'e2e-evil.exe', Buffer.from('MZ'), {
        title: 'E2E 非法类型行',
        documentType: 'MANUAL',
      }).expect(415);
      expect(response.body.data).toMatchObject({
        statusCode: 415,
        code: 'REFERENCE_DOCUMENT_UPLOAD_FILE_TYPE_NOT_ALLOWED',
      });
      // 不留 DB 记录
      const rows = await documentRepository.find({ where: { title: 'E2E 非法类型行' } });
      expect(rows).toHaveLength(0);
    });

    it('超过业务大小上限 413（multer 硬上限以下仍被业务校验拦截）', async () => {
      const oversized = Buffer.alloc(21 * 1024 * 1024);
      const response = await upload(adminToken, 'e2e-big.pdf', oversized, {
        title: 'E2E 超限行',
        documentType: 'MANUAL',
      }).expect(413);
      expect(response.body.data).toMatchObject({
        statusCode: 413,
        code: 'REFERENCE_DOCUMENT_UPLOAD_FILE_TOO_LARGE',
      });
      const rows = await documentRepository.find({ where: { title: 'E2E 超限行' } });
      expect(rows).toHaveLength(0);
    }, 60000);

    it('原子性（落库失败）：不存在型号 → 400，补偿删除不留孤儿文件、不留 DB 记录', async () => {
      const before = storageFiles();
      const response = await upload(adminToken, 'e2e-orphan.pdf', Buffer.from('orphan'), {
        title: 'E2E 原子性落库失败行',
        documentType: 'MANUAL',
        equipmentModelId: '999999',
      }).expect(400);
      expect(response.body.data).toMatchObject({
        statusCode: 400,
        code: 'REFERENCE_DOCUMENT_EQUIPMENT_MODEL_NOT_FOUND',
      });
      expect(storageFiles()).toEqual(before);
      const rows = await documentRepository.find({ where: { title: 'E2E 原子性落库失败行' } });
      expect(rows).toHaveLength(0);
    });

    it('原子性（存储失败）：save 抛错 → 500 CREATION_FAILED，不留 DB 记录', async () => {
      const storage = app.get(REFERENCE_DOCUMENT_STORAGE);
      const saveSpy = jest.spyOn(storage, 'save').mockRejectedValueOnce(new Error('disk failure'));

      try {
        const response = await upload(adminToken, 'e2e-disk-fail.pdf', Buffer.from('x'), {
          title: 'E2E 存储失败行',
          documentType: 'MANUAL',
        }).expect(500);
        expect(response.body.data).toMatchObject({
          statusCode: 500,
          code: 'REFERENCE_DOCUMENT_CREATION_FAILED',
        });
      } finally {
        saveSpy.mockRestore();
      }
      const rows = await documentRepository.find({ where: { title: 'E2E 存储失败行' } });
      expect(rows).toHaveLength(0);
    });

    it('三角色下载成功：Content-Type 取 DB MIME、RFC 5987 文件名、字节一致', async () => {
      // 落库名为 ASCII；改写为中文名以钉住含空格与 CJK 的 ext-value 编码链路
      await documentRepository.update(fileOnlyDocumentId, { originalFilename: 'E2E 报告.txt' });

      for (const token of [adminToken, engineerToken, customerToken]) {
        const response = await download(token, fileOnlyDocumentId).expect(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.headers['content-disposition']).toContain(
          `filename*=UTF-8''${encodeURIComponent('E2E 报告.txt')}`,
        );
        expect(response.text).toBe('file-only-bytes');
      }
    });

    it('匿名下载 401', async () => {
      const response = await download(null, fileOnlyDocumentId).expect(401);
      expect(response.body.data).toMatchObject({
        statusCode: 401,
        code: 'JWT_AUTHENTICATION_FAILED',
      });
    });

    it('已软删统一 404 NOT_FOUND（防删除状态探测，不物理删文件但拒绝下载）', async () => {
      await postGql({
        app,
        query: SOFT_DELETE_MUTATION,
        variables: { id: uploadedDocumentId },
        token: adminToken,
      }).expect(200);

      const response = await download(engineerToken, uploadedDocumentId).expect(404);
      expect(response.body.data).toMatchObject({
        statusCode: 404,
        code: 'REFERENCE_DOCUMENT_NOT_FOUND',
      });
    });

    it('伪格式/越界引用行不能读任意文件（404 FILE_NOT_AVAILABLE，不泄漏路径）', async () => {
      // 绕过应用层直接插入非法引用行（DB 层无引用格式约束，防线在存储实现 resolve）
      await documentRepository.save(
        documentRepository.create({
          title: 'E2E 伪引用行',
          documentType: 'MANUAL',
          contentText: null,
          originalFilename: 'evil.pdf',
          mimeType: 'application/pdf',
          storageBackend: 'LOCAL',
          storageReference: '../evil.pdf',
          createdByAccountId: adminAccountId,
          deprecated: false,
          deletedAt: null,
        }),
      );
      const row = await documentRepository.findOne({ where: { title: 'E2E 伪引用行' } });
      expect(row).toBeTruthy();

      const response = await download(engineerToken, row!.id).expect(404);
      expect(response.body.data).toMatchObject({
        statusCode: 404,
        code: 'REFERENCE_DOCUMENT_FILE_NOT_AVAILABLE',
        message: '该资料没有可下载的文件',
      });
      expect(JSON.stringify(response.body)).not.toContain('evil');
    });

    it('有效格式引用但存储对象缺失 → 404 FILE_NOT_AVAILABLE', async () => {
      await documentRepository.save(
        documentRepository.create({
          title: 'E2E 缺失文件行',
          documentType: 'MANUAL',
          contentText: null,
          originalFilename: 'missing.pdf',
          mimeType: 'application/pdf',
          storageBackend: 'LOCAL',
          storageReference: `${'0'.repeat(32)}.pdf`,
          createdByAccountId: adminAccountId,
          deprecated: false,
          deletedAt: null,
        }),
      );
      const row = await documentRepository.findOne({ where: { title: 'E2E 缺失文件行' } });

      const response = await download(customerToken, row!.id).expect(404);
      expect(response.body.data).toMatchObject({
        statusCode: 404,
        code: 'REFERENCE_DOCUMENT_FILE_NOT_AVAILABLE',
      });
    });

    it('存储文件被删后下载返回受控错误（404 FILE_NOT_AVAILABLE）', async () => {
      const response = await upload(adminToken, 'e2e-vanish.txt', Buffer.from('vanish-bytes'), {
        title: 'E2E 文件被删行',
        documentType: 'MANUAL',
      }).expect(201);
      const row = await documentRepository.findOne({
        where: { id: response.body.data.id as number },
      });
      // 按精确路径删除物理文件（模拟存储侧丢失，不批量扫描）
      fs.unlinkSync(path.join(e2eStorageRoot, row?.storageReference ?? ''));

      const gone = await download(engineerToken, row!.id).expect(404);
      expect(gone.body.data).toMatchObject({
        statusCode: 404,
        code: 'REFERENCE_DOCUMENT_FILE_NOT_AVAILABLE',
      });
    });
  });
});
