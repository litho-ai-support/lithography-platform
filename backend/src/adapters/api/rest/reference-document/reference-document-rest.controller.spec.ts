// src/adapters/api/rest/reference-document/reference-document-rest.controller.spec.ts

/// <reference types="jest" />
import { Readable } from 'node:stream';

import { HttpException, StreamableFile } from '@nestjs/common';

import { DomainError, REFERENCE_DOCUMENT_ERROR } from '@core/common/errors/domain-error';
import { resolveRestStatus } from '@core/common/errors/rest-error-status';
import { ReferenceDocumentRestController } from './reference-document-rest.controller';

/** 构造被测 controller：只注入两个用例的 mock——构造函数本身即「不持有存储契约」的证明 */
const makeController = () => {
  const createWithFileUsecase = { execute: jest.fn() };
  const getReferenceDocumentFileUsecase = { execute: jest.fn() };
  const controller = new ReferenceDocumentRestController(
    createWithFileUsecase as never,
    getReferenceDocumentFileUsecase as never,
  );

  return { controller, createWithFileUsecase, getReferenceDocumentFileUsecase };
};

/** 最小 JwtPayload 形状（mapJwtToUsecaseSession 只取会话相关字段） */
const jwtUser = {
  sub: 900001,
  accessGroup: ['SUPER_ADMIN'],
  activeRole: 'SUPER_ADMIN',
} as never;

describe('ReferenceDocumentRestController（REST 边界只解析协议与组装响应）', () => {
  describe('upload', () => {
    const validFile = {
      buffer: Buffer.from('file-bytes'),
      size: 32,
      originalname: 'E2E 报告.pdf',
    };

    it('上传入口只组装命令并调用一个带文件创建 Usecase（业务规则与存储编排全部下沉）', async () => {
      const { controller, createWithFileUsecase } = makeController();
      createWithFileUsecase.execute.mockResolvedValueOnce({ id: 970123 });

      const result = await controller.upload(
        validFile,
        {
          title: '标题',
          documentType: 'MANUAL',
          equipmentModelId: '43',
          description: '说明',
          contentText: '正文',
        },
        jwtUser,
      );

      expect(result).toEqual({ id: 970123 });
      expect(createWithFileUsecase.execute).toHaveBeenCalledTimes(1);
      expect(createWithFileUsecase.execute).toHaveBeenCalledWith({
        session: expect.objectContaining({ accountId: 900001 }),
        title: '标题',
        documentType: 'MANUAL',
        equipmentModelId: 43,
        description: '说明',
        contentText: '正文',
        file: {
          buffer: validFile.buffer,
          size: 32,
          originalFilename: 'E2E 报告.pdf',
        },
      });
    });

    it('latin1 误码文件名在协议层还原（业务层收到的已是正确 UTF-8）', async () => {
      const { controller, createWithFileUsecase } = makeController();
      createWithFileUsecase.execute.mockResolvedValueOnce({ id: 970124 });

      const mojibake = Buffer.from('E2E 中文报告.md', 'utf8').toString('latin1');
      await controller.upload(
        { ...validFile, originalname: mojibake },
        { title: '中文文件名', documentType: 'MANUAL' },
        jwtUser,
      );

      expect(createWithFileUsecase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.objectContaining({ originalFilename: 'E2E 中文报告.md' }),
        }),
      );
    });

    it('multipart 文件缺失：UPLOAD_FILE_MISSING（协议层防御）', async () => {
      const { controller, createWithFileUsecase } = makeController();

      await expect(controller.upload(null, {}, jwtUser)).rejects.toMatchObject({
        code: REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_MISSING,
      });
      expect(createWithFileUsecase.execute).not.toHaveBeenCalled();
    });

    it('Usecase 抛 DomainError：由本类映射为 REST 统一错误体 HttpException', async () => {
      const { controller, createWithFileUsecase } = makeController();
      const businessError = new DomainError(
        REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TOO_LARGE,
        '上传文件超过大小限制',
      );
      createWithFileUsecase.execute.mockRejectedValueOnce(businessError);

      const error = (await controller
        .upload(validFile, {}, jwtUser)
        .catch((caught: unknown) => caught)) as HttpException;

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(
        resolveRestStatus(REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TOO_LARGE),
      );
      expect(error.getResponse()).toMatchObject({
        code: REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TOO_LARGE,
      });
    });
  });

  describe('download', () => {
    it('下载入口组装响应头并流式返回 Usecase 内容（不感知存储实现与路径）', async () => {
      const { controller, getReferenceDocumentFileUsecase } = makeController();
      getReferenceDocumentFileUsecase.execute.mockResolvedValueOnce({
        documentId: 970002,
        originalFilename: '说明书.pdf',
        mimeType: 'application/pdf',
        content: Readable.from([Buffer.from('pdf-bytes')]),
      });
      const setHeader = jest.fn();
      const response = { setHeader } as never;

      const result = await controller.download(970002, jwtUser, response);

      expect(getReferenceDocumentFileUsecase.execute).toHaveBeenCalledWith({
        session: expect.objectContaining({ accountId: 900001 }),
        documentId: 970002,
      });
      expect(result).toBeInstanceOf(StreamableFile);
      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent('说明书.pdf')}`,
      );
    });
  });
});
