// src/adapters/api/graphql/repair-request/repair-request.resolver.ts

import { EngineerResolutionStatus } from '@app-types/models/repair-request.types';
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ValidateInput } from '@adapters/api/graphql/common/validate-input.decorator';
import { currentUser } from '@src/adapters/api/graphql/decorators/current-user.decorator';
import { Roles } from '@src/adapters/api/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/api/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/api/graphql/guards/roles.guard';
import { mapGqlToCoreParams } from '@src/adapters/api/graphql/pagination.mapper';
import { PaginationArgs } from '@src/adapters/api/graphql/pagination.args';
import { CreateRepairRequestUsecase } from '@src/usecases/repair-request/create-repair-request.usecase';
import { GetEngineerRepairRequestDetailUsecase } from '@src/usecases/repair-request/get-engineer-repair-request-detail.usecase';
import { GetMyRepairRequestDetailUsecase } from '@src/usecases/repair-request/get-my-repair-request-detail.usecase';
import { ListEngineerRepairRequestsUsecase } from '@src/usecases/repair-request/list-engineer-repair-requests.usecase';
import { ListMyRepairRequestsUsecase } from '@src/usecases/repair-request/list-my-repair-requests.usecase';
import { CreateRepairRequestInput } from './dto/create-repair-request.input';
import { RepairRequestDTO } from './dto/repair-request.dto';
import {
  RepairRequestDetailDTO,
  RepairRequestListItemDTO,
  RepairRequestPaginatedDTO,
} from './dto/repair-request-read.dto';

/**
 * 维修申请 GraphQL 解析器
 * 仅做协议映射：结构校验 → 调用 usecase → 输出 DTO
 * 业务异常不在此捕获，交由全局过滤器映射为 GraphQL 错误契约
 */
@Resolver(() => RepairRequestDTO)
export class RepairRequestResolver {
  constructor(
    private readonly createRepairRequestUsecase: CreateRepairRequestUsecase,
    private readonly listMyRepairRequestsUsecase: ListMyRepairRequestsUsecase,
    private readonly listEngineerRepairRequestsUsecase: ListEngineerRepairRequestsUsecase,
    private readonly getMyRepairRequestDetailUsecase: GetMyRepairRequestDetailUsecase,
    private readonly getEngineerRepairRequestDetailUsecase: GetEngineerRepairRequestDetailUsecase,
  ) {}

