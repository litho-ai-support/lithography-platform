// src/features/reference-document/infrastructure/reference-document-mock-adapter.ts

import type {
  CreateReferenceDocumentInput,
  CreateReferenceDocumentResult,
  DeleteReferenceDocumentResult,
  ReferenceDocumentDetailResult,
  ReferenceDocumentEquipmentModelOption,
  ReferenceDocumentListFilter,
  ReferenceDocumentListPage,
  ReferenceDocumentListPagination,
  UpdateReferenceDocumentPatch,
  UpdateReferenceDocumentResult,
} from './reference-document.types';
import type { MockReferenceDocumentRecord } from './reference-document-mock-data';
import {
  buildMockReferenceDocumentRecords,
  MOCK_REFERENCE_EQUIPMENT_MODELS,
} from './reference-document-mock-data';

/**
 * 阶段二 Mock 数据访问层：签名与阶段三的真实 adapter 完全一致，
 * 页面经 barrel（@/features/reference-document）消费统一导出名，替换真实实现时页面零改动。
 *
 * 行为对齐后端契约（B-01~B-06 定案；错误大类映射见各函数注释）：
 * - 列表：仅未软删、createdAt DESC + id DESC、OFFSET 分页、标题模糊/类型等值/型号等值筛选；
 * - 详情：不存在 / 已软删统一 not-found（防探测，不区分原因）；
 * - 创建：必填空白 / 超长 → invalid-input；型号不存在 → model-not-found；成功返回新 ID；
 * - 编辑：PATCH 语义（undefined 保持原值）；必填字段显式 null 直接拒绝；
 *   contentText 不允许清空；已软删 / 不存在统一 not-found；
 * - 软删：不存在 / 已软删统一 not-found（注意：本模块不幂等，区别于维修申请）。
 */

/** 字段长度上限与后端契约对齐（backend dto/reference-document-write.dto.ts），修改需同步 */
const TITLE_MAX_LENGTH = 255;
const DOCUMENT_TYPE_MAX_LENGTH = 100;

/** Mock 创建人昵称：阶段三由后端按 Session 实时富集，Mock 固定为管理员语义 */
const MOCK_CREATOR_NICKNAME = '系统管理员';

let repository: MockReferenceDocumentRecord[] = buildMockReferenceDocumentRecords();
let nextId = 970007 + 1000;

/** 测试隔离：重建数据源（种子 + 批量数据），并重置自增主键 */
export function resetReferenceDocumentMockState(): void {
  repository = buildMockReferenceDocumentRecords();
  nextId = 970007 + 1000;
}

function isNormalizedBlank(value: string): boolean {
  return value.trim().length === 0;
}

function requireNormalizedText(value: string, maxLength: number): string | null {
  if (isNormalizedBlank(value)) {
    return null;
  }

  return value.trim().length > maxLength ? null : value.trim();
}

function findVisibleById(id: number): MockReferenceDocumentRecord | undefined {
  const record = repository.find((item) => item.id === id);

  return record && !record.deprecated ? record : undefined;
}

/** 列表项视图：剔除文本内容与数据源内部标志，保持与后端 ListItem DTO 同形 */
function toListItem(record: MockReferenceDocumentRecord) {
  return {
    id: record.id,
    title: record.title,
    documentType: record.documentType,
    equipmentModelId: record.equipmentModelId,
    equipmentModelName: record.equipmentModelName,
    description: record.description,
    originalFilename: record.originalFilename,
    creatorNickname: record.creatorNickname,
    createdAt: record.createdAt,
  };
}

/** 详情视图：显式映射剔除数据源内部标志，保持与后端 Detail DTO 同形 */
function toDetail(record: MockReferenceDocumentRecord) {
  return {
    id: record.id,
    title: record.title,
    documentType: record.documentType,
    equipmentModelId: record.equipmentModelId,
    equipmentModelName: record.equipmentModelName,
    description: record.description,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    contentText: record.contentText,
    creatorNickname: record.creatorNickname,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function fetchReferenceEquipmentModels(): Promise<
  ReferenceDocumentEquipmentModelOption[]
> {
  return [...MOCK_REFERENCE_EQUIPMENT_MODELS];
}

export async function fetchReferenceDocuments(
  pagination: ReferenceDocumentListPagination,
  filter?: ReferenceDocumentListFilter,
): Promise<ReferenceDocumentListPage> {
  const titleKeyword = filter?.titleKeyword?.trim();
  const documentType = filter?.documentType?.trim();
  const equipmentModelId = filter?.equipmentModelId;

  const visible = repository
    .filter((record) => !record.deprecated)
    .filter((record) => (titleKeyword ? record.title.includes(titleKeyword) : true))
    .filter((record) => (documentType ? record.documentType === documentType : true))
    .filter((record) =>
      equipmentModelId !== undefined ? record.equipmentModelId === equipmentModelId : true,
    )
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1;
      }

      return b.id - a.id;
    });

  const page = Math.max(1, pagination.page);
  const pageSize = Math.max(1, pagination.pageSize);
  const start = (page - 1) * pageSize;

  return {
    items: visible.slice(start, start + pageSize).map(toListItem),
    total: visible.length,
    page,
    pageSize,
  };
}

