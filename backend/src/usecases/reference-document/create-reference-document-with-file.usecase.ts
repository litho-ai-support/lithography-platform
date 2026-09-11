// src/usecases/reference-document/create-reference-document-with-file.usecase.ts

import * as path from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { DomainError, REFERENCE_DOCUMENT_ERROR } from '@core/common/errors/domain-error';
import { CreateReferenceDocumentUsecase } from './create-reference-document.usecase';
import { assertReferenceDocumentWriteRole } from './reference-document-roles';
import {
  EXTENSION_TO_MIME,
  REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES,
  REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES,
} from './reference-document-upload.contract';
import { REFERENCE_DOCUMENT_STORAGE } from './reference-document-storage.contract';
import {
  CreateReferenceDocumentWithFileCommand,
  ReferenceDocumentMutationResult,
  ReferenceDocumentStorage,
} from './reference-document.types';

/**
 * 带文件创建参考资料用例（仅 SUPER_ADMIN，REST multipart 上传路径）。
 *
 * 负责人 0910 架构要求：文件保存 → 数据库落库 → 失败补偿的完整写编排归 usecase 层
 * 统一持有，REST adapter 只做 multipart 协议解析与命令组装，不注入存储契约。
 *
 * 业务流程（顺序即安全边界，不得重排）
 * 1. 流程级授权最外层兜底：assertReferenceDocumentWriteRole 必须发生在任何文件 I/O
 *    之前（负责人 0911 要求）——否则非管理员入口可先触发磁盘写入再依赖补偿删除；
 * 2. 上传策略单一真源：大小上限（以 buffer 实际字节数为准，不信任声明值）
 *    （UPLOAD_FILE_TOO_LARGE）与扩展名 → MIME 白名单（UPLOAD_FILE_TYPE_NOT_ALLOWED）；
 * 3. 先写存储文件（服务端随机引用），save 失败不触库（CREATION_FAILED）；
 * 4. 委托 CreateReferenceDocumentUsecase 完成业务校验与事务落库（字段规范化、
 *    双空拒绝、型号存在性均保持其单一真源地位）；
 * 5. 落库失败补偿删除本次生成的精确引用；补偿删除失败不静默——记入错误日志并附上
 *    可重试/可清理的精确 storageReference（服务端生成、无路径语义），不向客户端泄露。
 */
@Injectable()
export class CreateReferenceDocumentWithFileUsecase {
  private readonly logger = new Logger(CreateReferenceDocumentWithFileUsecase.name);
  private readonly allowedMimeTypes: readonly string[];
  private readonly uploadMaxBytes: number;

  constructor(
    private readonly createReferenceDocumentUsecase: CreateReferenceDocumentUsecase,
    @Inject(REFERENCE_DOCUMENT_STORAGE)
    private readonly storage: ReferenceDocumentStorage,
    @Inject(REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES)
    uploadMaxBytes: number,
    @Inject(REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES)
    allowedMimeTypes: string[],
  ) {
    this.uploadMaxBytes = uploadMaxBytes;
    this.allowedMimeTypes = allowedMimeTypes;
  }

  async execute(
    command: CreateReferenceDocumentWithFileCommand,
  ): Promise<ReferenceDocumentMutationResult> {
    // 流程级授权最外层兜底：先于任何文件 I/O，复用既有角色断言不另设第二套判断（负责人 0911）
    assertReferenceDocumentWriteRole(command.session.roles);

    // 大小上限以服务端实际字节数为准（不信任客户端声明的 size）
    if (command.file.buffer.byteLength > this.uploadMaxBytes) {
      throw new DomainError(REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TOO_LARGE, '上传文件超过大小限制');
    }

    // 类型以扩展名为主判定（不信任客户端 MIME 头），MIME 白名单来自配置
    const extension = path.extname(command.file.originalFilename).slice(1).toLowerCase();
    const mimeType = EXTENSION_TO_MIME[extension];

    if (mimeType === undefined || !this.allowedMimeTypes.includes(mimeType)) {
      throw new DomainError(
        REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TYPE_NOT_ALLOWED,
        '不允许上传该类型的文件',
      );
    }

    // 先写存储文件，再事务落库；落库失败补偿删除（编排归本用例，adapter 不参与）
    let storageReference: string;

    try {
      storageReference = await this.storage.save(command.file.buffer, extension);
    } catch {
      throw new DomainError(REFERENCE_DOCUMENT_ERROR.CREATION_FAILED, '文件保存失败，请稍后重试');
    }

    try {
      return await this.createReferenceDocumentUsecase.execute({
        session: command.session,
        title: command.title,
        documentType: command.documentType,
        equipmentModelId: command.equipmentModelId,
        description: command.description,
        contentText: command.contentText,
        file: {
          originalFilename: command.file.originalFilename,
          mimeType,
          storageReference,
        },
      });
    } catch (error) {
      await this.compensateDelete(storageReference);

      throw error;
    }
  }

  /** 落库失败补偿：删除本次生成的精确引用；删除失败必须可观测且可清理，绝不静默吞掉 */
  private async compensateDelete(storageReference: string): Promise<void> {
    try {
      await this.storage.delete(storageReference);
    } catch (deleteError) {
      this.logger.error(
        `参考资料上传落库失败后的补偿删除失败，存在需清理的孤儿文件 storageReference=${storageReference}`,
        deleteError instanceof Error ? deleteError.stack : String(deleteError),
      );
    }
  }
}
