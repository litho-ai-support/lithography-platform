// src/features/repair-request/index.ts

// barrel 只导出切片外实际消费的公开 API：
// 工程师列表/详情面板、路径常量与客户创建表单。
// application 层 hooks（useAcceptRepairRequest / useEngineerRepairRequestDetail /
// useEngineerRepairRequestDetailFlow / useEngineerRepairRequestList）与
// 工程师读写类型均为 feature 内部组成块，由编排 hook / UI 组件经相对路径消费，
// 不作为跨模块公开入口。
export type {
  CreateRepairRequestFailureReason,
  CreateRepairRequestInput,
  CreateRepairRequestResult,
  EquipmentModelOption,
  RepairRequestRecord,
} from './infrastructure/repair-request.types';
export { createRepairRequest, fetchEquipmentModels } from './infrastructure/repair-request-adapter';
export { EngineerRepairRequestDetailPanel } from './ui/engineer-repair-request-detail-panel';
export { EngineerRepairRequestList } from './ui/engineer-repair-request-list';
export { ENGINEER_REPAIR_REQUEST_LIST_PATH } from './ui/engineer-repair-request-paths';
export { RepairRequestForm } from './ui/repair-request-form';
