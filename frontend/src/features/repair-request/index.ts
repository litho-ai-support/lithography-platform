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

// 数据访问统一出口：阶段一指向 Mock 实现，阶段三（T-01/T-02）在 barrel 内
// 切换为真实 GraphQL adapter（同名导出），页面组件零改动。
// 注意：Mock 隔离函数（resetMyRepairRequestMockState）不进 barrel，
// 仅测试从 mock-adapter 文件直连导入，保持公开 API 面与真实 adapter 一致。
export {
  deleteMyRepairRequest,
  fetchMyRepairRequest,
  fetchMyRepairRequests,
} from './infrastructure/repair-request-read-mock-adapter';
