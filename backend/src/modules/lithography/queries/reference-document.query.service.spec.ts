// src/modules/lithography/queries/reference-document.query.service.spec.ts

import type { EntityManager } from 'typeorm';

import { REFERENCE_DOCUMENT_ERROR } from '@core/common/errors/domain-error';
import { createTypeOrmPersistenceTransactionContext } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { ReferenceDocumentEntity } from '../entities/reference-document.entity';
import { EquipmentModelEntity } from '../entities/equipment-model.entity';
import { ReferenceDocumentQueryService } from './reference-document.query.service';

const makeDocumentRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
  findOne: jest.fn().mockResolvedValue(null),
});

const makeModelRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

const documentEntity = (overrides: Partial<ReferenceDocumentEntity> = {}) => ({
  id: 970001,
  title: '错误码手册',
  documentType: 'ERROR_CODE_MANUAL',
  equipmentModelId: 930001,
  description: '说明',
  originalFilename: null,
  mimeType: null,
  contentText: 'E-CHUCK-101',
  storageBackend: null,
  storageReference: null,
  createdByAccountId: 900001,
  deprecated: false,
  deletedAt: null,
  createdAt: new Date('2026-01-02T10:00:00.000Z'),
  updatedAt: new Date('2026-01-02T10:00:00.000Z'),
  ...overrides,
});

const modelEntity = (overrides: Partial<EquipmentModelEntity> = {}) =>
  ({
    id: 930001,
    modelCode: 'ASML-TWINSCAN-NXT-1980DI',
    modelName: 'NXT:1980Di',
    enabled: true,
    ...overrides,
  }) as unknown as EquipmentModelEntity;

