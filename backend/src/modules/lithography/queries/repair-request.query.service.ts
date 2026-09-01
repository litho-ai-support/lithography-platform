// src/modules/lithography/queries/repair-request.query.service.ts

import { UsecaseSession } from '@app-types/auth/session.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { EngineerResponseEntity } from '../entities/engineer-response.entity';
import { EquipmentModelEntity } from '../entities/equipment-model.entity';
import { RepairRequestEntity } from '../entities/repair-request.entity';
import {
  EngineerResponseView,
  EquipmentModelView,
  RepairRequestDetailView,
  RepairRequestEngineerListView,
  RepairRequestListItemView,
  RepairRequestListPage,
  RepairRequestListPagination,
} from '../lithography.types';

/** 列表固定排序：创建时间倒序，次级主键倒序（对接方案第二节） */
const LIST_ORDER = { createdAt: 'DESC', id: 'DESC' } as const;

/**
 * 维修申请读侧查询服务
 *
 * 职责范围：
 * - 客户维度有效申请列表（仅本人、未删除）
 * - 工程师两视图列表（待接单 / 本人已接单）
 * - 客户与工程师共用详情（含回复时间线、机型、最新处理状态）
 * - 细粒度读权限判定（对接方案第三节权限矩阵）
 *
 * 不包含：
 * - 任何写入（接单 / 删除 / 回复由各自 Usecase 编排）
 * - 归属类账号 ID 输出（customerAccountId / acceptedByEngineerAccountId 不进入视图）
 */
@Injectable()
export class RepairRequestQueryService {
  constructor(
    @InjectRepository(RepairRequestEntity)
    private readonly requestRepository: Repository<RepairRequestEntity>,
    @InjectRepository(EngineerResponseEntity)
    private readonly responseRepository: Repository<EngineerResponseEntity>,
    @InjectRepository(EquipmentModelEntity)
    private readonly equipmentModelRepository: Repository<EquipmentModelEntity>,
  ) {}

  /**
   * 客户维度列表：仅本人且未删除的申请
   */
  async listByCustomer(params: {
    customerAccountId: number;
    pagination: RepairRequestListPagination;
  }): Promise<RepairRequestListPage> {
    const where = { customerAccountId: params.customerAccountId, deprecated: false };
    return this.listPage(where, params.pagination);
  }

  /**
   * 工程师维度列表：
   * - AWAITING：未删除且未接单（待接单池）
   * - MINE：本人已接单
   */
  async listByEngineer(params: {
    engineerAccountId: number;
    view: RepairRequestEngineerListView;
    pagination: RepairRequestListPagination;
  }): Promise<RepairRequestListPage> {
    const where =
      params.view === 'AWAITING'
        ? { deprecated: false, isAccepted: false }
        : { acceptedByEngineerAccountId: params.engineerAccountId };
    return this.listPage(where, params.pagination);
  }

  /**
   * 共用详情读取（客户 + 工程师），细粒度读权限在本方法内判定。
   *
   * 权限口径（对接方案第三节）：
   * - CUSTOMER：仅本人申请；已删除视为不可访问
   * - ENGINEER：未接单且未删除的申请，或本人已接单的申请
   * - 其余角色（含 SUPER_ADMIN）第一版不继承读权限
   *
   * 不存在、已删除与越权统一拒绝，不区分对外表述，防止资源存在性探测。
   *
   * @throws DomainError PERMISSION_ERROR.ACCESS_DENIED（大类码 FORBIDDEN）
   */
  async findDetail(params: {
    requestId: number;
    session: UsecaseSession;
  }): Promise<RepairRequestDetailView> {
    const entity = await this.requestRepository.findOne({ where: { id: params.requestId } });
    if (!entity || !this.canReadRequest(entity, params.session)) {
      // details 仅含申请标识，不泄露归属与存在性
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '维修申请不存在或不可查看', {
        id: params.requestId,
      });
    }

