// src/usecases/reference-document/get-reference-document-file.usecase.ts

import * as fsp from 'node:fs/promises';

import { Inject, Injectable } from '@nestjs/common';

import { DomainError, REFERENCE_DOCUMENT_ERROR } from '@core/common/errors/domain-error';
import { ReferenceDocumentQueryService } from '@src/modules/lithography/queries/reference-document.query.service';

import {
  GetReferenceDocumentFileCommand,
  ReferenceDocumentFilePayload,
  ReferenceDocumentStorage,
} from './reference-document.types';
import {
  assertDocumentIdValid,
  assertReferenceDocumentDownloadRole,
} from './reference-document-roles';
import { REFERENCE_DOCUMENT_STORAGE } from './reference-document-storage.contract';

/**
 * 获取参考资料下载文件用例（所有已登录角色）。
 *
 * - 复用统一 NOT_FOUND 口径：不存在 / 已软删一致拒绝，不泄露删除状态；
 * - 无存储引用（纯文本资料）或存储对象缺失/引用非法：统一 FILE_NOT_AVAILABLE 受控错误，
 *   不泄露服务器路径、存储引用与存储后端类型（负责人 0909 第二轮下载要求）；
 * - 返回的 absolutePath 仅供 adapter 组装文件流，不得进入响应体。
 */
@Injectable()
export class GetReferenceDocumentFileUsecase {
  constructor(
    private readonly referenceDocumentQueryService: ReferenceDocumentQueryService,
    @Inject(REFERENCE_DOCUMENT_STORAGE)
    private readonly storage: ReferenceDocumentStorage,
  ) {}

  async execute(command: GetReferenceDocumentFileCommand): Promise<ReferenceDocumentFilePayload> {
    assertReferenceDocumentDownloadRole(command.session.roles);
    assertDocumentIdValid(command.documentId);

    // 不存在/已软删由 QueryService 统一 NOT_FOUND，不区分原因
    const detail = await this.referenceDocumentQueryService.findDetail({
      documentId: command.documentId,
    });

    if (
      detail.storageReference === null ||
      detail.mimeType === null ||
      detail.originalFilename === null
    ) {
      throw new DomainError(REFERENCE_DOCUMENT_ERROR.FILE_NOT_AVAILABLE, '该资料没有可下载的文件', {
        documentId: command.documentId,
      });
    }

    // 引用格式/越界与存储对象存在性校验先于文件流组装；任何存储侧失败都收敛为受控错误
    let absolutePath: string;

    try {
      absolutePath = this.storage.resolve(detail.storageReference);
      await fsp.access(absolutePath);
    } catch {
      throw new DomainError(REFERENCE_DOCUMENT_ERROR.FILE_NOT_AVAILABLE, '该资料没有可下载的文件', {
        documentId: command.documentId,
      });
    }

    return {
      documentId: detail.id,
      originalFilename: detail.originalFilename,
      mimeType: detail.mimeType,
      absolutePath,
    };
  }
}
