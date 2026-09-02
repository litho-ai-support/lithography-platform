import { EngineerResolutionStatus } from '@app-types/models/repair-request.types';

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
 * 维修申请原子接单写入数据。
 * engineerAccountId 仅来自后端 Session，acceptedAt 仅来自后端系统事件时间，
 * 两者均不得由客户端传入（由 UseCase 保证）。
 */
export type RepairRequestAcceptData = {
  requestId: number;
  engineerAccountId: number;
  acceptedAt: Date;
};

/**
 * 维修申请原子接单写入结果：仅表达 UseCase 裁决所需信息，不暴露 ORM Entity。
 * affected = 1 代表条件更新命中并写入成功；0 代表无可接单行，
 * 由 UseCase 结合最小状态读取区分“不存在/已删除”与“已接单”。
 */
export type RepairRequestAcceptWriteResult = {
  affected: number;
};

/**
 * 接单最小状态快照：仅供接单 UseCase 在条件更新未命中时裁决错误类别，
 * 不得流入 Adapter 或前端。
 */
export type RepairRequestAcceptanceStatusSnapshot = {
  id: number;
  isAccepted: boolean;
  deprecated: boolean;
};

/**
 * 工程师列表范围枚举（负责人 20260901 裁定：scope = AVAILABLE / MINE）。
 * GraphQL 层以字符串表达，由 Usecase 校验，adapter 不导入本常量。
 */
export const REPAIR_REQUEST_ENGINEER_LIST_SCOPES = ['AVAILABLE', 'MINE'] as const;

export type RepairRequestEngineerListScope = (typeof REPAIR_REQUEST_ENGINEER_LIST_SCOPES)[number];

/**
 * 详情读入口的角色范围：客户入口与工程师入口按角色分开（负责人 20260901 裁定），
 * 同一 DTO 由 QueryService 按 scope 限定有效身份判定数据范围。
 */
export type RepairRequestDetailReadScope = 'CUSTOMER' | 'ENGINEER';

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
 * 工程师回复稳定读视图（对外契约）。
 * engineerNickname 为实时关联账号安全昵称（负责人裁定 3：不存快照，读时关联返回，
 * 缺失回落「工程师」由 usecase 保证）；不返回工程师账号 ID。
 */
export type EngineerResponseView = {
  id: number;
  engineerNickname: string;
  resolutionStatus: EngineerResolutionStatus;
  responseText: string;
  createdAt: Date;
};

/**
 * 工程师回复 QueryService 内部装配结果：含归属工程师账号 ID，
 * 仅供 usecase 跨域富集昵称使用，不对外输出。
 */
export type EngineerResponseQueryResult = Omit<EngineerResponseView, 'engineerNickname'> & {
  engineerAccountId: number;
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
 * 维修申请详情稳定读视图（客户与工程师入口共用结构，读权限由 QueryService 按身份判定）。
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

/**
 * 详情 QueryService 装配结果（昵称富集前）：回复含工程师账号 ID，
 * 由 usecase 跨域富集为工程师昵称后才对外输出。
 */
export type RepairRequestDetailQueryResult = Omit<RepairRequestDetailView, 'responses'> & {
  responses: EngineerResponseQueryResult[];
};