    const [model, responses] = await Promise.all([
      this.equipmentModelRepository.findOne({ where: { id: entity.equipmentModelId } }),
      this.responseRepository.find({
        where: { requestId: entity.id },
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
    ]);

    return {
      id: entity.id,
      requestNo: entity.requestNo,
      equipmentModel: this.toModelView(model),
      errorCode: entity.errorCode,
      faultDescription: entity.faultDescription,
      contentMd: entity.contentMd,
      createdAt: entity.createdAt,
      isAccepted: entity.isAccepted,
      acceptedAt: entity.acceptedAt,
      latestResolutionStatus:
        responses.length > 0 ? responses[responses.length - 1].resolutionStatus : null,
      responses: responses.map((response) => this.toResponseView(response)),
    };
  }

  /**
   * 细粒度读权限判定（纯函数语义，防探测：不区分「不存在/无权限」）
   *
   * session.roles 由 adapter 边界 mapJwtToUsecaseSession 归一化（大写/去重/去空），
   * 本处直接消费；不用 core 的 hasRole()——其角色层级展开会让 SUPER_ADMIN
   * 继承 ENGINEER/CUSTOMER，与「第一版不继承读权限」裁定相抵触。
   */
  private canReadRequest(entity: RepairRequestEntity, session: UsecaseSession): boolean {
    const isCustomer = session.roles.includes(IdentityTypeEnum.CUSTOMER);
    const isEngineer = session.roles.includes(IdentityTypeEnum.ENGINEER);

    if (isCustomer && entity.customerAccountId === session.accountId) {
      // 客户本人申请：已删除后不可访问
      return !entity.deprecated;
    }
    if (isEngineer) {
      // 工程师：待接单（未删除且未接单）或本人已接单；
      // 已接单分支不受软删除约束（对接方案第三节权限矩阵），
      // 写契约保证已接单申请不可删除，此处为口径自洽而非遗漏
      if (!entity.isAccepted) {
        return !entity.deprecated;
      }
      return entity.acceptedByEngineerAccountId === session.accountId;
    }
    return false;
  }

  private async listPage(
    where: FindOptionsWhere<RepairRequestEntity>,
    pagination: RepairRequestListPagination,
  ): Promise<RepairRequestListPage> {
    const page = Math.max(pagination.page, 1);
    const pageSize = Math.max(pagination.pageSize, 1);
    const [entities, total] = await Promise.all([
      this.requestRepository.find({
        where,
        order: LIST_ORDER,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      pagination.withTotal ? this.requestRepository.count({ where }) : Promise.resolve(undefined),
    ]);
    return {
      items: await this.toListItemViews(entities),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 批量装配列表项视图：机型一次批量读取；最新处理状态按申请维度批量取末条，避免逐行查询
   */
  private async toListItemViews(
    entities: RepairRequestEntity[],
  ): Promise<RepairRequestListItemView[]> {
    if (entities.length === 0) {
      return [];
    }
    const modelIds = [...new Set(entities.map((entity) => entity.equipmentModelId))];
    const requestIds = entities.map((entity) => entity.id);
    const [models, latestStatusByRequestId] = await Promise.all([
      this.equipmentModelRepository.find({ where: { id: In(modelIds) } }),
      this.findLatestResolutionStatusByRequestIds(requestIds),
    ]);
    const modelById = new Map(models.map((model) => [model.id, model]));
    return entities.map((entity) => ({
      id: entity.id,
      requestNo: entity.requestNo,
      equipmentModel: this.toModelView(modelById.get(entity.equipmentModelId)),
      errorCode: entity.errorCode,
      createdAt: entity.createdAt,
      isAccepted: entity.isAccepted,
      acceptedAt: entity.acceptedAt,
      latestResolutionStatus: latestStatusByRequestId.get(entity.id) ?? null,
    }));
  }

  /**
   * 按申请维度取最新回复的处理状态（口径：按创建时间倒序、主键倒序的末条）
   */
  private async findLatestResolutionStatusByRequestIds(
    requestIds: number[],
  ): Promise<Map<number, EngineerResponseEntity['resolutionStatus']>> {
    const responses = await this.responseRepository.find({
      where: { requestId: In(requestIds) },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    const latestByRequestId = new Map<number, EngineerResponseEntity['resolutionStatus']>();
    for (const response of responses) {
      if (!latestByRequestId.has(response.requestId)) {
        latestByRequestId.set(response.requestId, response.resolutionStatus);
      }
    }
    return latestByRequestId;
  }

  private toResponseView(entity: EngineerResponseEntity): EngineerResponseView {
    return {
      id: entity.id,
      engineerAccountId: entity.engineerAccountId,
      resolutionStatus: entity.resolutionStatus,
      responseText: entity.responseText,
      createdAt: entity.createdAt,
    };
  }

  private toModelView(entity: EquipmentModelEntity | null | undefined): EquipmentModelView {
    if (!entity) {
      // 外键保证申请必有型号；极端缺失时返回占位，避免详情整体不可读
      return { id: 0, modelCode: '', modelName: '' };
    }
    return {
      id: entity.id,
      modelCode: entity.modelCode,
      modelName: entity.modelName,
    };
  }
}
