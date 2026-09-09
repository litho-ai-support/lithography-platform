// src/features/reference-document/ui/reference-document-paths.ts

/** 参考资料库路由路径（路由真源在 app/router；此处仅供 feature 内导航与面包屑使用） */
export const REFERENCE_DOCUMENTS_LIST_PATH = '/reference-documents';
export const REFERENCE_DOCUMENT_NEW_PATH = '/reference-documents/new';

export function buildReferenceDocumentDetailPath(documentId: number): string {
  return `/reference-documents/${documentId}`;
}

/**
 * 详情路由参数解析：只接受安全正整数字面量，其余（abc/0/负数/小数/空）
 * 一律归为 null，由页面直接呈现统一 not-found，不发 GraphQL 请求——
 * 非法值若直接进 Int! 变量会成为输入/序列化错误被归入 failed，
 * 出现「重试仍失败」的死循环入口（负责人 0909 修复要求）。
 */
export function parseReferenceDocumentIdParam(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number(raw);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
