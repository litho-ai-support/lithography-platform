// src/features/reference-document/ui/reference-document-paths.ts

/** 参考资料库路由路径（路由真源在 app/router；此处仅供 feature 内导航与面包屑使用） */
export const REFERENCE_DOCUMENTS_LIST_PATH = '/reference-documents';
export const REFERENCE_DOCUMENT_NEW_PATH = '/reference-documents/new';

export function buildReferenceDocumentDetailPath(documentId: number): string {
  return `/reference-documents/${documentId}`;
}
