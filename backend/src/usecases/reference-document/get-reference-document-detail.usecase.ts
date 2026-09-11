// src/usecases/reference-document/get-reference-document-detail.usecase.ts

import { Injectable } from '@nestjs/common';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import { ReferenceDocumentQueryService } from '@src/modules/lithography/queries/reference-document.query.service';
import { enrichReferenceDocumentCreator } from './enrich-reference-document-creator';
import { assertDocumentIdValid, assertReferenceDocumentReadRole } from './reference-document-roles';
import {
  GetReferenceDocumentDetailCommand,
  GetReferenceDocumentDetailResult,
} from './reference-document.types';

/**
 * 查询参考资料详情用例（工程师/管理员维度）
 *
 * - 不存在与已软删由 QueryService 统一拒绝（NOT_FOUND，不泄露删除状态）
 * - 创建人展示经 creatorNickname 实时富集，不返回账号 ID
 * - 角色准入由 adapter 层守卫决策（ENGINEER/SUPER_ADMIN），本用例兜底
 */
@Injectable()
export class GetReferenceDocumentDetailUsecase {
  constructor(
    private readonly referenceDocumentQueryService: ReferenceDocumentQueryService,
    private readonly accountQueryService: AccountQueryService,
  ) {}

  async execute(
    command: GetReferenceDocumentDetailCommand,
  ): Promise<GetReferenceDocumentDetailResult> {
    assertReferenceDocumentReadRole(command.session.roles);
    assertDocumentIdValid(command.documentId);

    const detail = await this.referenceDocumentQueryService.findDetail({
      documentId: command.documentId,
    });
    return enrichReferenceDocumentCreator(this.accountQueryService, detail);
  }
}