  /**
   * 客户创建维修申请
   * 仅 CUSTOMER 可提交；customerAccountId 取自会话，客户端不可传入
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.CUSTOMER)
  @Mutation(() => RepairRequestDTO, { description: '客户创建维修申请' })
  @ValidateInput()
  async createRepairRequest(
    @Args('input') input: CreateRepairRequestInput,
    @currentUser() user: JwtPayload,
  ): Promise<RepairRequestDTO> {
    const snapshot = await this.createRepairRequestUsecase.execute({
      session: {
        accountId: user.sub,
        accessGroup: user.accessGroup,
      },
      equipmentModelId: input.equipmentModelId,
      errorCode: input.errorCode,
      faultDescription: input.faultDescription,
    });
    return {
      id: snapshot.id,
      requestNo: snapshot.requestNo,
      equipmentModelId: snapshot.equipmentModelId,
      errorCode: snapshot.errorCode,
      faultDescription: snapshot.faultDescription,
      createdAt: snapshot.createdAt,
      isAccepted: snapshot.isAccepted,
    };
  }

  /**
   * 客户查询自己的维修申请列表（仅本人、未删除）
   * 排序由契约固定：创建时间倒序 + 主键倒序；仅支持 OFFSET 分页（usecase 强制）
   * SUPER_ADMIN 按角色继承规则准入（负责人 20260901 裁定 2）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.CUSTOMER, IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => RepairRequestPaginatedDTO, { description: '客户查询自己的维修申请列表' })
  @ValidateInput()
  async myRepairRequests(
    @Args('pagination') pagination: PaginationArgs,
    @currentUser() user: JwtPayload,
  ): Promise<RepairRequestPaginatedDTO> {
    const page = await this.listMyRepairRequestsUsecase.execute({
      session: mapJwtToUsecaseSession(user),
      pagination: mapGqlToCoreParams(pagination),
    });
    return {
      items: page.items.map((item) => this.toListItemDTO(item)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }

  /**
   * 工程师查询维修申请列表：scope = AVAILABLE（待接单）/ MINE（我的接单）
   * 范围取值由 usecase 校验；排序与分页口径同客户列表；
   * SUPER_ADMIN 按角色继承规则准入（负责人 20260901 裁定 2）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.ENGINEER, IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => RepairRequestPaginatedDTO, {
    description: '工程师查询维修申请列表（待接单 / 我的接单）',
  })
  @ValidateInput()
  async engineerRepairRequests(
    @Args('scope', { description: '列表范围：AVAILABLE（待接单）/ MINE（我的接单）' })
    scope: string,
    @Args('pagination') pagination: PaginationArgs,
    @currentUser() user: JwtPayload,
  ): Promise<RepairRequestPaginatedDTO> {
    const page = await this.listEngineerRepairRequestsUsecase.execute({
      session: mapJwtToUsecaseSession(user),
      scope,
      pagination: mapGqlToCoreParams(pagination),
    });
    return {
      items: page.items.map((item) => this.toListItemDTO(item)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }

  /**
   * 客户查询自己的维修申请详情（含回复时间线）
   * 细粒度读权限由 QueryService 按客户身份判定；越权统一拒绝，不泄露存在性；
   * SUPER_ADMIN 按角色继承规则准入（负责人 20260901 裁定 2）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.CUSTOMER, IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => RepairRequestDetailDTO, { description: '客户查询自己的维修申请详情（含回复）' })
  async myRepairRequest(
    @Args({ name: 'id', type: () => Int, description: '维修申请 ID' }) id: number,
    @currentUser() user: JwtPayload,
  ): Promise<RepairRequestDetailDTO> {
    const detail = await this.getMyRepairRequestDetailUsecase.execute({
      requestId: id,
      session: mapJwtToUsecaseSession(user),
    });
    return this.toDetailDTO(detail);
  }

  /**
   * 工程师查询维修申请详情（含回复时间线）
   * 细粒度读权限由 QueryService 按工程师身份判定（未接单未删除 ∨ 本人已接单）；
   * 越权统一拒绝，不泄露存在性；SUPER_ADMIN 按角色继承规则准入（裁定 2）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.ENGINEER, IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => RepairRequestDetailDTO, { description: '工程师查询维修申请详情（含回复）' })
  async engineerRepairRequest(
    @Args({ name: 'id', type: () => Int, description: '维修申请 ID' }) id: number,
    @currentUser() user: JwtPayload,
  ): Promise<RepairRequestDetailDTO> {
    const detail = await this.getEngineerRepairRequestDetailUsecase.execute({
      requestId: id,
      session: mapJwtToUsecaseSession(user),
    });
    return this.toDetailDTO(detail);
  }

  /**
   * 详情视图 → DTO（回复含工程师安全昵称，不返回工程师账号 ID）
   */
  private toDetailDTO(detail: {
    id: number;
    requestNo: string;
    equipmentModel: { id: number; modelCode: string; modelName: string };
    errorCode: string;
    faultDescription: string;
    contentMd: string;
    createdAt: Date;
    isAccepted: boolean;
    acceptedAt: Date | null;
    latestResolutionStatus: EngineerResolutionStatus | null;
    responses: Array<{
      id: number;
      engineerNickname: string;
      resolutionStatus: EngineerResolutionStatus;
      responseText: string;
      createdAt: Date;
    }>;
  }): RepairRequestDetailDTO {
    return {
      ...this.toListItemDTO(detail),
      faultDescription: detail.faultDescription,
      contentMd: detail.contentMd,
      responses: detail.responses.map((response) => ({
        id: response.id,
        engineerNickname: response.engineerNickname,
        resolutionStatus: response.resolutionStatus,
        responseText: response.responseText,
        createdAt: response.createdAt,
      })),
    };
  }

  /**
   * 列表项视图 → DTO（详情复用同一映射，字段子集兼容）
   */
  private toListItemDTO(view: {
    id: number;
    requestNo: string;
    equipmentModel: { id: number; modelCode: string; modelName: string };
    errorCode: string;
    createdAt: Date;
    isAccepted: boolean;
    acceptedAt: Date | null;
    latestResolutionStatus: EngineerResolutionStatus | null;
  }): RepairRequestListItemDTO {
    return {
      id: view.id,
      requestNo: view.requestNo,
      equipmentModel: {
        id: view.equipmentModel.id,
        modelCode: view.equipmentModel.modelCode,
        modelName: view.equipmentModel.modelName,
      },
      errorCode: view.errorCode,
      createdAt: view.createdAt,
      isAccepted: view.isAccepted,
      acceptedAt: view.acceptedAt,
      latestResolutionStatus: view.latestResolutionStatus,
    };
  }
}
