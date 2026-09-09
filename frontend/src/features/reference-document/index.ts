// src/features/reference-document/index.ts

// barrel 只导出切片外实际消费的公开 API：页面装配所需的三个 UI 组件、
// 路径常量、类型展示口径与数据访问五方法。application 层 hooks 与 Mock 数据文件、
// reset 隔离函数均为 feature 内部组成块，不进公开出口。
// 数据访问统一出口：阶段三已切换为真实 GraphQL adapter（与 Mock 同名同签名），
// 页面组件零改动。Mock 实现与隔离函数（resetReferenceDocumentMockState）均不进 barrel，
// 仅测试从 mock-adapter 文件直连导入，保持公开 API 面与真实 adapter 一致。
export type {
  CreateReferenceDocumentInput,
  CreateReferenceDocumentResult,
  DeleteReferenceDocumentResult,
  ReferenceDocumentDetail,
  ReferenceDocumentDetailResult,
  ReferenceDocumentEquipmentModelOption,
  ReferenceDocumentListFilter,
  ReferenceDocumentListItem,
  ReferenceDocumentListPage,
  ReferenceDocumentListPagination,
  ReferenceDocumentTypeOption,
  UpdateReferenceDocumentPatch,
  UpdateReferenceDocumentResult,
} from './infrastructure/reference-document.types';
export {
  REFERENCE_DOCUMENT_TYPE_LABELS,
  REFERENCE_DOCUMENT_TYPE_OPTIONS,
} from './infrastructure/reference-document.types';
export {
  createReferenceDocument,
  deleteReferenceDocument,
  fetchReferenceDocument,
  fetchReferenceDocuments,
  fetchReferenceEquipmentModels,
  updateReferenceDocument,
} from './infrastructure/reference-document-adapter';
export { ReferenceDocumentDetailPanel } from './ui/reference-document-detail-panel';
export {
  ReferenceDocumentForm,
  type ReferenceDocumentFormOutput,
  type ReferenceDocumentFormSubmitResult,
} from './ui/reference-document-form';
export { ReferenceDocumentList } from './ui/reference-document-list';
export {
  buildReferenceDocumentDetailPath,
  parseReferenceDocumentIdParam,
  REFERENCE_DOCUMENT_NEW_PATH,
  REFERENCE_DOCUMENTS_LIST_PATH,
} from './ui/reference-document-paths';
