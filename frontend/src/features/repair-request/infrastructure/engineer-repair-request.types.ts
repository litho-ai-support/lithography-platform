import type {
  EngineerResolutionStatus,
  EngineerResponse,
  RepairRequestDetail,
  RepairRequestEquipmentModel,
  RepairRequestListItem,
  RepairRequestListPage,
} from './repair-request-read.types';

/**
 * 工程师维修申请读写的 GraphQL 契约类型（与后端公共读模型 DTO 对齐）
 * 以及 feature 内部消费的干净模型。
 *
 * - 原始 DTO 只停留在 feature infrastructure（docs/infrastructure-rules.md 防腐职责）；
 * - application / ui 只消费下方「内部干净模型」段落的类型；
 * - 唯一真源：
 *   - backend/src/adapters/api/graphql/repair-request/dto/repair-request-read.dto.ts；
 *   - backend/src/types/models/repair-request.types.ts（EngineerResolutionStatus）。
 */

/** 工程师回复处理状态（后端正式 GraphQL enum，值域一致） */
export type EngineerResolutionStatusValue = EngineerResolutionStatus;

/** 工程师列表范围，与后端 REPAIR_REQUEST_ENGINEER_LIST_SCOPES 取值严格一致，不创建第三套状态值 */
export type EngineerRepairListScope = 'AVAILABLE' | 'MINE';

/* ------------------------------------------------------------------ */
/* 原始 GraphQL DTO（infrastructure 专用，不对外导出消费）             */
/* ------------------------------------------------------------------ */

export type EquipmentModelDTO = {
  id: number;
  modelCode: string;
  modelName: string;
};

export type RepairRequestListItemDTO = {
  id: number;
  requestNo: string;
  equipmentModel: EquipmentModelDTO;
  errorCode: string;
  /** ISO 字符串（后端 Date 标量） */
  createdAt: string;
  isAccepted: boolean;
  acceptedAt?: string | null;
  latestResolutionStatus?: EngineerResolutionStatusValue | null;
};

export type EngineerResponseDTO = {
  id: number;
  engineerNickname: string;
  resolutionStatus: EngineerResolutionStatusValue;
  responseText: string;
  /** ISO 字符串（后端 Date 标量） */
  createdAt: string;
};

export type RepairRequestDetailDTO = {
  id: number;
  requestNo: string;
  equipmentModel: EquipmentModelDTO;
  errorCode: string;
  faultDescription: string;
  contentMd: string;
  /** ISO 字符串（后端 Date 标量） */
  createdAt: string;
  isAccepted: boolean;
  acceptedAt?: string | null;
  latestResolutionStatus?: EngineerResolutionStatusValue | null;
  responses: EngineerResponseDTO[];
};

export type RepairRequestPaginatedDTO = {
  items: RepairRequestListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
};

/** PaginationArgs 入参（工程师列表仅允许 mode = 'OFFSET'，后端 usecase 强制） */
export type RepairRequestPaginationVariables = {
  mode: 'OFFSET';
  page: number;
  pageSize: number;
  withTotal: boolean;
};

/* ------------------------------------------------------------------ */
/* 内部干净模型（mapper 归一后可空字段收拢为 null，供 application / ui 消费） */
/* ------------------------------------------------------------------ */

/**
 * 设备型号内部模型：由 DTO 显式映射而来，
 * application / ui 不直接引用任何原始 DTO 类型。
 */
export type EngineerRepairRequestEquipmentModel = RepairRequestEquipmentModel;

/** 列表查询参数（scope 与 GraphQL 参数一一对应，分页为 OFFSET 页码口径） */
export type EngineerRepairListQuery = {
  scope: EngineerRepairListScope;
  page: number;
  pageSize: number;
};

export type EngineerRepairRequestListItem = RepairRequestListItem;

export type EngineerRepairRequestPage = RepairRequestListPage;

export type EngineerRepairRequestResponseItem = EngineerResponse;

export type EngineerRepairRequestDetail = RepairRequestDetail;

/**
 * 详情读取的显式失败原因（业务拒绝，非 transport）：
 * - not-accessible：不存在、已删除或无权读取的统一不可访问反馈
 *   （后端对越权统一拒绝且不泄露存在性，前端不再区分）；
 * - load-failed：其他业务大类失败。
 * transport / auth 错误仍按共享错误模型上抛 GraphQLIngressError。
 */
export type EngineerRepairRequestDetailFailureReason = 'not-accessible' | 'load-failed';

export type EngineerRepairRequestDetailResult =
  | { ok: true; detail: EngineerRepairRequestDetail }
  | { ok: false; reason: EngineerRepairRequestDetailFailureReason; message: string };

/**
 * 接单业务拒绝原因（domain failure 显式结果）：
 * 主映射只依赖契约保证稳定的 GraphQL 大类码 extensions.code；
 * REPAIR_REQUEST_ALREADY_ACCEPTED 细节码仅用于可选细化提示，生产隐藏时自动回退。
 */
export type AcceptRepairRequestFailureReason =
  | 'already-accepted'
  | 'not-accessible'
  | 'insufficient-permission'
  | 'accept-failed';

export type AcceptRepairRequestResult =
  | { ok: true; detail: EngineerRepairRequestDetail }
  | { ok: false; reason: AcceptRepairRequestFailureReason; message: string };

/**
 * 工程师追加处理回复命令输入（feature 内部干净输入）。
 * 归属账号由后端 Session 派生，客户端不可也不需要传入任何归属字段（Plan §7.1）。
 * responseText 的空白语义与 resolutionStatus 值域语义由后端收敛；
 * 前端不自行虚构长度上限与默认状态（与后端输入口径一致）。
 */
export type CreateEngineerResponseInput = {
  requestId: number;
  responseText: string;
  resolutionStatus: EngineerResolutionStatusValue;
};

/**
 * 回复业务拒绝原因（domain failure 显式结果）：
 * 主映射只依赖契约保证稳定的 GraphQL 大类码 extensions.code；
 * 生产分支不依赖 extensions.errorCode（Plan §7.5）。
 * - not-accessible：不存在/已删除/已由其他工程师接单的统一不可访问结果，不泄露归属；
 * - not-accepted：申请存在但尚未接单（提示先接单后回复）；
 * - insufficient-permission：已认证但非精确工程师写身份；
 * - invalid-input：requestId/正文/状态非法（后端结构或语义校验拒绝）；
 * - response-failed：后端落库失败或 transport/系统故障 —— 结果不确定（可能已写入），
 *   由编排层只重查确认，绝不自动重发 Mutation（Plan §7.1）。
 */
export type CreateEngineerResponseFailureReason =
  | 'not-accessible'
  | 'not-accepted'
  | 'insufficient-permission'
  | 'invalid-input'
  | 'response-failed';

export type CreateEngineerResponseResult =
  | { ok: true; response: EngineerRepairRequestResponseItem }
  | { ok: false; reason: CreateEngineerResponseFailureReason; message: string };
