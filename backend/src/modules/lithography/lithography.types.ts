export enum AiConversationStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

export enum AiMessageRole {
  SYSTEM = 'SYSTEM',
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
  TOOL = 'TOOL',
}

export enum EngineerResolutionStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
}

/**
 * 设备型号读侧稳定视图（客户端可见字段）
 */
export type EquipmentModelView = {
  id: number;
  modelCode: string;
  modelName: string;
};

/**
 * 设备型号详情快照（含启用状态，供写流程启用状态校验）
 */
export type EquipmentModelDetailSnapshot = EquipmentModelView & {
  enabled: boolean;
};

/**
 * 维修申请写入数据（由 usecase 完成全部业务判定后传入）
 */
export type RepairRequestInsertData = {
  requestNo: string;
  customerAccountId: number;
  equipmentModelId: number;
  errorCode: string;
  faultDescription: string;
  contentMd: string;
};

/**
 * 维修申请写入完成后的稳定快照（不暴露 ORM Entity）
 */
export type RepairRequestSnapshot = {
  id: number;
  requestNo: string;
  customerAccountId: number;
  equipmentModelId: number;
  errorCode: string;
  faultDescription: string;
  createdAt: Date;
  isAccepted: boolean;
};
