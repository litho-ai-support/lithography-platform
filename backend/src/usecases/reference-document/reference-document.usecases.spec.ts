// src/usecases/reference-document/reference-document.usecases.spec.ts

/// <reference types="jest" />
import type { UsecaseSession } from '@app-types/auth/session.types';
import {
  DomainError,
  INPUT_NORMALIZE_ERROR,
  PERMISSION_ERROR,
  REFERENCE_DOCUMENT_ERROR,
} from '@core/common/errors/domain-error';
import type { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import type { EquipmentModelQueryService } from '@src/modules/lithography/queries/equipment-model.query.service';
import type { ReferenceDocumentQueryService } from '@src/modules/lithography/queries/reference-document.query.service';
import type { ReferenceDocumentService } from '@src/modules/lithography/reference-document.service';
import type { TransactionRunner } from '@src/usecases/common/ports/transaction-runner.contract';
import { CreateReferenceDocumentUsecase } from './create-reference-document.usecase';
import { GetReferenceDocumentDetailUsecase } from './get-reference-document-detail.usecase';
import { ListReferenceDocumentsUsecase } from './list-reference-documents.usecase';
import { SoftDeleteReferenceDocumentUsecase } from './soft-delete-reference-document.usecase';
import { UpdateReferenceDocumentUsecase } from './update-reference-document.usecase';

const makeQueryService = () => ({
  listDocuments: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 10 }),
  findDetail: jest.fn(),
});

const makeWriteService = () => ({
  insertDocument: jest.fn().mockResolvedValue({ id: 970101 }),
  updateDocument: jest.fn().mockResolvedValue({ id: 970001 }),
  softDeleteDocument: jest.fn().mockResolvedValue({ kind: 'DELETED', id: 970001 }),
});

const makeModelQueryService = () => ({
  findModelById: jest.fn().mockResolvedValue({ id: 930001, modelCode: 'M', modelName: '型号' }),
});

const makeAccountQueryService = () => ({
  findNicknamesByAccountIds: jest.fn().mockResolvedValue(new Map([[900001, '管理员甲']])),
});

const makeTransactionRunner = () =>
  ({
    run: jest.fn((cb: (ctx: unknown) => unknown) => cb({ transaction: 'mock' })),
  }) as unknown as TransactionRunner;

const session = (roles: string[]): UsecaseSession =>
  ({ accountId: 900001, roles, activeRole: roles[0] }) as UsecaseSession;

const detailQueryResult = (overrides: Record<string, unknown> = {}) => ({
  id: 970001,
  title: '错误码手册',
  documentType: 'ERROR_CODE_MANUAL',
  equipmentModelId: null,
  equipmentModelName: null,
  description: '说明',
  originalFilename: null,
  mimeType: null,
  contentText: '内容',
  createdByAccountId: 900001,
  createdAt: new Date('2026-01-02T10:00:00.000Z'),
  updatedAt: new Date('2026-01-02T10:00:00.000Z'),
  ...overrides,
});

