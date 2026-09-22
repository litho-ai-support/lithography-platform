// src/adapters/api/graphql/admin-document-database/admin-document-database.resolver.ts

import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/api/graphql/decorators/current-user.decorator';
import { Roles } from '@src/adapters/api/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/api/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/api/graphql/guards/roles.guard';
import { mapGqlToCoreParams } from '@src/adapters/api/graphql/pagination.mapper';
import { PaginationArgs } from '@src/adapters/api/graphql/pagination.args';
import { GetAdminAiReportDetailUsecase } from '@src/usecases/admin-document-database/get-admin-ai-report-detail.usecase';
import { GetAdminDocumentDatabaseStatsUsecase } from '@src/usecases/admin-document-database/get-admin-document-database-stats.usecase';
import { GetAdminRepairRequestSummaryUsecase } from '@src/usecases/admin-document-database/get-admin-repair-request-summary.usecase';
import { ListAdminAiConversationsUsecase } from '@src/usecases/admin-document-database/list-admin-ai-conversations.usecase';
import { ListAdminAiMessagesUsecase } from '@src/usecases/admin-document-database/list-admin-ai-messages.usecase';
import { ListAdminAiReportsUsecase } from '@src/usecases/admin-document-database/list-admin-ai-reports.usecase';
import { ListAdminRepairRequestsUsecase } from '@src/usecases/admin-document-database/list-admin-repair-requests.usecase';
import {
  AdminAiConversationPaginatedDTO,
  AdminAiMessagePaginatedDTO,
  AdminAiReportDetailDTO,
  AdminAiReportPaginatedDTO,
  AdminDocumentDatabaseStatsDTO,
  AdminRepairRequestPaginatedDTO,
  AdminRepairRequestSummaryDTO,
  toAdminAiReportDetailDTO,
  toAdminRepairRequestListItemDTO,
  toAdminRepairRequestSummaryDTO,
} from './dto/admin-document-database.dto';
import {
  AdminAiConversationFilterInput,
  AdminAiReportFilterInput,
  AdminRepairRequestFilterInput,
} from './dto/admin-document-database-filter.input';
import { ValidateAdminDocumentDatabaseInput } from './validate-admin-document-database-input.decorator';

/**
 * 管理员文档数据库（PR3 只读聚合）GraphQL 解析器
 *
 * 职责边界（docs/api/adapters.rules.md）：
 * - 只做协议映射：结构校验 → 调用 usecase → 输出 DTO；业务异常不在此捕获，
 *   交由全局过滤器映射为 GraphQL 错误契约；
 * - 输入校验走模块局部 `ValidateAdminDocumentDatabaseInput`（R2）：DTO 校验失败抛
 *   `DomainError(ADMIN_DOCUMENT_DATABASE_ERROR.INVALID_PARAMS)`，生产环境仍稳定
 *   返回 `BAD_USER_INPUT` + 可读消息（通用 `ValidateInput` 的 BadRequestException
 *   会被生产过滤器降级为 INTERNAL_SERVER_ERROR，不得用于本模块入口）；
 * - 权限口径：守卫层 @Roles(SUPER_ADMIN) 粗准入；精确授权（activeRole === SUPER_ADMIN，
 *   失败关闭）由每个 usecase 首行断言；停用/降级账号旧 Token 由 P0-7 每请求复核；
 * - 只读：不提供任何 Mutation；排序由契约固定（创建时间倒序 + 主键倒序；
 *   AI 消息为 messageSeq 升序），不采纳客户端排序字段；
 * - 参考资料标签复用既有 referenceDocuments / referenceDocument 查询
 *   （工程师/管理员读契约），本解析器不另建平行链路。
 */
@Resolver()
export class AdminDocumentDatabaseResolver {
  constructor(
    private readonly listAdminRepairRequestsUsecase: ListAdminRepairRequestsUsecase,
    private readonly getAdminRepairRequestSummaryUsecase: GetAdminRepairRequestSummaryUsecase,
    private readonly listAdminAiConversationsUsecase: ListAdminAiConversationsUsecase,
    private readonly listAdminAiMessagesUsecase: ListAdminAiMessagesUsecase,
    private readonly listAdminAiReportsUsecase: ListAdminAiReportsUsecase,
    private readonly getAdminAiReportDetailUsecase: GetAdminAiReportDetailUsecase,
    private readonly getAdminDocumentDatabaseStatsUsecase: GetAdminDocumentDatabaseStatsUsecase,
  ) {}

