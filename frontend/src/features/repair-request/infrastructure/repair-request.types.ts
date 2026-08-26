// src/features/repair-request/infrastructure/repair-request.types.ts

/**
 * 维修申请 feature 的 GraphQL 契约类型（与后端 DTO 对齐）
 */

export type EquipmentModelOption = {
  id: number;
  modelCode: string;
  modelName: string;
};

export type CreateRepairRequestInput = {
  equipmentModelId: number;
  errorCode: string;
  faultDescription: string;
};

export type RepairRequestRecord = {
  id: number;
  requestNo: string;
  equipmentModelId: number;
  errorCode: string;
  faultDescription: string;
  createdAt: string;
  isAccepted: boolean;
};

/**
 * 业务拒绝原因（domain failure 显式结果），
 * 与后端 REPAIR_REQUEST_ERROR / INPUT_NORMALIZE_ERROR 码组对应
 */
export type CreateRepairRequestFailureReason =
  | 'model-not-found'
  | 'model-disabled'
  | 'invalid-input'
  | 'creation-failed';

export type CreateRepairRequestResult =
  | { ok: true; repairRequest: RepairRequestRecord }
  | {
      ok: false;
      reason: CreateRepairRequestFailureReason;
      message: string;
    };
