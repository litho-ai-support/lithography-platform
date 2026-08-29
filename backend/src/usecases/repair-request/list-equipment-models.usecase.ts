// src/usecases/repair-request/list-equipment-models.usecase.ts

import { Injectable } from '@nestjs/common';
import { EquipmentModelView } from '@src/modules/lithography/lithography.types';
import { EquipmentModelQueryService } from '@src/modules/lithography/queries/equipment-model.query.service';

/**
 * 查询启用设备型号列表用例
 * 客户创建维修申请页面的设备型号下拉框数据源
 *
 * 角色准入由 adapter 层守卫决策，本用例只承载稳定读取流程
 */
@Injectable()
export class ListEquipmentModelsUsecase {
  constructor(private readonly equipmentModelQueryService: EquipmentModelQueryService) {}

  /**
   * 读取全部启用设备型号，按显示排序值升序
   */
  async execute(): Promise<EquipmentModelView[]> {
    return this.equipmentModelQueryService.listEnabledModels();
  }
}