describe('ListReferenceDocumentsUsecase', () => {
  it('工程师可读；OFFSET 分页透传，withTotal 缺省 false；筛选透传', async () => {
    const queryService = makeQueryService();
    const usecase = new ListReferenceDocumentsUsecase(
      queryService as unknown as ReferenceDocumentQueryService,
      makeAccountQueryService() as unknown as AccountQueryService,
    );

    await usecase.execute({
      session: session(['ENGINEER']),
      pagination: { mode: 'OFFSET', page: 2, pageSize: 5 },
      filter: { title: '手册', documentType: 'MANUAL', equipmentModelId: 930001 },
    });

    expect(queryService.listDocuments).toHaveBeenCalledWith({
      filter: { title: '手册', documentType: 'MANUAL', equipmentModelId: 930001 },
      pagination: { page: 2, pageSize: 5, withTotal: false },
    });
  });

  it('空白筛选词规范化为无筛选（与前端「空白搜索词=无筛选」口径一致，防字面量意外命中）', async () => {
    const queryService = makeQueryService();
    const usecase = new ListReferenceDocumentsUsecase(
      queryService as unknown as ReferenceDocumentQueryService,
      makeAccountQueryService() as unknown as AccountQueryService,
    );

    await usecase.execute({
      session: session(['ENGINEER']),
      pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
      filter: { title: '   ', documentType: '', equipmentModelId: 930001 },
    });

    expect(queryService.listDocuments).toHaveBeenCalledWith({
      filter: { title: undefined, documentType: undefined, equipmentModelId: 930001 },
      pagination: { page: 1, pageSize: 10, withTotal: false },
    });
  });

  it('SUPER_ADMIN 按角色继承规则准入读（hasRole 层级展开）', async () => {
    const queryService = makeQueryService();
    const usecase = new ListReferenceDocumentsUsecase(
      queryService as unknown as ReferenceDocumentQueryService,
      makeAccountQueryService() as unknown as AccountQueryService,
    );

    await expect(
      usecase.execute({
        session: session(['SUPER_ADMIN']),
        pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
        filter: {},
      }),
    ).resolves.toBeTruthy();
  });

  it('CUSTOMER 读被拒（INSUFFICIENT_PERMISSIONS，读侧不泄露其他信息）', async () => {
    const queryService = makeQueryService();
    const usecase = new ListReferenceDocumentsUsecase(
      queryService as unknown as ReferenceDocumentQueryService,
      makeAccountQueryService() as unknown as AccountQueryService,
    );

    await expect(
      usecase.execute({
        session: session(['CUSTOMER']),
        pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
        filter: {},
      }),
    ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
    expect(queryService.listDocuments).not.toHaveBeenCalled();
  });

  it('CURSOR 分页第一版拒绝；页大小超上限在用例层钳制为 100', async () => {
    const queryService = makeQueryService();
    const usecase = new ListReferenceDocumentsUsecase(
      queryService as unknown as ReferenceDocumentQueryService,
      makeAccountQueryService() as unknown as AccountQueryService,
    );

    await expect(
      usecase.execute({
        session: session(['ENGINEER']),
        pagination: { mode: 'CURSOR', limit: 5 },
        filter: {},
      }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });

    await usecase.execute({
      session: session(['ENGINEER']),
      pagination: { mode: 'OFFSET', page: 1, pageSize: 500 },
      filter: {},
    });
    expect(queryService.listDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagination: expect.objectContaining({ pageSize: 100 }) }),
    );
  });

  it('创建人昵称批量富集：账号 ID 不进入对外视图，缺失回落「未知用户」', async () => {
    const queryService = makeQueryService();
    queryService.listDocuments.mockResolvedValue({
      items: [detailQueryResult(), detailQueryResult({ id: 970003, createdByAccountId: 999999 })],
      page: 1,
      pageSize: 10,
      total: 2,
    });
    const accountQueryService = makeAccountQueryService();
    const usecase = new ListReferenceDocumentsUsecase(
      queryService as unknown as ReferenceDocumentQueryService,
      accountQueryService as unknown as AccountQueryService,
    );

    const result = await usecase.execute({
      session: session(['ENGINEER']),
      pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
      filter: {},
    });

    expect(accountQueryService.findNicknamesByAccountIds).toHaveBeenCalledWith([900001, 999999]);
    expect(result.items[0]).toMatchObject({ creatorNickname: '管理员甲' });
    expect(result.items[1]).toMatchObject({ creatorNickname: '未知用户' });
    expect(result.items[0]).not.toHaveProperty('createdByAccountId');
  });
});

