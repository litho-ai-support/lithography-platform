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

/**
 * 工程师列表视图枚举（对接方案第三节权限矩阵的两视图）。
 * GraphQL 层以字符串表达，由 Usecase 校验，adapter 不导入本常量。
 */
export const REPAIR_REQUEST_ENGINEER_LIST_VIEWS = ['AWAITING', 'MINE'] as const;

export type RepairRequestEngineerListView = (typeof REPAIR_REQUEST_ENGINEER_LIST_VIEWS)[number];

/**
 * 维修申请列表项稳定读视图。
 * 客户列表、工程师待接单列表、工程师已接单列表复用同一结构（对接方案第一节）；
 * 不暴露归属类账号 ID（customerAccountId / acceptedByEngineerAccountId）。
 */
export type RepairRequestListItemView = {
  id: number;
  requestNo: string;
  equipmentModel: EquipmentModelView;
  errorCode: string;
  createdAt: Date;
  isAccepted: boolean;
  acceptedAt: Date | null;
  /** 最新回复处理状态；尚无回复时为 null */
  latestResolutionStatus: EngineerResolutionStatus | null;
};

/**
 * 工程师回复稳定读视图。
 * engineerAccountId 为展示专用字段（第一版昵称方案撤回后的唯一身份载体）：
 * 不参与归属判断、不作为访问控制依据，前端只读不回传。
 */
export type EngineerResponseView = {
  id: number;
  engineerAccountId: number;
  resolutionStatus: EngineerResolutionStatus;
  responseText: string;
  createdAt: Date;
};

/**
 * 列表分页参数（仅 OFFSET；第一版排序由契约固定，不提供客户端自定义排序）
 */
export type RepairRequestListPagination = {
  page: number;
  pageSize: number;
  withTotal: boolean;
};

/**
 * 列表分页结果
 */
export type RepairRequestListPage = {
  items: RepairRequestListItemView[];
  total?: number;
  page: number;
  pageSize: number;
};

/**
 * 维修申请详情稳定读视图（客户与工程师共用结构，读权限由 QueryService 按身份判定）。
 * responses 按 createdAt ASC + id ASC 排序；不暴露归属类账号 ID。
 */
export type RepairRequestDetailView = {
  id: number;
  requestNo: string;
  equipmentModel: EquipmentModelView;
  errorCode: string;
  faultDescription: string;
  contentMd: string;
  createdAt: Date;
  isAccepted: boolean;
  acceptedAt: Date | null;
  /** 最新回复处理状态（按 createdAt DESC + id DESC 取末条）；尚无回复时为 null */
  latestResolutionStatus: EngineerResolutionStatus | null;
  responses: EngineerResponseView[];
};
