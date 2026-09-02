// src/usecases/repair-request/repair-request-usecases.module.ts

import { Module } from '@nestjs/common';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { LithographyModule } from '@src/modules/lithography/lithography.module';
import { AcceptRepairRequestUsecase } from './accept-repair-request.usecase';
import { CreateRepairRequestUsecase } from './create-repair-request.usecase';
import { DeleteMyRepairRequestUsecase } from './delete-my-repair-request.usecase';
import { GetEngineerRepairRequestDetailUsecase } from './get-engineer-repair-request-detail.usecase';
import { GetMyRepairRequestDetailUsecase } from './get-my-repair-request-detail.usecase';
import { ListEquipmentModelsUsecase } from './list-equipment-models.usecase';
import { ListEngineerRepairRequestsUsecase } from './list-engineer-repair-requests.usecase';
import { ListMyRepairRequestsUsecase } from './list-my-repair-requests.usecase';

@Module({
  imports: [LithographyModule, AccountInstallerModule],
  providers: [
    AcceptRepairRequestUsecase,
    CreateRepairRequestUsecase,
    DeleteMyRepairRequestUsecase,
    GetEngineerRepairRequestDetailUsecase,
    GetMyRepairRequestDetailUsecase,
    ListEquipmentModelsUsecase,
    ListEngineerRepairRequestsUsecase,
    ListMyRepairRequestsUsecase,
  ],
  exports: [
    AcceptRepairRequestUsecase,
    CreateRepairRequestUsecase,
    DeleteMyRepairRequestUsecase,
    GetEngineerRepairRequestDetailUsecase,
    GetMyRepairRequestDetailUsecase,
    ListEquipmentModelsUsecase,
    ListEngineerRepairRequestsUsecase,
    ListMyRepairRequestsUsecase,
  ],
})
export class RepairRequestUsecasesModule {}
