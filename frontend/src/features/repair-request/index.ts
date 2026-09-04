// src/features/repair-request/index.ts

// barrel 只导出切片外实际消费的公开 API：
// 工程师列表/详情面板、路径常量与客户创建表单。
// application 层 hooks（useAcceptRepairRequest / useCreateEngineerResponse /
// useEngineerRepairRequestDetail / useEngineerRepairRequestDetailFlow /
// useEngineerRepairRequestList）与
// 工程师读写类型均为 feature 内部组成块，由编排 hook / UI 组件经相对路径消费，
// 不作为跨模块公开入口。
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
export { EngineerRepairRequestDetailPanel } from './ui/engineer-repair-request-detail-panel';
export { EngineerRepairRequestList } from './ui/engineer-repair-request-list';
export { ENGINEER_REPAIR_REQUEST_LIST_PATH } from './ui/engineer-repair-request-paths';
export { RepairRequestForm } from './ui/repair-request-form';

// ---- 维修申请公共读模型（PR #A 契约；客户切片与工程师切片共用） ----

export type {
  DeleteMyRepairRequestFailureReason,
  DeleteMyRepairRequestResult,
  EngineerResolutionStatus,
  EngineerResponse,
  MyRepairRequestDetailResult,
  RepairRequestDetail,
  RepairRequestEquipmentModel,
  RepairRequestListItem,
  RepairRequestListPage,
  RepairRequestListPagination,
} from './infrastructure/repair-request-read.types';
export { RESOLUTION_STATUS_LABELS } from './infrastructure/repair-request-read.types';

// 数据访问统一出口：T-02 已切换为真实 GraphQL adapter（与 Mock 同名同签名），
// 页面组件零改动。Mock 实现与隔离函数（resetMyRepairRequestMockState）均不进 barrel，
// 仅测试从 mock-adapter 文件直连导入，保持公开 API 面与真实 adapter 一致（review 裁定 C-1）。
