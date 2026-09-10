// src/usecases/reference-document/create-reference-document-with-file.usecase.spec.ts

/// <reference types="jest" />
import { Logger } from '@nestjs/common';

import { DomainError, REFERENCE_DOCUMENT_ERROR } from '@core/common/errors/domain-error';
import type { CreateReferenceDocumentUsecase } from './create-reference-document.usecase';
import { CreateReferenceDocumentWithFileUsecase } from './create-reference-document-with-file.usecase';
import { CreateReferenceDocumentWithFileCommand } from './reference-document.types';

/** 上传策略测试配置：业务上限 20MB 的等价小口径，白名单仅放行 pdf/txt/md */
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf', 'text/plain', 'text/markdown'];

const makeStorage = () => ({
  save: jest.fn().mockResolvedValue('a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf'),
  open: jest.fn(),
  delete: jest.fn().mockResolvedValue(undefined),
});

const makeInnerUsecase = () =>
  ({
    execute: jest.fn().mockResolvedValue({ id: 970123 }),
  }) as unknown as CreateReferenceDocumentUsecase & { execute: jest.Mock };

const makeUsecase = (
  overrides: {
    storage?: ReturnType<typeof makeStorage>;
    inner?: ReturnType<typeof makeInnerUsecase>;
  } = {},
) => {
  const storage = overrides.storage ?? makeStorage();
  const inner = overrides.inner ?? makeInnerUsecase();
  const usecase = new CreateReferenceDocumentWithFileUsecase(
    inner,
    storage,
    UPLOAD_MAX_BYTES,
    ALLOWED_MIME_TYPES,
  );

  return { storage, inner, usecase };
};

const makeCommand = (
  overrides: Partial<CreateReferenceDocumentWithFileCommand> = {},
): CreateReferenceDocumentWithFileCommand => ({
  session: { accountId: 900001, roles: ['SUPER_ADMIN'] },
  title: 'E2E 带文件创建',
  documentType: 'MANUAL',
  equipmentModelId: null,
  description: null,
  contentText: null,
  file: { buffer: Buffer.from('file-bytes'), size: 32, originalFilename: '报告.pdf' },
  ...overrides,
});

describe('CreateReferenceDocumentWithFileUsecase', () => {
  it('保存成功且落库成功：委托创建用例携带 MIME 与精确引用，不触发补偿删除', async () => {
    const { storage, inner, usecase } = makeUsecase();

    const result = await usecase.execute(makeCommand());

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledWith(Buffer.from('file-bytes'), 'pdf');
    expect(inner.execute).toHaveBeenCalledTimes(1);
    expect(inner.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ accountId: 900001 }),
        title: 'E2E 带文件创建',
        contentText: null,
        file: {
          originalFilename: '报告.pdf',
          mimeType: 'application/pdf',
          storageReference: 'a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf',
        },
      }),
    );
    expect(result).toEqual({ id: 970123 });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('保存失败不触发落库：抛 CREATION_FAILED，不调用创建用例，也不补偿删除', async () => {
    const { storage, inner, usecase } = makeUsecase();
    storage.save.mockRejectedValueOnce(new Error('disk failure'));

    await expect(usecase.execute(makeCommand())).rejects.toMatchObject({
      code: REFERENCE_DOCUMENT_ERROR.CREATION_FAILED,
    });

    expect(inner.execute).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('落库失败补偿删除本次生成的精确引用，并原样抛出业务错误', async () => {
    const { storage, inner, usecase } = makeUsecase();
    const businessError = new DomainError(
      REFERENCE_DOCUMENT_ERROR.EQUIPMENT_MODEL_NOT_FOUND,
      '设备型号不存在',
    );
    inner.execute.mockRejectedValueOnce(businessError);

    await expect(usecase.execute(makeCommand())).rejects.toBe(businessError);

    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith('a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf');
  });

  it('补偿删除失败不静默：记录含精确引用的错误日志，仍抛出原业务错误', async () => {
    const { storage, inner, usecase } = makeUsecase();
    const businessError = new DomainError(
      REFERENCE_DOCUMENT_ERROR.EQUIPMENT_MODEL_NOT_FOUND,
      '设备型号不存在',
    );
    inner.execute.mockRejectedValueOnce(businessError);
    storage.delete.mockRejectedValueOnce(new Error('unlink permission denied'));
    const loggerError = jest
      .spyOn((usecase as unknown as { logger: Logger }).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(usecase.execute(makeCommand())).rejects.toBe(businessError);

    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('storageReference=a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf'),
      expect.stringContaining('unlink permission denied'),
    );
  });

  it('超过业务大小上限：UPLOAD_FILE_TOO_LARGE，不触存储不落库', async () => {
    const { storage, inner, usecase } = makeUsecase();

    await expect(
      usecase.execute(
        makeCommand({
          file: {
            buffer: Buffer.alloc(8),
            size: UPLOAD_MAX_BYTES + 1,
            originalFilename: '报告.pdf',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TOO_LARGE });

    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(inner.execute).not.toHaveBeenCalled();
  });

  it('白名单外扩展名：UPLOAD_FILE_TYPE_NOT_ALLOWED，不触存储不落库', async () => {
    const { storage, inner, usecase } = makeUsecase();

    await expect(
      usecase.execute(
        makeCommand({ file: { buffer: Buffer.from('MZ'), size: 2, originalFilename: 'evil.exe' } }),
      ),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TYPE_NOT_ALLOWED });

    expect(storage.save).not.toHaveBeenCalled();
    expect(inner.execute).not.toHaveBeenCalled();
  });

  it('无扩展名同样拒绝（映射无命中即白名单外，不信任客户端 MIME）', async () => {
    const { storage, usecase } = makeUsecase();

    await expect(
      usecase.execute(
        makeCommand({ file: { buffer: Buffer.from('x'), size: 1, originalFilename: 'noext' } }),
      ),
    ).rejects.toMatchObject({ code: REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TYPE_NOT_ALLOWED });

    expect(storage.save).not.toHaveBeenCalled();
  });
});
