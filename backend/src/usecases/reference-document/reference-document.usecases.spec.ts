// src/usecases/reference-document/reference-document.usecases.spec.ts

/// <reference types="jest" />
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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
import { GetReferenceDocumentFileUsecase } from './get-reference-document-file.usecase';
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

/** 下载用例成功路径需要真实存在文件（fsp.access 实盘校验）：运行级临时目录，精确清理 */
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'refdoc-file-usecase-'));

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

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
  // 内部装配字段（QueryService 返回、DTO 视图剥离）：供下载/编辑防御判定使用
  storageReference: null,
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

  it('contentText 空白拒绝（提供了正文但空白才在此拒绝，双空判定归 usecase 层）', async () => {
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

  it('仅文件创建成功：contentText null 合法，四列存储元数据与 local 后端标识透传落库', async () => {
    const { usecase, writeService } = makeUsecase();

    await expect(
      usecase.execute({
        session: session(['SUPER_ADMIN']),
        ...baseCommand,
        contentText: null,
        file: {
          originalFilename: '说明书.pdf',
          mimeType: 'application/pdf',
          storageReference: 'a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf',
        },
      }),
    ).resolves.toEqual({ id: 970101 });
    expect(writeService.insertDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        contentText: null,
        originalFilename: '说明书.pdf',
        mimeType: 'application/pdf',
        storageBackend: 'local',
        storageReference: 'a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf',
      }),
      expect.anything(),
    );
  });

  it('双空拒绝（CONTENT_SOURCE_EMPTY）：正文与文件同时缺失不进入写路径', async () => {
    const { usecase, writeService } = makeUsecase();

    await expect(
      usecase.execute({
        session: session(['SUPER_ADMIN']),
        ...baseCommand,
        contentText: null,
      }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.CONTENT_SOURCE_EMPTY });
    expect(writeService.insertDocument).not.toHaveBeenCalled();
  });

  it('正文与文件并存创建：两者同时透传（存储引用仍由服务端契约生成）', async () => {
    const { usecase, writeService } = makeUsecase();

    await usecase.execute({
      session: session(['SUPER_ADMIN']),
      ...baseCommand,
      file: {
        originalFilename: 'a.txt',
        mimeType: 'text/plain',
        storageReference: 'b1b2c3d4e5f60718293a4b5c6d7e8f90.txt',
      },
    });
    expect(writeService.insertDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        contentText: '内容',
        originalFilename: 'a.txt',
        storageReference: 'b1b2c3d4e5f60718293a4b5c6d7e8f90.txt',
      }),
      expect.anything(),
    );
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

  it('contentText 显式 null 清空：纯文本资料拒绝（CONTENT_SOURCE_EMPTY）；文件资料放行；必填字段显式 null 给本模块业务码；空补丁拒绝；ENGINEER 写被拒', async () => {
    const { usecase, writeService } = makeUsecase();

    // 纯文本资料（无存储引用）：清空正文 → 双空拒绝
    await expect(
      usecase.execute({
        session: session(['SUPER_ADMIN']),
        documentId: 970001,
        patch: { contentText: null },
      }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.CONTENT_SOURCE_EMPTY });
    // 文件资料（已有存储引用）：清空正文合法（仅文件来源）
    const fileBacked = makeQueryService();
    fileBacked.findDetail.mockResolvedValue(
      detailQueryResult({
        contentText: null,
        storageReference: 'a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf',
      }),
    );
    const fileBackedUsecase = new UpdateReferenceDocumentUsecase(
      makeWriteService() as unknown as ReferenceDocumentService,
      fileBacked as unknown as ReferenceDocumentQueryService,
      makeModelQueryService() as unknown as EquipmentModelQueryService,
      makeTransactionRunner(),
    );
    await expect(
      fileBackedUsecase.execute({
        session: session(['SUPER_ADMIN']),
        documentId: 970001,
        patch: { title: '改标题' },
      }),
    ).resolves.toEqual({ id: 970001 });
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

describe('GetReferenceDocumentFileUsecase', () => {
  const makeStorage = () => ({
    save: jest.fn(),
    resolve: jest.fn(),
    delete: jest.fn(),
  });
  const makeUsecase = (
    overrides: {
      queryService?: ReturnType<typeof makeQueryService>;
      storage?: ReturnType<typeof makeStorage>;
    } = {},
  ) => {
    const queryService = overrides.queryService ?? makeQueryService();
    const storage = overrides.storage ?? makeStorage();
    return {
      queryService,
      storage,
      usecase: new GetReferenceDocumentFileUsecase(
        queryService as unknown as ReferenceDocumentQueryService,
        storage,
      ),
    };
  };

  const fileDetail = detailQueryResult({
    contentText: null,
    originalFilename: '说明书.pdf',
    mimeType: 'application/pdf',
    storageReference: 'a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf',
  });

  it('三角色均可下载（含 CUSTOMER）：返回展示文件名/MIME 与绝对路径载荷', async () => {
    const queryService = makeQueryService();
    queryService.findDetail.mockResolvedValue(fileDetail);
    const storage = makeStorage();
    const existingPath = path.join(tmpRoot, 'downloadable.pdf');
    fs.writeFileSync(existingPath, 'pdf-bytes');
    storage.resolve.mockReturnValue(existingPath);
    const { usecase } = makeUsecase({ queryService, storage });

    for (const roles of [['SUPER_ADMIN'], ['ENGINEER'], ['CUSTOMER']]) {
      await expect(
        usecase.execute({ session: session(roles), documentId: 970001 }),
      ).resolves.toMatchObject({
        documentId: 970001,
        originalFilename: '说明书.pdf',
        mimeType: 'application/pdf',
        absolutePath: existingPath,
      });
    }
    expect(storage.resolve).toHaveBeenCalledWith(fileDetail.storageReference);
  });

  it('空角色会话拒绝（匿名会话不允许下载）', async () => {
    const { usecase } = makeUsecase();

    await expect(
      usecase.execute({ session: session([]), documentId: 970001 }),
    ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
  });

  it('纯文本资料（无存储引用）FILE_NOT_AVAILABLE；不触达存储层', async () => {
    const queryService = makeQueryService();
    queryService.findDetail.mockResolvedValue(detailQueryResult());
    const storage = makeStorage();
    const { usecase } = makeUsecase({ queryService, storage });

    await expect(
      usecase.execute({ session: session(['CUSTOMER']), documentId: 970001 }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.FILE_NOT_AVAILABLE });
    expect(storage.resolve).not.toHaveBeenCalled();
  });

  it('存储引用非法（resolve 抛错）收敛为 FILE_NOT_AVAILABLE，不返回路径', async () => {
    const queryService = makeQueryService();
    queryService.findDetail.mockResolvedValue(fileDetail);
    const storage = makeStorage();
    storage.resolve.mockImplementation(() => {
      throw new Error('Rejected invalid storage reference format');
    });
    const { usecase } = makeUsecase({ queryService, storage });

    await expect(
      usecase.execute({ session: session(['ENGINEER']), documentId: 970001 }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.FILE_NOT_AVAILABLE });
  });

  it('存储对象缺失（文件不存在）收敛为 FILE_NOT_AVAILABLE（受控错误，不泄漏路径）', async () => {
    const queryService = makeQueryService();
    queryService.findDetail.mockResolvedValue(fileDetail);
    const storage = makeStorage();
    storage.resolve.mockReturnValue(path.join(tmpRoot, 'missing-file.pdf'));
    const { usecase } = makeUsecase({ queryService, storage });

    await expect(
      usecase.execute({ session: session(['ENGINEER']), documentId: 970001 }),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.FILE_NOT_AVAILABLE });
  });
});
