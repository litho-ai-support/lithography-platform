// src/usecases/admin-document-database/get-admin-document-database-stats.usecase.ts

import { Injectable } from '@nestjs/common';
import type { UsecaseSession } from '@app-types/auth/session.types';
import { ReferenceDocumentQueryService } from '@src/modules/lithography/queries/reference-document.query.service';
import { AdminAiConversationQueryService } from '@src/modules/lithography/queries/admin-ai-conversation.query.service';
import { AdminAiReportQueryService } from '@src/modules/lithography/queries/admin-ai-report.query.service';
import { AdminRepairRequestQueryService } from '@src/modules/lithography/queries/admin-repair-request.query.service';
import type { AdminDocumentDatabaseStatsView } from '@src/modules/lithography/admin-document-database.types';
import { assertAdminDocumentDatabasePermission } from './admin-document-database-permission';

/**
 * 管理员文档数据库统计用例（PR3）。
 *
 * 四类统计口径与各标签默认列表过滤一致（计划表 S3.3）：
 * - 维修申请 / 参考资料：不含软删除项；
 * - AI 会话 / AI 报告：无软删除概念，计全量；
 * - 参考资料：复用既有参考资料读链路的默认过滤（deprecated = false），
 *   以 pageSize=1 的 withTotal 查询取真实总数，不伪造演示数字。
 */
@Injectable()
export class GetAdminDocumentDatabaseStatsUsecase {
  constructor(
    private readonly adminRepairRequestQueryService: AdminRepairRequestQueryService,
    private readonly adminAiConversationQueryService: AdminAiConversationQueryService,
    private readonly adminAiReportQueryService: AdminAiReportQueryService,
    private readonly referenceDocumentQueryService: ReferenceDocumentQueryService,
  ) {}

  async execute(params: { session: UsecaseSession }): Promise<AdminDocumentDatabaseStatsView> {
    assertAdminDocumentDatabasePermission(params.session, '查看文档数据库统计');

    const [repairRequestTotal, aiConversationTotal, aiReportTotal, referenceDocumentPage] =
      await Promise.all([
        this.adminRepairRequestQueryService.countAll(),
        this.adminAiConversationQueryService.countAll(),
        this.adminAiReportQueryService.countAll(),
        this.referenceDocumentQueryService.listDocuments({
          filter: {},
          pagination: { page: 1, pageSize: 1, withTotal: true },
        }),
      ]);

    return {
      repairRequestTotal,
      aiConversationTotal,
      aiReportTotal,
      referenceDocumentTotal: referenceDocumentPage.total ?? 0,
    };
  }
}
