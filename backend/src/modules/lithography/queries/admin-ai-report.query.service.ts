// src/modules/lithography/queries/admin-ai-report.query.service.ts

import { DomainError, ADMIN_DOCUMENT_DATABASE_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { AiReportEntity } from '../entities/ai-report.entity';
import { RepairRequestEntity } from '../entities/repair-request.entity';
import type {
  AdminAiReportDetailQueryResult,
  AdminAiReportListItemQueryResult,
  AdminAiReportListPage,
  AdminAiReportQueryFilter,
  AdminListPagination,
} from '../admin-document-database.types';

/** LIKE 通配符转义，避免用户输入 % / _ 意外扩大匹配范围 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * 管理员 AI 报告读侧查询服务（PR3 只读聚合）
 *
 * 职责范围：
 * - 全局 AI 报告列表（分页 + 编号/类型/时间范围筛选；不投影正文大字段）
 * - 单条报告详情（含正文 contentMd，只读）
 * - 管理员统计总数
 *
 * 不包含（计划表 S2 分层边界）：
 * - 任何写入操作，不改既有 (conversationId, reportType) 唯一约束；
 * - 角色准入判定（由守卫与 usecase 的管理员权限断言决策）；
 * - 跨账户域读取（工程师展示信息不在此富集：装配结果仅携带账号 ID，
 *   由 usecase 经账户域 QueryService 批量富集后对外输出）。
 *
 * 实现说明：requestNo 筛选经本域 repair_request 关联，全部筛选保持在
 * SQL 侧执行以保证分页正确性。
 */
@Injectable()
export class AdminAiReportQueryService {
  constructor(
    @InjectRepository(AiReportEntity)
    private readonly reportRepository: Repository<AiReportEntity>,
    @InjectRepository(RepairRequestEntity)
    private readonly requestRepository: Repository<RepairRequestEntity>,
  ) {}

  /**
   * 全局列表：固定排序，OFFSET 分页；列表不投影 contentMd 大字段。
   * 账号 ID 集合筛选由 usecase 解析后传入；空集合在进入查询前短路。
   */
  async listAll(params: {
    filter?: AdminAiReportQueryFilter;
    pagination: AdminListPagination;
  }): Promise<
    Omit<AdminAiReportListPage, 'items'> & { items: AdminAiReportListItemQueryResult[] }
  > {
    const filter = params.filter;
    if (filter?.engineerAccountIds && filter.engineerAccountIds.length === 0) {
      return this.emptyPage(params.pagination);
    }

    const page = Math.max(params.pagination.page, 1);
    const pageSize = Math.max(params.pagination.pageSize, 1);

    const qb = this.reportRepository
      .createQueryBuilder('report')
      .leftJoin(RepairRequestEntity, 'request', 'request.id = report.requestId')
      .orderBy('report.createdAt', 'DESC')
      .addOrderBy('report.id', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    this.applyFilters(qb, filter);

    const [entities, total] = await Promise.all([
      qb.getMany(),
      params.pagination.withTotal ? this.countByFilter(filter) : Promise.resolve(undefined),
    ]);

    return {
      items: await this.toListItemQueryResults(entities),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 单条报告详情（含正文）。
   * 不存在统一 NOT_FOUND（不区分「不存在」与其他不可访问原因）。
   *
   * @throws DomainError ADMIN_DOCUMENT_DATABASE_ERROR.NOT_FOUND（对外大类 NOT_FOUND）
   */
  async findDetailById(reportId: number): Promise<AdminAiReportDetailQueryResult> {
    const entity = await this.reportRepository.findOne({ where: { id: reportId } });
    if (!entity) {
      throw new DomainError(ADMIN_DOCUMENT_DATABASE_ERROR.NOT_FOUND, 'AI 报告不存在或不可访问', {
        reportId,
      });
    }

    const request = await this.requestRepository.findOne({
      where: { id: entity.requestId },
      select: { id: true, requestNo: true },
    });

    return {
      id: entity.id,
      requestId: entity.requestId,
      requestNo: request?.requestNo ?? '',
      conversationId: entity.conversationId,
      engineerAccountId: entity.engineerAccountId,
      reportTitle: entity.reportTitle,
      reportType: entity.reportType,
      contentMd: entity.contentMd,
      createdAt: entity.createdAt,
    };
  }

  /** 管理员统计：全局 AI 报告总数 */
  async countAll(): Promise<number> {
    return this.reportRepository.count();
  }

  private applyFilters(
    qb: SelectQueryBuilder<AiReportEntity>,
    filter?: AdminAiReportQueryFilter,
  ): void {
    if (!filter) {
      return;
    }
    if (filter.requestNo) {
      const pattern = `%${escapeLikePattern(filter.requestNo)}%`;
      qb.andWhere('request.requestNo LIKE :requestNoPattern', { requestNoPattern: pattern });
    }
    if (filter.engineerAccountIds) {
      qb.andWhere('report.engineerAccountId IN (:...engineerAccountIds)', {
        engineerAccountIds: [...filter.engineerAccountIds],
      });
    }
    if (filter.reportType) {
      qb.andWhere('report.reportType = :reportType', { reportType: filter.reportType });
    }
    if (filter.createdAtFrom || filter.createdAtTo) {
      qb.andWhere(
        new Brackets((where) => {
          where.where('report.createdAt >= :createdAtFrom', {
            createdAtFrom: filter.createdAtFrom ?? new Date(0),
          });
          where.andWhere('report.createdAt <= :createdAtTo', {
            createdAtTo: filter.createdAtTo ?? new Date(),
          });
        }),
      );
    }
  }

  private countByFilter(filter?: AdminAiReportQueryFilter): Promise<number> {
    const qb = this.reportRepository
      .createQueryBuilder('report')
      .leftJoin(RepairRequestEntity, 'request', 'request.id = report.requestId');
    this.applyFilters(qb, filter);
    return qb.getCount();
  }

  private emptyPage(
    pagination: AdminListPagination,
  ): Omit<AdminAiReportListPage, 'items'> & { items: AdminAiReportListItemQueryResult[] } {
    return {
      items: [],
      total: pagination.withTotal ? 0 : undefined,
      page: Math.max(pagination.page, 1),
      pageSize: Math.max(pagination.pageSize, 1),
    };
  }

  /** 批量装配列表项：关联申请编号一次批量读取，避免逐行查询 */
  private async toListItemQueryResults(
    entities: AiReportEntity[],
  ): Promise<AdminAiReportListItemQueryResult[]> {
    if (entities.length === 0) {
      return [];
    }

    const requestIds = [...new Set(entities.map((entity) => entity.requestId))];
    const requests = await this.requestRepository.find({
      where: { id: In(requestIds) },
      select: { id: true, requestNo: true },
    });
    const requestNoByRequestId = new Map(
      requests.map((request) => [request.id, request.requestNo]),
    );

    return entities.map((entity) => ({
      id: entity.id,
      requestId: entity.requestId,
      requestNo: requestNoByRequestId.get(entity.requestId) ?? '',
      conversationId: entity.conversationId,
      engineerAccountId: entity.engineerAccountId,
      reportTitle: entity.reportTitle,
      reportType: entity.reportType,
      createdAt: entity.createdAt,
    }));
  }
}
