// src/features/repair-request/index.ts

export type {
  CreateRepairRequestFailureReason,
  CreateRepairRequestInput,
  CreateRepairRequestResult,
  EquipmentModelOption,
  RepairRequestRecord,
} from './infrastructure/repair-request.types';
export {
  createRepairRequest,
  deleteMyRepairRequest,
  fetchEquipmentModels,
  fetchMyRepairRequest,
  fetchMyRepairRequests,
} from './infrastructure/repair-request-adapter';
export { RepairRequestForm } from './ui/repair-request-form';

// ---- 维修申请公共读模型（PR #A 契约；客户切片与工程师切片共用） ----

export type {
  DeleteMyRepairRequestFailureReason,
  DeleteMyRepairRequestResult,
  EngineerResolutionStatus,
  EngineerResponse,
  MyRepairRequestDetail,
  MyRepairRequestDetailResult,
  MyRepairRequestListItem,
  RepairRequestEquipmentModel,
  RepairRequestListPage,
  RepairRequestListPagination,
} from './infrastructure/repair-request-read.types';
export { RESOLUTION_STATUS_LABELS } from './infrastructure/repair-request-read.types';

// 数据访问统一出口：T-02 已切换为真实 GraphQL adapter（与 Mock 同名同签名），
// 页面组件零改动。Mock 实现与隔离函数（resetMyRepairRequestMockState）均不进 barrel，
// 仅测试从 mock-adapter 文件直连导入，保持公开 API 面与真实 adapter 一致（review 裁定 C-1）。
