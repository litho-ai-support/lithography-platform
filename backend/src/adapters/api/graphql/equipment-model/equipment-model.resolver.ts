// src/adapters/api/graphql/equipment-model/equipment-model.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/api/graphql/decorators/current-user.decorator';
import { Roles } from '@src/adapters/api/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/api/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/api/graphql/guards/roles.guard';
import { ListEquipmentModelsUsecase } from '@src/usecases/repair-request/list-equipment-models.usecase';
import { EquipmentModelDTO } from './dto/equipment-model.dto';

/**
 * 设备型号 GraphQL 解析器
 * 提供客户创建维修申请页面的设备型号下拉数据
 */
@Resolver(() => EquipmentModelDTO)
export class EquipmentModelResolver {
  constructor(private readonly listEquipmentModelsUsecase: ListEquipmentModelsUsecase) {}

  /**
   * 查询启用设备型号列表（按显示排序值升序）
   *
   * 角色限制为 CUSTOMER 是当前任务的有意决策（最小权限）：
   * 本查询仅服务“客户创建维修申请”页面；后续工程师接单/超管管理若需读型号，
   * 应在那时扩展 @Roles 或新增独立查询，不提前放宽。
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.CUSTOMER)
  @Query(() => [EquipmentModelDTO], {
    name: 'equipmentModels',
    description: '查询启用设备型号列表',
  })
  async equipmentModels(@currentUser() _user: JwtPayload): Promise<EquipmentModelDTO[]> {
    const models = await this.listEquipmentModelsUsecase.execute();
    return models.map((model) => ({
      id: model.id,
      modelCode: model.modelCode,
      modelName: model.modelName,
    }));
  }
}