describe('GetReferenceDocumentDetailUsecase', () => {
  it('工程师可读详情；昵称富集后账号 ID 不外泄', async () => {
    const queryService = makeQueryService();
    queryService.findDetail.mockResolvedValue(detailQueryResult());
    const usecase = new GetReferenceDocumentDetailUsecase(
      queryService as unknown as ReferenceDocumentQueryService,
      makeAccountQueryService() as unknown as AccountQueryService,
    );

    const result = await usecase.execute({
      session: session(['ENGINEER']),
      documentId: 970001,
    });

    expect(result).toMatchObject({ id: 970001, creatorNickname: '管理员甲' });
    expect(result).not.toHaveProperty('createdByAccountId');
  });

  it('资料 ID 非法拒绝；CUSTOMER 读取被拒', async () => {
    const queryService = makeQueryService();
    const usecase = new GetReferenceDocumentDetailUsecase(
      queryService as unknown as ReferenceDocumentQueryService,
      makeAccountQueryService() as unknown as AccountQueryService,
    );

    await expect(
      usecase.execute({ session: session(['ENGINEER']), documentId: 0 }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
    await expect(
      usecase.execute({ session: session(['CUSTOMER']), documentId: 970001 }),
    ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
    expect(queryService.findDetail).not.toHaveBeenCalled();
  });

  it('不存在/已软删（QueryService 统一 NOT_FOUND）原样上抛同码', async () => {
    const queryService = makeQueryService();
    queryService.findDetail.mockRejectedValue(
      new DomainError(REFERENCE_DOCUMENT_ERROR.NOT_FOUND, '参考资料不存在或不可访问', {
        id: 970004,
      }),
    );
    const usecase = new GetReferenceDocumentDetailUsecase(
      queryService as unknown as ReferenceDocumentQueryService,
      makeAccountQueryService() as unknown as AccountQueryService,
    );

    await expect(
      usecase.execute({ session: session(['ENGINEER']), documentId: 970004 }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.NOT_FOUND });
  });
});

describe('CreateReferenceDocumentUsecase', () => {
  const makeUsecase = (
    overrides: {
      writeService?: ReturnType<typeof makeWriteService>;
      modelQueryService?: ReturnType<typeof makeModelQueryService>;
    } = {},
  ) => {
    const writeService = overrides.writeService ?? makeWriteService();
    const modelQueryService = overrides.modelQueryService ?? makeModelQueryService();
    return {
      writeService,
      modelQueryService,
      usecase: new CreateReferenceDocumentUsecase(
        writeService as unknown as ReferenceDocumentService,
        modelQueryService as unknown as EquipmentModelQueryService,
        makeTransactionRunner(),
      ),
    };
  };

  const baseCommand = {
    title: '新资料',
    documentType: 'MANUAL',
    equipmentModelId: 930001,
    description: null,
    contentText: '内容',
  };

  it('SUPER_ADMIN 可创建：创建人取自 Session，事务内预检型号', async () => {
    const { usecase, writeService, modelQueryService } = makeUsecase();

    await expect(
      usecase.execute({ session: session(['SUPER_ADMIN']), ...baseCommand }),
    ).resolves.toEqual({ id: 970101 });
    expect(modelQueryService.findModelById).toHaveBeenCalledWith({
      id: 930001,
      transactionContext: { transaction: 'mock' },
    });
    expect(writeService.insertDocument).toHaveBeenCalledWith(
      expect.objectContaining({ createdByAccountId: 900001 }),
      { transaction: 'mock' },
    );
  });

  it('ENGINEER 写被拒（精确角色匹配，不层级展开——docx 第一版工程师不负责增删资料）', async () => {
    const { usecase, writeService } = makeUsecase();

    await expect(
      usecase.execute({ session: session(['ENGINEER']), ...baseCommand }),
    ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
    expect(writeService.insertDocument).not.toHaveBeenCalled();
  });

  it('contentText 空白拒绝（本周仅文本来源，双空创建必须失败）', async () => {
    const { usecase, writeService } = makeUsecase();

    await expect(
      usecase.execute({
        session: session(['SUPER_ADMIN']),
        ...baseCommand,
        contentText: '   ',
      }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
    expect(writeService.insertDocument).not.toHaveBeenCalled();
  });

  it('标题/类型空白与超长拒绝（标题 255、类型 100）', async () => {
    const { usecase } = makeUsecase();
    const admin = session(['SUPER_ADMIN']);

    await expect(
      usecase.execute({ session: admin, ...baseCommand, title: ' ' }),
    ).rejects.toMatchObject({ code: INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY });
    await expect(
      usecase.execute({ session: admin, ...baseCommand, title: 'a'.repeat(256) }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
    await expect(
      usecase.execute({ session: admin, ...baseCommand, documentType: 'a'.repeat(101) }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
  });

  it('非法设备型号拒绝（EQUIPMENT_MODEL_NOT_FOUND）；通用资料不查型号', async () => {
    const modelQueryService = makeModelQueryService();
    modelQueryService.findModelById.mockResolvedValue(null);
    const { usecase, writeService } = makeUsecase({ modelQueryService });

    await expect(
      usecase.execute({ session: session(['SUPER_ADMIN']), ...baseCommand }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.EQUIPMENT_MODEL_NOT_FOUND });

    // 数值型非法 ID（0/负数/非整数）在存在性预检之前就被拒绝，不触达型号查询
    for (const invalidId of [0, -1, 1.5]) {
      await expect(
        usecase.execute({
          session: session(['SUPER_ADMIN']),
          ...baseCommand,
          equipmentModelId: invalidId,
        }),
      ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
    }
    expect(modelQueryService.findModelById).toHaveBeenCalledTimes(1);

    await usecase.execute({
      session: session(['SUPER_ADMIN']),
      ...baseCommand,
      equipmentModelId: null,
    });
    expect(modelQueryService.findModelById).toHaveBeenCalledTimes(1);
    expect(writeService.insertDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ equipmentModelId: null }),
      expect.anything(),
    );
  });
});

describe('UpdateReferenceDocumentUsecase', () => {
  const makeUsecase = () => {
    const writeService = makeWriteService();
    const modelQueryService = makeModelQueryService();
    const queryService = makeQueryService();
    queryService.findDetail.mockResolvedValue(detailQueryResult());
    const usecase = new UpdateReferenceDocumentUsecase(
      writeService as unknown as ReferenceDocumentService,
      queryService as unknown as ReferenceDocumentQueryService,
      modelQueryService as unknown as EquipmentModelQueryService,
      makeTransactionRunner(),
    );
    return { writeService, modelQueryService, queryService, usecase };
  };

  it('SUPER_ADMIN 编辑：未提供字段保持原值（部分提交合并语义）', async () => {
    const { usecase, writeService } = makeUsecase();

    await usecase.execute({
      session: session(['SUPER_ADMIN']),
      documentId: 970001,
      patch: { title: '新标题' },
    });

    expect(writeService.updateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 970001,
        title: '新标题',
        documentType: 'ERROR_CODE_MANUAL',
        equipmentModelId: null,
        contentText: '内容',
      }),
      { transaction: 'mock' },
    );
  });

  it('equipmentModelId 显式 null 清空为通用资料；非法型号拒绝', async () => {
    const { usecase, writeService } = makeUsecase();

    await usecase.execute({
      session: session(['SUPER_ADMIN']),
      documentId: 970001,
      patch: { equipmentModelId: null },
    });
    expect(writeService.updateDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ equipmentModelId: null }),
      expect.anything(),
    );

    await expect(
      usecase.execute({
        session: session(['SUPER_ADMIN']),
        documentId: 970001,
        patch: { equipmentModelId: 0 },
      }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
  });

  it('contentText 显式 null 拒绝清空（无文件来源兑底）；必填字段显式 null 给本模块业务码；空补丁拒绝；ENGINEER 写被拒', async () => {
    const { usecase, writeService } = makeUsecase();

    await expect(
      usecase.execute({
        session: session(['SUPER_ADMIN']),
        documentId: 970001,
        patch: { contentText: null },
      }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
    // 补丁语义：null 仅允许出现在可清空字段，必填字段置空直接拒绝且不进入读/写路径
    await expect(
      usecase.execute({
        session: session(['SUPER_ADMIN']),
        documentId: 970001,
        patch: { title: null },
      }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
    await expect(
      usecase.execute({
        session: session(['SUPER_ADMIN']),
        documentId: 970001,
        patch: { documentType: null },
      }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
    await expect(
      usecase.execute({ session: session(['SUPER_ADMIN']), documentId: 970001, patch: {} }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
    await expect(
      usecase.execute({
        session: session(['ENGINEER']),
        documentId: 970001,
        patch: { title: 'x' },
      }),
    ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
    expect(writeService.updateDocument).not.toHaveBeenCalled();
  });

  it('目标不存在/已软删（QueryService 统一 NOT_FOUND）不进入写路径', async () => {
    const { writeService } = makeUsecase();
    const queryService = makeQueryService();
    queryService.findDetail.mockRejectedValue(
      new DomainError(REFERENCE_DOCUMENT_ERROR.NOT_FOUND, '参考资料不存在或不可访问', {
        id: 970004,
      }),
    );
    const target = new UpdateReferenceDocumentUsecase(
      writeService as unknown as ReferenceDocumentService,
      queryService as unknown as ReferenceDocumentQueryService,
      makeModelQueryService() as unknown as EquipmentModelQueryService,
      makeTransactionRunner(),
    );

    await expect(
      target.execute({
        session: session(['SUPER_ADMIN']),
        documentId: 970004,
        patch: { title: 'x' },
      }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.NOT_FOUND });
    expect(writeService.updateDocument).not.toHaveBeenCalled();
  });
});

describe('SoftDeleteReferenceDocumentUsecase', () => {
  const makeUsecase = (writeService = makeWriteService()) => ({
    writeService,
    usecase: new SoftDeleteReferenceDocumentUsecase(
      writeService as unknown as ReferenceDocumentService,
      makeTransactionRunner(),
    ),
  });

  it('SUPER_ADMIN 软删除成功返回 ID；经事务执行', async () => {
    const { usecase, writeService } = makeUsecase();

    await expect(
      usecase.execute({ session: session(['SUPER_ADMIN']), documentId: 970001 }),
    ).resolves.toEqual({ id: 970001 });
    expect(writeService.softDeleteDocument).toHaveBeenCalledWith(
      { documentId: 970001 },
      { transaction: 'mock' },
    );
  });

  it('不存在/已软删统一 NOT_FOUND（docx 口径，不沿用维修申请幂等成功裁定）', async () => {
    const writeService = makeWriteService();
    writeService.softDeleteDocument.mockResolvedValue({ kind: 'NOT_FOUND', id: 970004 });
    const { usecase } = makeUsecase(writeService);

    await expect(
      usecase.execute({ session: session(['SUPER_ADMIN']), documentId: 970004 }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.NOT_FOUND });
  });

  it('ENGINEER 删除被拒；资料 ID 非法拒绝', async () => {
    const { usecase } = makeUsecase();

    await expect(
      usecase.execute({ session: session(['ENGINEER']), documentId: 970001 }),
    ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
    await expect(
      usecase.execute({ session: session(['SUPER_ADMIN']), documentId: -1 }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS });
  });
});
