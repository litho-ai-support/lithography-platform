// src/features/reference-document/infrastructure/reference-document.types.ts

/**
 * AI 参考资料库的前端契约类型（与后端 B-05 读/写 DTO 逐字段对齐）。
 *
 * 契约依据：0907.docx 任务二 + backend/src/adapters/api/graphql/reference-document/dto/。
 * 日期字段后端为 Date 标量，GraphQL JSON 序列化后是 ISO 字符串；
 * 不出现任何账号 ID 与存储引用路径字段（后端 DTO 已在边界剥离）。
 */

/** 列表项（列表查询输出；无文本内容，无账号 ID / 存储引用） */
export type ReferenceDocumentListItem = {
  id: number;
  title: string;
  documentType: string;
  /** 为空表示通用资料 */
  equipmentModelId: number | null;
  /** 通用资料为空 */
  equipmentModelName: string | null;
  description: string | null;
  /** 有存储引用的资料返回；纯文本资料为空 */
  originalFilename: string | null;
  /** 创建人当前昵称（缺失时后端回落「未知用户」） */
  creatorNickname: string;
  createdAt: string;
};

/** 详情（完整元数据 + 文本内容；编辑与软删仅 SUPER_ADMIN 可见，由页面层按角色控制） */
export type ReferenceDocumentDetail = Omit<ReferenceDocumentListItem, never> & {
  mimeType: string | null;
  contentText: string | null;
  updatedAt: string;
};

/** OFFSET 分页请求参数（真实 adapter 内部补齐 mode/withTotal，调用方不感知） */
export type ReferenceDocumentListPagination = {
  page: number;
  pageSize: number;
};

/** 列表筛选（标题模糊搜索 / 类型等值 / 型号等值；均可选） */
export type ReferenceDocumentListFilter = {
  titleKeyword?: string;
  documentType?: string;
  equipmentModelId?: number;
};

/** OFFSET 分页结果（列表统一 createdAt DESC + id DESC） */
export type ReferenceDocumentListPage = {
  items: ReferenceDocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** 设备型号下拉选项（复用后端 equipmentModels 查询的形状） */
export type ReferenceDocumentEquipmentModelOption = {
  id: number;
  modelCode: string;
  modelName: string;
};

/**
 * 文档类型下拉选项（documentType 为后端自由字符串等值筛选，前端提供固定候选集）。
 * 候选值与 backend/scripts/seed-mock.ts 的种子语义对齐；新增候选需同步种子。
 */
export const REFERENCE_DOCUMENT_TYPE_OPTIONS = [
  'ERROR_CODE_MANUAL',
  'MAINTENANCE_GUIDE',
  'SAFETY_STANDARD',
  'CHECKLIST',
] as const;

export type ReferenceDocumentTypeOption = (typeof REFERENCE_DOCUMENT_TYPE_OPTIONS)[number];

/** 文档类型显示映射（未知类型原样展示，不强行归类） */
export const REFERENCE_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CHECKLIST: '检查表',
  ERROR_CODE_MANUAL: '错误代码手册',
  MAINTENANCE_GUIDE: '维护指南',
  SAFETY_STANDARD: '安全规范',
};

/** 创建输入（contentText 本周必填：仅文本来源；双来源约束由后端兜底） */
export type CreateReferenceDocumentInput = {
  title: string;
  documentType: string;
  equipmentModelId: number | null;
  description: string | null;
  contentText: string;
};

/**
 * 编辑补丁（PATCH 语义）：undefined 保持原值。
 * 形状与后端 UpdateReferenceDocumentInput 对齐：title/documentType 在 GraphQL 层可传
 * null，但语义上属必填字段，显式 null 会被后端直接拒绝（前端 adapter 同口径）。
 * - equipmentModelId / description 允许显式 null 清空；
 * - contentText 空白视为清空：后端编辑防御已放宽，仅当资料已有文件时放行
 *   （双空拦截由表单预检承担，adapter 不做二次判定）。
 */
export type UpdateReferenceDocumentPatch = {
  title?: string | null;
  documentType?: string | null;
  equipmentModelId?: number | null;
  description?: string | null;
  contentText?: string;
};

/**
 * 详情读取结果（domain failure 显式结果）：
 * 不存在 / 已软删由后端统一 NOT_FOUND（防探测，不区分原因），前端归并为 not-found；
 * transport / auth / network 失败不上抛为该结果，仍抛 GraphQLIngressError。
 */
export type ReferenceDocumentDetailResult =
  | { ok: true; detail: ReferenceDocumentDetail }
  | { ok: false; reason: 'not-found'; message: string };

/**
 * 创建结果（domain failure 显式结果）：
 * - model-not-found：所选设备型号不存在
 * - invalid-input：字段非法（必填空白 / 超长 / 型号 ID 非法）
 * - creation-failed：其余业务失败
 */
export type CreateReferenceDocumentResult =
  | { ok: true; id: number }
  | {
      ok: false;
      reason: 'model-not-found' | 'invalid-input' | 'creation-failed';
      message: string;
    };

/**
 * REST multipart 创建输入（文件来源路径；0909 第二轮阻塞项 1）。
 * contentText 可空（仅文件创建），但与文件双空时后端拒绝（CONTENT_SOURCE_EMPTY）。
 */
export type CreateReferenceDocumentWithFileInput = {
  title: string;
  documentType: string;
  equipmentModelId: number | null;
  description: string | null;
  contentText: string | null;
  file: File;
};

/**
 * REST multipart 创建结果（domain failure 显式结果）。
 * 文件边界专属失败：file-too-large（超大小上限）、file-type-not-allowed（白名单外类型）。
 */
export type CreateReferenceDocumentWithFileResult =
  | { ok: true; id: number }
  | {
      ok: false;
      reason:
        | 'model-not-found'
        | 'invalid-input'
        | 'file-too-large'
        | 'file-type-not-allowed'
        | 'creation-failed';
      message: string;
    };

/**
 * REST 下载结果（domain failure 显式结果）。
 * - not-found：资料不存在 / 已软删（统一防探测口径）
 * - file-not-available：纯文本资料无文件，或存储对象缺失（受控错误）
 * - download-failed：其余失败（transport / auth / 服务器错误）
 */
export type ReferenceDocumentFileDownloadResult =
  | { ok: true; blob: Blob; filename: string }
  | {
      ok: false;
      reason: 'not-found' | 'file-not-available' | 'download-failed';
      message: string;
    };

/** 编辑结果（domain failure 显式结果；已软删 / 不存在统一 not-found） */
export type UpdateReferenceDocumentResult =
  | { ok: true; id: number }
  | {
      ok: false;
      reason: 'not-found' | 'model-not-found' | 'invalid-input' | 'update-failed';
      message: string;
    };

/**
 * 软删除结果（domain failure 显式结果）。
 * 注意与维修申请的差异：本模块重复软删不幂等——已软删 / 不存在统一 NOT_FOUND
 * （backend e2e 已钉住该口径），前端归并 not-found。
 */
export type DeleteReferenceDocumentResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'delete-failed'; message: string };