export async function fetchReferenceDocument(id: number): Promise<ReferenceDocumentDetailResult> {
  const record = findVisibleById(id);

  if (!record) {
    // 后端统一 NOT_FOUND（防探测）：不存在与已软删同文案，不区分原因
    return {
      ok: false,
      reason: 'not-found',
      message: '参考资料不存在或不可查看。',
    };
  }

  return { ok: true, detail: toDetail(record) };
}

export async function createReferenceDocument(
  input: CreateReferenceDocumentInput,
): Promise<CreateReferenceDocumentResult> {
  const title = requireNormalizedText(input.title, TITLE_MAX_LENGTH);
  const documentType = requireNormalizedText(input.documentType, DOCUMENT_TYPE_MAX_LENGTH);

  if (title === null || documentType === null) {
    return {
      ok: false,
      reason: 'invalid-input',
      message:
        title === null
          ? '标题为必填项，且不能超过 255 个字符。'
          : '文档类型为必填项，且不能超过 100 个字符。',
    };
  }

  if (isNormalizedBlank(input.contentText)) {
    return {
      ok: false,
      reason: 'invalid-input',
      message: '文本内容为必填项（本周仅支持文本来源）。',
    };
  }

  if (input.equipmentModelId !== null) {
    const modelExists = MOCK_REFERENCE_EQUIPMENT_MODELS.some(
      (model) => model.id === input.equipmentModelId,
    );

    if (!modelExists) {
      return {
        ok: false,
        reason: 'model-not-found',
        message: '所选设备型号不存在，请重新选择。',
      };
    }
  }

  const model = MOCK_REFERENCE_EQUIPMENT_MODELS.find(
    (option) => option.id === input.equipmentModelId,
  );
  const now = new Date().toISOString();

  const record: MockReferenceDocumentRecord = {
    id: nextId,
    title,
    documentType,
    equipmentModelId: model?.id ?? null,
    equipmentModelName: model?.modelName ?? null,
    description: input.description?.trim() ? input.description.trim() : null,
    originalFilename: null,
    mimeType: null,
    contentText: input.contentText.trim(),
    creatorNickname: MOCK_CREATOR_NICKNAME,
    createdAt: now,
    updatedAt: now,
    deprecated: false,
  };

  repository = [record, ...repository];
  nextId += 1;

  return { ok: true, id: record.id };
}

export async function updateReferenceDocument(
  id: number,
  patch: UpdateReferenceDocumentPatch,
): Promise<UpdateReferenceDocumentResult> {
  const record = findVisibleById(id);

  if (!record) {
    return {
      ok: false,
      reason: 'not-found',
      message: '参考资料不存在或不可编辑。',
    };
  }

  // PATCH 语义：undefined 保持原值；必填字段显式 null 后端直接拒绝（INVALID_PARAMS），
  // 前端在 adapter 层同口径归并 invalid-input，表单不产生 null，仅测试钉住契约。
  if (patch.title === null || patch.documentType === null) {
    return {
      ok: false,
      reason: 'invalid-input',
      message: '标题与文档类型为必填字段，不允许置空。',
    };
  }

  if (patch.contentText !== undefined && isNormalizedBlank(patch.contentText)) {
    return {
      ok: false,
      reason: 'invalid-input',
      message: '文本内容不允许清空（无文件来源兜底）。',
    };
  }

  if (patch.title !== undefined) {
    const title = requireNormalizedText(patch.title, TITLE_MAX_LENGTH);

    if (title === null) {
      return {
        ok: false,
        reason: 'invalid-input',
        message: '标题为必填项，且不能超过 255 个字符。',
      };
    }

    record.title = title;
  }

  if (patch.documentType !== undefined) {
    const documentType = requireNormalizedText(patch.documentType, DOCUMENT_TYPE_MAX_LENGTH);

    if (documentType === null) {
      return {
        ok: false,
        reason: 'invalid-input',
        message: '文档类型为必填项，且不能超过 100 个字符。',
      };
    }

    record.documentType = documentType;
  }

  if (patch.equipmentModelId !== undefined && patch.equipmentModelId !== null) {
    const model = MOCK_REFERENCE_EQUIPMENT_MODELS.find(
      (option) => option.id === patch.equipmentModelId,
    );

    if (!model) {
      return {
        ok: false,
        reason: 'model-not-found',
        message: '所选设备型号不存在，请重新选择。',
      };
    }

    record.equipmentModelId = model.id;
    record.equipmentModelName = model.modelName;
  } else if (patch.equipmentModelId === null) {
    record.equipmentModelId = null;
    record.equipmentModelName = null;
  }

  if (patch.description !== undefined) {
    record.description = patch.description?.trim() ? patch.description.trim() : null;
  }

  if (patch.contentText !== undefined) {
    record.contentText = patch.contentText.trim();
  }

  record.updatedAt = new Date().toISOString();

  return { ok: true, id: record.id };
}

export async function deleteReferenceDocument(id: number): Promise<DeleteReferenceDocumentResult> {
  const record = repository.find((item) => item.id === id);

  // 后端口径：不存在与已软删统一 NOT_FOUND（重复软删不幂等，backend e2e 已钉住）
  if (!record || record.deprecated) {
    return {
      ok: false,
      reason: 'not-found',
      message: '参考资料不存在或不可删除。',
    };
  }

  record.deprecated = true;
  record.updatedAt = new Date().toISOString();

  return { ok: true };
}
