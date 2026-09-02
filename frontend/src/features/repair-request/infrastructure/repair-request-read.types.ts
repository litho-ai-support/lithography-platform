// src/features/repair-request/infrastructure/repair-request-read.types.ts

/**
 * 维修申请公共读模型的前端契约类型（与后端 PR #A 落地的读 DTO 逐字段对齐）。
 *
 * 契约依据：负责人 20260901 六条裁定 + backend 读侧 DTO
 * （backend/src/adapters/api/graphql/repair-request/dto/repair-request-read.dto.ts）。
 * 双方（薛的客户切片 / 感電的工程师切片）共用本文件，字段名不得单方面改名；
 * 与后端契约冲突时先沟通再动。
 */

/** 处理状态枚举（后端共享层正式 GraphQL 枚举，裁定 4；数据库值仍为 PENDING / RESOLVED） */
export type EngineerResolutionStatus = 'PENDING' | 'RESOLVED';

/** 处理状态显示映射（公共展示口径，不强行共用整张表格） */
export const RESOLUTION_STATUS_LABELS: Record<EngineerResolutionStatus, string> = {
  PENDING: '处理中',
  RESOLVED: '已解决',
};

export type RepairRequestEquipmentModel = {
  id: number;
  modelCode: string;
  modelName: string;
};

/** 公共列表项（列表查询输出；无任何账号 ID 字段，裁定 3） */
export type RepairRequestListItem = {
  id: number;
  requestNo: string;
  errorCode: string;
  createdAt: string;
  isAccepted: boolean;
  /** 未接单时为 null */
  acceptedAt: string | null;
  /** 最新一条回复的处理状态；无回复时为 null */
  latestResolutionStatus: EngineerResolutionStatus | null;
  equipmentModel: RepairRequestEquipmentModel;
};

/** 工程师回复（实时昵称；昵称缺失由后端回落「工程师」） */
export type EngineerResponse = {
  id: number;
  engineerNickname: string;
  resolutionStatus: EngineerResolutionStatus;
  responseText: string;
  createdAt: string;
};

/** 公共详情（详情查询输出；回复按 createdAt ASC + id ASC） */
export type RepairRequestDetail = {
  id: number;
  requestNo: string;
  errorCode: string;
  faultDescription: string;
  contentMd: string;
  createdAt: string;
  isAccepted: boolean;
  acceptedAt: string | null;
  latestResolutionStatus: EngineerResolutionStatus | null;
  equipmentModel: RepairRequestEquipmentModel;
  responses: EngineerResponse[];
};

/** OFFSET 分页请求参数（真实 adapter 内部补齐 mode/withTotal，调用方不感知） */
export type RepairRequestListPagination = {
  page: number;
  pageSize: number;
};

/** OFFSET 分页结果（列表统一 createdAt DESC + id DESC） */
export type RepairRequestListPage = {
  items: RepairRequestListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * 详情读取结果（domain failure 显式结果）：
 * 不存在 / 非本人 / 已删除由后端统一 NOT_FOUND（防探测，裁定口径），前端归并为 not-found；
 * transport / auth / network 失败不上抛为该结果，仍抛 GraphQLIngressError。
 */
export type MyRepairRequestDetailResult =
  | { ok: true; detail: RepairRequestDetail }
  | { ok: false; reason: 'not-found'; message: string };

/**
 * 删除结果（domain failure 显式结果，裁定 5）：
 * - not-found：不存在 / 非本人（避免泄露他人申请存在性）
 * - already-accepted：已接单不能删（CONFLICT + REPAIR_REQUEST_ALREADY_ACCEPTED）
 * - forbidden：非客户调用（角色 Guard）
 * - invalid-input：参数非法
 * - delete-failed：其余业务失败
 * 同一客户重复删除幂等成功（ok: true）。
 */
export type DeleteMyRepairRequestFailureReason =
  | 'not-found'
  | 'already-accepted'
  | 'forbidden'
  | 'invalid-input'
  | 'delete-failed';

export type DeleteMyRepairRequestResult =
  | { ok: true }
  | {
      ok: false;
      reason: DeleteMyRepairRequestFailureReason;
      message: string;
    };
