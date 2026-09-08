// src/usecases/reference-document/update-reference-document.usecase.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { DomainError, REFERENCE_DOCUMENT_ERROR } from '@core/common/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { EquipmentModelQueryService } from '@src/modules/lithography/queries/equipment-model.query.service';
import { ReferenceDocumentQueryService } from '@src/modules/lithography/queries/reference-document.query.service';
import { ReferenceDocumentService } from '@src/modules/lithography/reference-document.service';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@src/usecases/common/ports/transaction-runner.contract';
import {
  assertPatchHasEditableField,
  normalizeContentText,
  normalizeDescription,
  normalizeDocumentType,
  normalizeTitle,
} from './reference-document-fields.normalize';
import {
  assertEquipmentModelIdValid,
  assertDocumentIdValid,
  assertReferenceDocumentWriteRole,
} from './reference-document-roles';
import {
  ReferenceDocumentMutationResult,
  UpdateReferenceDocumentCommand,
} from './reference-document.types';

/**
 * 编辑参考资料用例（仅 SUPER_ADMIN）
 *
 * 业务流程：
 * 1. 角色决策：仅真实 SUPER_ADMIN 可编辑（精确匹配，工程师一律拒绝）
 * 2. 输入决策：补丁至少一个可编辑字段；undefined=保持原值，
 *    equipmentModelId/description 显式 null=清空，contentText 不允许清空
 *    （本周无文件来源兜底，清空会违反 chk_reference_document_content_source）
 * 3. 读取当前值合并补丁后全量校验（必填字段合并后仍必须满足）
 * 4. 事务内校验新设备型号存在 → 条件更新（deprecated=0 才可编辑，已软删不可编辑穿透）
 *
 * 编辑字段范围（0907.docx）：标题/文档类型/适用设备型号/描述/文本内容；
 * 不提供替换二进制文件——需要替换时新增一份资料再软删除旧资料。
 */
@Injectable()
export class UpdateReferenceDocumentUsecase {
  constructor(
    private readonly referenceDocumentService: ReferenceDocumentService,
    private readonly referenceDocumentQueryService: ReferenceDocumentQueryService,
    private readonly equipmentModelQueryService: EquipmentModelQueryService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute(command: UpdateReferenceDocumentCommand): Promise<ReferenceDocumentMutationResult> {
    assertReferenceDocumentWriteRole(command.session.roles);
    assertDocumentIdValid(command.documentId);
    assertPatchHasEditableField(command.patch);

    return this.transactionRunner.run((transactionContext) =>
      this.doUpdate(command, transactionContext),
    );
  }

  /** 事务内执行：读当前值 → 合并补丁 → 校验 → 型号校验 → 条件更新 */
  private async doUpdate(
    command: UpdateReferenceDocumentCommand,
    transactionContext: PersistenceTransactionContext,
  ): Promise<ReferenceDocumentMutationResult> {
    // 当前值读取：不存在/已软删统一 NOT_FOUND（QueryService 口径），不泄露删除状态；
    // 携带事务上下文在事务连接上读取，避免「读-改-写」过程中读取与条件更新不在同一快照
    const current = await this.referenceDocumentQueryService.findDetail({
      documentId: command.documentId,
      transactionContext,
    });
    const patch = command.patch;

    // 补丁类型语义：null 仅允许出现在可清空字段（equipmentModelId/description）；
    // 必填字段显式 null 直接拒绝本模块业务码，不落到输入规范化的实现细节错误码
    if (patch.title === null || patch.documentType === null) {
      throw new DomainError(
        REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS,
        '标题与文档类型为必填字段，不允许置空',
        { documentId: command.documentId },
      );
    }

    // 合并补丁：undefined 保持原值
    const title = patch.title !== undefined ? normalizeTitle(patch.title) : current.title;
    const documentType =
      patch.documentType !== undefined
        ? normalizeDocumentType(patch.documentType)
        : current.documentType;
    const description =
      patch.description !== undefined
        ? normalizeDescription(patch.description)
        : current.description;
    const contentText =
      patch.contentText !== undefined
        ? normalizeContentText(patch.contentText, false)
        : current.contentText;
    if (contentText === undefined || contentText === null) {
      // 理论不可达（种子/写入路径保证 contentText 非空），防御性拒绝避免落入无内容来源状态
      throw new DomainError(
        REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS,
        '文本内容不能为空（本周仅支持文本内容来源，暂无文件上传兜底）',
      );
    }

    // 型号合并：undefined 保持原值；显式 null 清空为通用资料；数字需存在
    let equipmentModelId = current.equipmentModelId;
    if (patch.equipmentModelId !== undefined) {
      if (patch.equipmentModelId === null) {
        equipmentModelId = null;
      } else {
        assertEquipmentModelIdValid(patch.equipmentModelId);
        const model = await this.equipmentModelQueryService.findModelById({
          id: patch.equipmentModelId,
          transactionContext,
        });
        if (!model) {
          throw new DomainError(
            REFERENCE_DOCUMENT_ERROR.EQUIPMENT_MODEL_NOT_FOUND,
            '设备型号不存在',
            { equipmentModelId: patch.equipmentModelId },
          );
        }
        equipmentModelId = model.id;
      }
    }

    return this.referenceDocumentService.updateDocument(
      {
        documentId: command.documentId,
        title,
        documentType,
        equipmentModelId,
        description: description ?? null,
        contentText,
      },
      transactionContext,
    );
  }
}
