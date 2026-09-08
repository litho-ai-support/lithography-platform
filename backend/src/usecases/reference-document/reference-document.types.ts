// src/usecases/reference-document/reference-document.types.ts

import type { UsecaseSession } from '@app-types/auth/session.types';
import type { PaginationParams } from '@core/pagination/pagination.types';
import type {
  ReferenceDocumentDetailView,
  ReferenceDocumentListPage,
} from '@src/modules/lithography/lithography.types';

/**
 * 资料可编辑字段补丁（编辑用例的部分提交语义）：
 * - undefined：保持原值
 * - null：清空（仅 equipmentModelId / description 允许；contentText 无文件来源兜底，不允许清空）
 * - 字符串/数字：新值（经 usecase 规范化与校验）
 */
export type ReferenceDocumentEditablePatch = {
  title?: string | null;
  documentType?: string | null;
  equipmentModelId?: number | null;
  description?: string | null;
  contentText?: string | null;
};

export type ListReferenceDocumentsCommand = {
  session: UsecaseSession;
  pagination: PaginationParams;
  filter: {
    title?: string;
    documentType?: string;
    equipmentModelId?: number;
  };
};

export type GetReferenceDocumentDetailCommand = {
  session: UsecaseSession;
  documentId: number;
};

export type CreateReferenceDocumentCommand = {
  session: UsecaseSession;
  title: string;
  documentType: string;
  /** 为空表示通用资料 */
  equipmentModelId?: number | null;
  description?: string | null;
  /** 本周仅文本内容来源（无文件上传），必填 */
  contentText: string;
};

export type UpdateReferenceDocumentCommand = {
  session: UsecaseSession;
  documentId: number;
  patch: ReferenceDocumentEditablePatch;
};

export type SoftDeleteReferenceDocumentCommand = {
  session: UsecaseSession;
  documentId: number;
};

export type ReferenceDocumentMutationResult = {
  id: number;
};

export type GetReferenceDocumentDetailResult = ReferenceDocumentDetailView;
export type ListReferenceDocumentsResult = ReferenceDocumentListPage;