describe('ReferenceDocumentQueryService', () => {
  const pagination = { page: 1, pageSize: 10, withTotal: true };

  /** 读取 TypeORM FindOperator 私有字段（Raw 的注入参数 / In 的值集合），索引访问避免命名约定冲突 */
  const findOperatorField = (whereClause: unknown, key: string): unknown =>
    (whereClause as Record<string, unknown>)[key];

  it('列表默认仅未软删（deprecated = 0），固定排序与 OFFSET 分页透传', async () => {
    const documentRepo = makeDocumentRepo();
    const modelRepo = makeModelRepo();
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    await service.listDocuments({ filter: {}, pagination });

    expect(documentRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deprecated: false },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: 0,
        take: 10,
      }),
    );
    expect(documentRepo.count).toHaveBeenCalledWith({ where: { deprecated: false } });
  });

  it('withTotal 为 false 时不执行 count 查询', async () => {
    const documentRepo = makeDocumentRepo();
    const modelRepo = makeModelRepo();
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    await service.listDocuments({
      filter: {},
      pagination: { page: 2, pageSize: 5, withTotal: false },
    });

    expect(documentRepo.count).not.toHaveBeenCalled();
    expect(documentRepo.find).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }));
  });

  it('非法分页参数（0/负数）在 QueryService 二级防御钳制，不产生负 skip/零 take SQL', async () => {
    const documentRepo = makeDocumentRepo();
    const modelRepo = makeModelRepo();
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    await service.listDocuments({
      filter: {},
      pagination: { page: 0, pageSize: -5, withTotal: true },
    });

    expect(documentRepo.find).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 1 }));
  });

  it('筛选条件透传：文档类型等值与设备型号等值；标题以 LIKE 模式注入', async () => {
    const documentRepo = makeDocumentRepo();
    const modelRepo = makeModelRepo();
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    await service.listDocuments({
      filter: { title: '手册', documentType: 'ERROR_CODE_MANUAL', equipmentModelId: 930001 },
      pagination,
    });

    const call = documentRepo.find.mock.calls[0][0];
    expect(call.where.documentType).toBe('ERROR_CODE_MANUAL');
    expect(call.where.equipmentModelId).toBe(930001);
    // 标题走 Raw LIKE；通配符转义由服务保证，断言注入的 pattern 参数
    const rawParams = findOperatorField(call.where.title, '_objectLiteralParameters') as {
      pattern?: string;
    };
    expect(rawParams.pattern).toBe('%手册%');
  });

  it('标题 LIKE 通配符转义：用户输入 % / _ 不扩大匹配范围', async () => {
    const documentRepo = makeDocumentRepo();
    const modelRepo = makeModelRepo();
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    await service.listDocuments({ filter: { title: '100%_a\\b' }, pagination });

    const call = documentRepo.find.mock.calls[0][0];
    const rawParams = findOperatorField(call.where.title, '_objectLiteralParameters') as {
      pattern?: string;
    };
    expect(rawParams.pattern).toBe('%100\\%\\_a\\\\b%');
  });

  it('列表装配：型号名称批量读取；通用资料型号名称为空；含创建人账号 ID 供 usecase 富集', async () => {
    const documentRepo = makeDocumentRepo();
    documentRepo.find.mockResolvedValue([
      documentEntity(),
      documentEntity({ id: 970003, equipmentModelId: null }),
    ]);
    const modelRepo = makeModelRepo();
    modelRepo.find.mockResolvedValue([modelEntity()]);
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    const page = await service.listDocuments({ filter: {}, pagination });

    // 批量型号查询用 In(...) FindOperator，内部值集合持有去重后的型号 ID
    const inValue = findOperatorField(
      (modelRepo.find.mock.calls[0][0] as { where: { id: unknown } }).where.id,
      '_value',
    );
    expect(inValue).toEqual([930001]);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: 970001,
      equipmentModelName: 'NXT:1980Di',
      createdByAccountId: 900001,
    });
    expect(page.items[1]).toMatchObject({
      id: 970003,
      equipmentModelId: null,
      equipmentModelName: null,
    });
    // 不携带 contentText 大字段与存储引用
    expect(page.items[0]).not.toHaveProperty('contentText');
    expect(page.items[0]).not.toHaveProperty('storageReference');
  });

  it('空列表不触发型号批量查询', async () => {
    const documentRepo = makeDocumentRepo();
    const modelRepo = makeModelRepo();
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    await service.listDocuments({ filter: {}, pagination });

    expect(modelRepo.find).not.toHaveBeenCalled();
  });

  it('详情返回完整元数据与文本内容；含内部装配字段 storageReference（DTO 视图由 usecase 剥离）、不含存储后端与服务器路径', async () => {
    const documentRepo = makeDocumentRepo();
    documentRepo.findOne.mockResolvedValue(
      documentEntity({ storageBackend: 'LOCAL', storageReference: 'mock/reference/a.pdf' }),
    );
    const modelRepo = makeModelRepo();
    modelRepo.findOne.mockResolvedValue(modelEntity());
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    const detail = await service.findDetail({ documentId: 970001 });

    expect(detail).toMatchObject({
      id: 970001,
      title: '错误码手册',
      equipmentModelName: 'NXT:1980Di',
      contentText: 'E-CHUCK-101',
      createdByAccountId: 900001,
      hasFile: true,
    });
    expect(detail).not.toHaveProperty('storageBackend');
    // storageReference 为内部装配字段，仅供下载用例定位文件；对外 DTO 视图由 usecase 层剥离
    expect(detail).toHaveProperty('storageReference', 'mock/reference/a.pdf');
  });

  it('hasFile 权威判定 = 存储引用非空：有文件名但无存储引用的行 hasFile=false（不承诺可下载）', async () => {
    const documentRepo = makeDocumentRepo();
    documentRepo.findOne.mockResolvedValue(
      documentEntity({ originalFilename: 'legacy.pdf', mimeType: 'application/pdf' }),
    );
    const modelRepo = makeModelRepo();
    modelRepo.findOne.mockResolvedValue(modelEntity());
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    const detail = await service.findDetail({ documentId: 970001 });

    expect(detail).toMatchObject({ originalFilename: 'legacy.pdf', hasFile: false });
  });

  it('不存在与已软删详情统一 NOT_FOUND，不区分错误表述（防删除状态探测）', async () => {
    const documentRepo = makeDocumentRepo();
    const modelRepo = makeModelRepo();
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);

    await expect(service.findDetail({ documentId: 999999 })).rejects.toMatchObject({
      code: REFERENCE_DOCUMENT_ERROR.NOT_FOUND,
      details: { id: 999999 },
    });

    documentRepo.findOne.mockResolvedValue(documentEntity({ deprecated: true }));
    await expect(service.findDetail({ documentId: 970004 })).rejects.toMatchObject({
      code: REFERENCE_DOCUMENT_ERROR.NOT_FOUND,
    });
  });

  it('findDetail 携带事务上下文时改用事务内 Repository 读取（写用例事务内读当前值）', async () => {
    const documentRepo = makeDocumentRepo();
    documentRepo.findOne.mockResolvedValue(documentEntity());
    const transactionRepo = makeDocumentRepo();
    transactionRepo.findOne.mockResolvedValue(documentEntity());
    const modelRepo = makeModelRepo();
    modelRepo.findOne.mockResolvedValue(modelEntity());
    const service = new ReferenceDocumentQueryService(documentRepo as never, modelRepo as never);
    const transactionContext = createTypeOrmPersistenceTransactionContext({
      getRepository: () => transactionRepo,
    } as unknown as EntityManager);

    await service.findDetail({ documentId: 970001, transactionContext });

    expect(transactionRepo.findOne).toHaveBeenCalledTimes(1);
    // 默认仓库不得被使用：事务内读取必须全部经由事务上下文
    expect(documentRepo.findOne).not.toHaveBeenCalled();
  });
});