  /**
   * 管理员全局维修申请列表（默认不含软删除；客户关键字经服务端解析为账号集合）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => AdminRepairRequestPaginatedDTO, {
    name: 'adminRepairRequests',
    description: '管理员分页查询全局维修申请列表（仅 SUPER_ADMIN）',
  })
  @ValidateAdminDocumentDatabaseInput()
  async adminRepairRequests(
    @Args('pagination') pagination: PaginationArgs,
    @currentUser() user: JwtPayload,
    @Args('filter', { nullable: true, description: '筛选条件（均可选）' })
    filter?: AdminRepairRequestFilterInput,
  ): Promise<AdminRepairRequestPaginatedDTO> {
    const page = await this.listAdminRepairRequestsUsecase.execute({
      session: mapJwtToUsecaseSession(user),
      pagination: mapGqlToCoreParams(pagination),
      filter: {
        requestNo: filter?.requestNo,
        customerKeyword: filter?.customerKeyword,
        equipmentModelId: filter?.equipmentModelId,
        errorCode: filter?.errorCode,
        isAccepted: filter?.isAccepted,
        createdAtFrom: filter?.createdAtFrom,
        createdAtTo: filter?.createdAtTo,
      },
    });
    return {
      items: page.items.map(toAdminRepairRequestListItemDTO),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }

  /**
   * 管理员维修申请只读摘要（含故障描述与申请正文）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => AdminRepairRequestSummaryDTO, {
    name: 'adminRepairRequestSummary',
    description: '管理员查询维修申请只读摘要（仅 SUPER_ADMIN）',
  })
  async adminRepairRequestSummary(
    @Args({ name: 'id', type: () => Int, description: '维修申请 ID' }) id: number,
    @currentUser() user: JwtPayload,
  ): Promise<AdminRepairRequestSummaryDTO> {
    const summary = await this.getAdminRepairRequestSummaryUsecase.execute({
      session: mapJwtToUsecaseSession(user),
      requestId: id,
    });
    return toAdminRepairRequestSummaryDTO(summary);
  }

  /**
   * 管理员全局 AI 会话列表（含真实消息数/报告数统计）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => AdminAiConversationPaginatedDTO, {
    name: 'adminAiConversations',
    description: '管理员分页查询全局 AI 会话列表（仅 SUPER_ADMIN）',
  })
  @ValidateAdminDocumentDatabaseInput()
  async adminAiConversations(
    @Args('pagination') pagination: PaginationArgs,
    @currentUser() user: JwtPayload,
    @Args('filter', { nullable: true, description: '筛选条件（均可选）' })
    filter?: AdminAiConversationFilterInput,
  ): Promise<AdminAiConversationPaginatedDTO> {
    return this.listAdminAiConversationsUsecase.execute({
      session: mapJwtToUsecaseSession(user),
      pagination: mapGqlToCoreParams(pagination),
      filter: {
        requestNo: filter?.requestNo,
        engineerKeyword: filter?.engineerKeyword,
        status: filter?.status,
        createdAtFrom: filter?.createdAtFrom,
        createdAtTo: filter?.createdAtTo,
      },
    });
  }

  /**
   * 管理员按会话读取 AI 消息列表（稳定顺序：messageSeq 升序 + 主键升序）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => AdminAiMessagePaginatedDTO, {
    name: 'adminAiMessages',
    description: '管理员按会话分页读取 AI 消息列表（仅 SUPER_ADMIN）',
  })
  @ValidateAdminDocumentDatabaseInput()
  async adminAiMessages(
    @Args({ name: 'conversationId', type: () => Int, description: 'AI 会话 ID' })
    conversationId: number,
    @Args('pagination') pagination: PaginationArgs,
    @currentUser() user: JwtPayload,
  ): Promise<AdminAiMessagePaginatedDTO> {
    return this.listAdminAiMessagesUsecase.execute({
      session: mapJwtToUsecaseSession(user),
      conversationId,
      pagination: mapGqlToCoreParams(pagination),
    });
  }

  /**
   * 管理员全局 AI 报告列表（不投影正文大字段）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => AdminAiReportPaginatedDTO, {
    name: 'adminAiReports',
    description: '管理员分页查询全局 AI 报告列表（仅 SUPER_ADMIN）',
  })
  @ValidateAdminDocumentDatabaseInput()
  async adminAiReports(
    @Args('pagination') pagination: PaginationArgs,
    @currentUser() user: JwtPayload,
    @Args('filter', { nullable: true, description: '筛选条件（均可选）' })
    filter?: AdminAiReportFilterInput,
  ): Promise<AdminAiReportPaginatedDTO> {
    return this.listAdminAiReportsUsecase.execute({
      session: mapJwtToUsecaseSession(user),
      pagination: mapGqlToCoreParams(pagination),
      filter: {
        requestNo: filter?.requestNo,
        engineerKeyword: filter?.engineerKeyword,
        reportType: filter?.reportType,
        createdAtFrom: filter?.createdAtFrom,
        createdAtTo: filter?.createdAtTo,
      },
    });
  }

  /**
   * 管理员 AI 报告只读详情（含正文；不提供生成/修改/删除能力）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => AdminAiReportDetailDTO, {
    name: 'adminAiReport',
    description: '管理员查询 AI 报告只读详情（仅 SUPER_ADMIN）',
  })
  async adminAiReport(
    @Args({ name: 'id', type: () => Int, description: 'AI 报告 ID' }) id: number,
    @currentUser() user: JwtPayload,
  ): Promise<AdminAiReportDetailDTO> {
    const detail = await this.getAdminAiReportDetailUsecase.execute({
      session: mapJwtToUsecaseSession(user),
      reportId: id,
    });
    return toAdminAiReportDetailDTO(detail);
  }

  /**
   * 管理员文档数据库统计（四类总数，口径与各标签默认列表过滤一致）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => AdminDocumentDatabaseStatsDTO, {
    name: 'adminDocumentDatabaseStats',
    description: '管理员查询文档数据库统计（仅 SUPER_ADMIN）',
  })
  async adminDocumentDatabaseStats(
    @currentUser() user: JwtPayload,
  ): Promise<AdminDocumentDatabaseStatsDTO> {
    return this.getAdminDocumentDatabaseStatsUsecase.execute({
      session: mapJwtToUsecaseSession(user),
    });
  }
}
