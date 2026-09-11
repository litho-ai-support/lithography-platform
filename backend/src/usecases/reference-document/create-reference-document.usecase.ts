// src/usecases/reference-document/create-reference-document.usecase.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { DomainError, REFERENCE_DOCUMENT_ERROR } from '@core/common/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { EquipmentModelQueryService } from '@src/modules/lithography/queries/equipment-model.query.service';
import { ReferenceDocumentService } from '@src/modules/lithography/reference-document.service';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@src/usecases/common/ports/transaction-runner.contract';
import {
  normalizeContentText,
  normalizeDescription,
  normalizeDocumentType,
  normalizeTitle,
} from './reference-document-fields.normalize';
import {
  assertEquipmentModelIdValid,
  assertReferenceDocumentWriteRole,
} from './reference-document-roles';
import {
  CreateReferenceDocumentCommand,
  ReferenceDocumentMutationResult,
} from './reference-document.types';

/**
 * 创建参考资料用例（仅 SUPER_ADMIN）
 *
 * 业务流程：
 * 1. 角色决策：仅真实 SUPER_ADMIN 可创建（精确匹配，工程师一律拒绝，兜底守卫误放）
 * 2. 输入决策：标题/文档类型必填且限长；内容来源为正文或文件至少一个——
 *    双空创建必须失败（REFERENCE_DOCUMENT_ERROR.CONTENT_SOURCE_EMPTY，落库层
 *    chk_reference_document_content_source 兜底）；文档说明可空
 * 3. 事务内校验设备型号存在（应用层预检给友好错误，不依赖 RESTRICT 外键裸报错）
 * 4. 事务内落库；创建人取自会话，客户端不可传入；文件来源的存储引用由
 *    存储契约在事务外生成（先存后落库），本用例只负责把载荷写入四列
 */
@Injectable()
export class CreateReferenceDocumentUsecase {
  constructor(
    private readonly referenceDocumentService: ReferenceDocumentService,
    private readonly equipmentModelQueryService: EquipmentModelQueryService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute(command: CreateReferenceDocumentCommand): Promise<ReferenceDocumentMutationResult> {
    assertReferenceDocumentWriteRole(command.session.roles);

    const title = normalizeTitle(command.title);
    const documentType = normalizeDocumentType(command.documentType);
    const description = normalizeDescription(command.description) ?? null;
    // 内容来源：正文可为 null（仅文件创建），提供了正文则仍走规范化（空串/超长拒绝）
    const contentText =
      command.contentText === undefined || command.contentText === null
        ? null
        : normalizeContentText(command.contentText, true);
    const file = command.file ?? null;

    // 双空拒绝：文件与正文同时缺失时不允许创建（docx 口径，CONTENT_SOURCE_EMPTY 优于
    // 通用 INVALID_PARAMS，与落库层 chk_reference_document_content_source 语义一一对应）
    if (!file && contentText === null) {
      throw new DomainError(
        REFERENCE_DOCUMENT_ERROR.CONTENT_SOURCE_EMPTY,
        '文件与正文内容至少提供一个',
      );
    }

    let equipmentModelId: number | null = null;
    if (command.equipmentModelId !== undefined && command.equipmentModelId !== null) {
      assertEquipmentModelIdValid(command.equipmentModelId);
      equipmentModelId = command.equipmentModelId;
    }

    return this.transactionRunner.run((transactionContext) =>
      this.doCreate(
        { title, documentType, equipmentModelId, description, contentText, file },
        command,
        transactionContext,
      ),
    );
  }

  /** 事务内执行：型号存在性校验 → 落库（创建人仅取自会话） */
  private async doCreate(
    data: {
      title: string;
      documentType: string;
      equipmentModelId: number | null;
      description: string | null;
      contentText: string | null;
      file: CreateReferenceDocumentCommand['file'];
    },
    command: CreateReferenceDocumentCommand,
    transactionContext: PersistenceTransactionContext,
  ): Promise<ReferenceDocumentMutationResult> {
    if (data.equipmentModelId !== null) {
      // 型号预检仅验存在性，不校验 enabled：资料库无申请流转语义，
      // 禁用型号的历史知识仍可挂载（docx 未要求禁用型号拦截，区别于维修申请）
      const model = await this.equipmentModelQueryService.findModelById({
        id: data.equipmentModelId,
        transactionContext,
      });
      if (!model) {
        throw new DomainError(
          REFERENCE_DOCUMENT_ERROR.EQUIPMENT_MODEL_NOT_FOUND,
          '设备型号不存在',
          { equipmentModelId: data.equipmentModelId },
        );
      }
    }

    return this.referenceDocumentService.insertDocument(
      {
        title: data.title,
        documentType: data.documentType,
        equipmentModelId: data.equipmentModelId,
        description: data.description,
        contentText: data.contentText,
        originalFilename: data.file?.originalFilename ?? null,
        mimeType: data.file?.mimeType ?? null,
        // 存储后端标识随实现固定；存储引用已由存储契约生成（服务端随机、无路径语义）
        storageBackend: data.file ? 'local' : null,
        storageReference: data.file?.storageReference ?? null,
        // 创建人仅取自可信 Session，客户端不可传入
        createdByAccountId: command.session.accountId,
      },
      transactionContext,
    );
  }
}
