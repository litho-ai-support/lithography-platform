// src/features/repair-request/index.ts

export type {
  CreateRepairRequestFailureReason,
  CreateRepairRequestInput,
  CreateRepairRequestResult,
  EquipmentModelOption,
  RepairRequestRecord,
} from './infrastructure/repair-request.types';
export { createRepairRequest, fetchEquipmentModels } from './infrastructure/repair-request-adapter';
export { RepairRequestForm } from './ui/repair-request-form';
