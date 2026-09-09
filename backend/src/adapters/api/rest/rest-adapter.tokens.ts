// src/adapters/api/rest/rest-adapter.tokens.ts

/**
 * REST 边界 DI 装配 token（独立文件避免 controller ↔ module 循环引用）。
 * 运行时配置只允许在 rest-adapter.module.ts wiring 中读取后注入。
 */

/** 上传业务大小上限 */
export const REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES = Symbol('REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES');

/** 上传 MIME 白名单 */
export const REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES = Symbol(
  'REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES',
);
