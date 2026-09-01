// src/usecases/repair-request/repair-request-usecases.module.ts

import { Module } from '@nestjs/common';
import { LithographyModule } from '@src/modules/lithography/lithography.module';
import { CreateRepairRequestUsecase } from './create-repair-request.usecase';
import { GetRepairRequestDetailUsecase } from './get-repair-request-detail.usecase';
import { ListEquipmentModelsUsecase } from './list-equipment-models.usecase';
import { ListEngineerRepairRequestsUsecase } from './list-engineer-repair-requests.usecase';
import { ListMyRepairRequestsUsecase } from './list-my-repair-requests.usecase';

@Module({
  imports: [LithographyModule],
  providers: [
    CreateRepairRequestUsecase,
    GetRepairRequestDetailUsecase,
    ListEquipmentModelsUsecase,
    ListEngineerRepairRequestsUsecase,
    ListMyRepairRequestsUsecase,
  ],
  exports: [
    CreateRepairRequestUsecase,
    GetRepairRequestDetailUsecase,
    ListEquipmentModelsUsecase,
    ListEngineerRepairRequestsUsecase,
    ListMyRepairRequestsUsecase,
  ],
})
export class RepairRequestUsecasesModule {}
