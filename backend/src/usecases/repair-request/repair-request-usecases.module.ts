// src/usecases/repair-request/repair-request-usecases.module.ts

import { Module } from '@nestjs/common';
import { LithographyModule } from '@src/modules/lithography/lithography.module';
import { CreateRepairRequestUsecase } from './create-repair-request.usecase';
import { ListEquipmentModelsUsecase } from './list-equipment-models.usecase';

@Module({
  imports: [LithographyModule],
  providers: [CreateRepairRequestUsecase, ListEquipmentModelsUsecase],
  exports: [CreateRepairRequestUsecase, ListEquipmentModelsUsecase],
})
export class RepairRequestUsecasesModule {}
