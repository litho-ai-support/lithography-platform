// src/modules/lithography/queries/reference-document.query.service.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { DomainError, REFERENCE_DOCUMENT_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getTypeOrmEntityManager } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { FindOptionsWhere, In, Raw, Repository } from 'typeorm';
import { EquipmentModelEntity } from '../entities/equipment-model.entity';
import { ReferenceDocumentEntity } from '../entities/reference-document.entity';
import {
  ReferenceDocumentDetailQueryResult,
  ReferenceDocumentListFilter,
  ReferenceDocumentListPage,
  ReferenceDocumentListPagination,
  ReferenceDocumentListItemQueryResult,
} from '../lithography.types';

/** 列表固定排序：创建时间倒序，次级主键倒序（与维修申请读模型同口径） */
const LIST_ORDER = { createdAt: 'DESC', id: 'DESC' } as const;

/** 标题模糊搜索：转义 LIKE 通配符，避免用户输入 % / _ 意外扩大匹配范围 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * AI 参考资料读侧查询服务
 *
 * 职责范围：
 * - 未软删资料列表（分页 + 标题模糊搜索 + 文档类型等值 + 设备型号等值筛选）
 * - 未软删资料详情（完整元数据 + 文本内容）
 * - 列表批量装配设备型号名称，避免逐行查询
 *
 * 不包含：
 * - 角色准入判定（读准入 ENGINEER/SUPER_ADMIN 由守卫与 usecase 决策；资料无归属概念）
 * - 任何写入（创建/编辑/软删除由写服务与各自 Usecase 编排）
 * - 创建人昵称富集（装配结果含 createdByAccountId，由 usecase 跨域关联账号域昵称后对外输出）
 * - 存储引用与服务器路径输出（storageBackend/storageReference 不进入任何视图）
 */
@Injectable()
export class ReferenceDocumentQueryService {
  constructor(
    @InjectRepository(ReferenceDocumentEntity)
    private readonly documentRepository: Repository<ReferenceDocumentEntity>,
    @InjectRepository(EquipmentModelEntity)
    private readonly equipmentModelRepository: Repository<EquipmentModelEntity>,
  ) {}

  /**
   * 未软删资料列表：默认过滤已软删（deprecated = 0），固定排序，OFFSET 分页。
   * 列表项为昵称富集前装配结果，由 usecase 富集创建人昵称后对外输出。
   */
  async listDocuments(params: {
    filter: ReferenceDocumentListFilter;
    pagination: ReferenceDocumentListPagination;
  }): Promise<
    Omit<ReferenceDocumentListPage, 'items'> & { items: ReferenceDocumentListItemQueryResult[] }
  > {
    const where: FindOptionsWhere<ReferenceDocumentEntity> = { deprecated: false };
    if (params.filter.title) {
      where.title = Raw((alias) => `${alias} LIKE :pattern`, {
        pattern: `%${escapeLikePattern(params.filter.title)}%`,
      });
    }
    if (params.filter.documentType) {
      where.documentType = params.filter.documentType;
    }
    if (params.filter.equipmentModelId !== undefined) {
      where.equipmentModelId = params.filter.equipmentModelId;
    }

    const page = Math.max(params.pagination.page, 1);
    const pageSize = Math.max(params.pagination.pageSize, 1);
    const [entities, total] = await Promise.all([
      this.documentRepository.find({
        where,
        order: LIST_ORDER,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      params.pagination.withTotal
        ? this.documentRepository.count({ where })
        : Promise.resolve(undefined),
    ]);
    return {
      items: await this.toListItemQueryResults(entities),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 未软删资料详情：完整元数据 + 文本内容
   *
   * 不存在与已软删统一拒绝（负责人 docx 验收标准：返回统一的 NOT_FOUND，不泄露删除状态）。
   * 携带 transactionContext 时改用事务内 EntityManager 的 Repository，
   * 供写用例在事务连接上读当前值，避免读-改-写竞态。
   *
   * @throws DomainError REFERENCE_DOCUMENT_ERROR.NOT_FOUND（大类码 NOT_FOUND）
   */
  async findDetail(params: {
    documentId: number;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<ReferenceDocumentDetailQueryResult> {
    const entity = await this.getDocumentRepository(params.transactionContext).findOne({
      where: { id: params.documentId },
    });
    if (!entity || entity.deprecated) {
      // details 仅含资料标识，不区分「不存在」与「已软删」，防删除状态探测
      throw new DomainError(REFERENCE_DOCUMENT_ERROR.NOT_FOUND, '参考资料不存在或不可访问', {
        id: params.documentId,
      });
    }

    const model = entity.equipmentModelId
      ? await this.equipmentModelRepository.findOne({ where: { id: entity.equipmentModelId } })
      : null;

    return {
      id: entity.id,
      title: entity.title,
      documentType: entity.documentType,
      equipmentModelId: entity.equipmentModelId,
      equipmentModelName: model?.modelName ?? null,
      description: entity.description,
      originalFilename: entity.originalFilename,
      mimeType: entity.mimeType,
      // 「有文件」权威判定（= storageReference 非空）：前端下载按钮与编辑放行均以本字段为准，
      // 不再从 originalFilename 推断——有文件名但无存储引用的行（如 seed/legacy）不承诺可下载
      hasFile: entity.storageReference !== null,
      contentText: entity.contentText,
      createdByAccountId: entity.createdByAccountId,
      // 内部装配字段：仅供下载用例定位存储对象，不进入对外 DTO
      storageReference: entity.storageReference,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /** 事务上下文存在时改用事务内 EntityManager 的 Repository（与 EquipmentModelQueryService 同模式） */
  private getDocumentRepository(
    transactionContext?: PersistenceTransactionContext,
  ): Repository<ReferenceDocumentEntity> {
    const manager = transactionContext ? getTypeOrmEntityManager(transactionContext) : undefined;
    return manager ? manager.getRepository(ReferenceDocumentEntity) : this.documentRepository;
  }

  /** 批量装配列表项：设备型号名称一次批量读取，避免逐行查询 */
  private async toListItemQueryResults(
    entities: ReferenceDocumentEntity[],
  ): Promise<ReferenceDocumentListItemQueryResult[]> {
    if (entities.length === 0) {
      return [];
    }
    const modelIds = [
      ...new Set(
        entities.map((entity) => entity.equipmentModelId).filter((id): id is number => id !== null),
      ),
    ];
    const models = modelIds.length
      ? await this.equipmentModelRepository.find({ where: { id: In(modelIds) } })
      : [];
    const nameByModelId = new Map(models.map((model) => [model.id, model.modelName]));
    return entities.map((entity) => ({
      id: entity.id,
      title: entity.title,
      documentType: entity.documentType,
      equipmentModelId: entity.equipmentModelId,
      equipmentModelName: entity.equipmentModelId
        ? (nameByModelId.get(entity.equipmentModelId) ?? null)
        : null,
      description: entity.description,
      originalFilename: entity.originalFilename,
      createdByAccountId: entity.createdByAccountId,
      createdAt: entity.createdAt,
    }));
  }
}
