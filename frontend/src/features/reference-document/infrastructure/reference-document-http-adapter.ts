// src/features/reference-document/infrastructure/reference-document-http-adapter.ts

import { getGraphQLRuntimeConfig } from '@/shared/graphql';

import type {
  CreateReferenceDocumentWithFileInput,
  CreateReferenceDocumentWithFileResult,
  ReferenceDocumentFileDownloadResult,
} from './reference-document.types';

/**
 * AI 参考资料库文件上传 / 下载 REST 数据访问层（0909 第二轮阻塞项 1）。
 *
 * 与 GraphQL adapter 的差异（有意为之，非违反「adapter 不读写 Session」约定）：
 * - Token 读取复用共享层既有桥接（configureGraphQLRuntime 注入的 getAccessToken），
 *   不直接依赖 auth-session——与 GraphQL authLink 的注入模式同源，项目使用
 *   Authorization 头鉴权，REST 下载无法用 window.open / <a href> 直链；
 * - 会话失效（401）与 GraphQL 链路同口径：先尝试 refreshSession 刷新后重试一次，
 *   无刷新能力、刷新失败或重试仍 401 时宣布会话失效（onAuthFailure），
 *   由 app 装配统一清理与跳转（见 docs/project-convention/graphql-ingress-auth-boundary.md）；
 * - REST 边界无 GraphQL extensions 错误契约，响应为统一信封
 *   { success, data: { statusCode, code, message } }，本层把所有失败
 *   （transport / auth / 业务拒绝）统一归并为显式失败结果，表单与详情层
 *   只消费 reason / message，不感知 HTTP 细节。
 *
 * 契约依据：backend/src/adapters/api/rest/reference-document/reference-document-rest.controller.ts
 * （错误码唯一真源 backend/src/core/common/errors/domain-error.ts）。
 */

const UPLOAD_ENDPOINT = '/api/reference-documents/upload';

function downloadEndpoint(id: number): string {
  return `/api/reference-documents/${id}/download`;
}

/** REST 统一错误信封（只取用到的字段，收窄 unknown） */
type RestErrorEnvelope = {
  data?: { statusCode?: unknown; code?: unknown; message?: unknown };
};

/** 上传失败原因映射（唯一真源：后端 REFERENCE_DOCUMENT_ERROR 码组） */
const UPLOAD_REASON_BY_CODE: Record<
  string,
  Exclude<
    Extract<CreateReferenceDocumentWithFileResult, { ok: false }>['reason'],
    'creation-failed'
  >
> = {
  REFERENCE_DOCUMENT_EQUIPMENT_MODEL_NOT_FOUND: 'model-not-found',
  REFERENCE_DOCUMENT_UPLOAD_FILE_TOO_LARGE: 'file-too-large',
  REFERENCE_DOCUMENT_UPLOAD_FILE_TYPE_NOT_ALLOWED: 'file-type-not-allowed',
  REFERENCE_DOCUMENT_INVALID_PARAMS: 'invalid-input',
  REFERENCE_DOCUMENT_CONTENT_SOURCE_EMPTY: 'invalid-input',
  REFERENCE_DOCUMENT_UPLOAD_FILE_MISSING: 'invalid-input',
};

const UPLOAD_FALLBACK_MESSAGE_BY_REASON: Record<
  Exclude<
    Extract<CreateReferenceDocumentWithFileResult, { ok: false }>['reason'],
    'creation-failed'
  >,
  string
> = {
  'model-not-found': '所选设备型号不存在，请重新选择。',
  'invalid-input': '输入不符合要求，请检查后重新提交。',
  'file-too-large': '上传文件超过大小限制。',
  'file-type-not-allowed': '不允许上传该类型的文件。',
};

/** 下载失败原因映射 */
const DOWNLOAD_REASON_BY_CODE: Record<
  string,
  Exclude<Extract<ReferenceDocumentFileDownloadResult, { ok: false }>['reason'], 'download-failed'>
> = {
  REFERENCE_DOCUMENT_NOT_FOUND: 'not-found',
  REFERENCE_DOCUMENT_FILE_NOT_AVAILABLE: 'file-not-available',
};

const DOWNLOAD_FALLBACK_MESSAGE_BY_REASON: Record<
  Exclude<Extract<ReferenceDocumentFileDownloadResult, { ok: false }>['reason'], 'download-failed'>,
  string
> = {
  'not-found': '参考资料不存在或不可查看。',
  'file-not-available': '该资料没有可下载的文件。',
};

function readAccessToken(): string | null {
  const token = getGraphQLRuntimeConfig().getAccessToken?.();

  return typeof token === 'string' && token.length > 0 ? token : null;
}

/** REST 请求初始化（Token 头由 fetchRestWithAuthRetry 统一注入） */
type RestRequestInit = { method?: string; body?: BodyInit };

/**
 * 带会话失效处理的 REST 请求：401 时与 GraphQL executeGraphQL 同口径
 * （refreshSession 刷新后重试一次；无刷新能力 / 刷新失败 / 重试仍 401 时
 * 调 onAuthFailure 宣布会话失效），避免 Token 过期后上传/下载只弹通用错误
 * 而不跳登录页的体验断链。FormData / URLSearchParams 可重复传入 fetch，重试无需重建。
 */
async function fetchRestWithAuthRetry(url: string, init: RestRequestInit): Promise<Response> {
  const send = (token: string | null) =>
    fetch(url, {
      ...init,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

  let response = await send(readAccessToken());

  if (response.status !== 401) {
    return response;
  }

  const { refreshSession, onAuthFailure } = getGraphQLRuntimeConfig();

  if (!refreshSession) {
    // 没有刷新能力时（如当前 P0 登录链路），仍要宣布一次会话失效，
    // 由 app 装配决定清理与跳转（与 GraphQL 链路同口径）
    onAuthFailure?.();

    return response;
  }

  try {
    await refreshSession();
  } catch {
    onAuthFailure?.();

    return response;
  }

  response = await send(readAccessToken());

  if (response.status === 401) {
    onAuthFailure?.();
  }

  return response;
}

function toRestErrorEnvelope(payload: unknown): RestErrorEnvelope {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  const data = (payload as { data?: unknown }).data;

  if (typeof data !== 'object' || data === null) {
    return {};
  }

  return { data: data as RestErrorEnvelope['data'] };
}

function readEnvelopeField(envelope: RestErrorEnvelope, field: 'code' | 'message'): string | null {
  const value = envelope.data?.[field];

  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 解析 RFC 5987 编码的附件文件名；无 Content-Disposition 时返回 null 由调用方兜底 */
export function parseAttachmentFilename(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);

  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }

  const plainMatch = /filename="?([^";]+)"?/i.exec(header);

  return plainMatch ? plainMatch[1] : null;
}

/**
 * REST multipart 上传创建（仅 SUPER_ADMIN；contentText 可空，仅文件创建合法）。
 * 所有失败（transport / auth / 业务拒绝）统一归并为显式失败结果（见文件头注释）。
 */
export async function createReferenceDocumentWithFile(
  input: CreateReferenceDocumentWithFileInput,
): Promise<CreateReferenceDocumentWithFileResult> {
  const formData = new FormData();
  formData.append('file', input.file, input.file.name);
  formData.append('title', input.title);
  formData.append('documentType', input.documentType);

  if (input.equipmentModelId !== null) {
    formData.append('equipmentModelId', String(input.equipmentModelId));
  }
  if (input.description !== null) {
    formData.append('description', input.description);
  }
  if (input.contentText !== null) {
    formData.append('contentText', input.contentText);
  }

  let response: Response;

  try {
    response = await fetchRestWithAuthRetry(UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData,
    });
  } catch {
    return {
      ok: false,
      reason: 'creation-failed',
      message: '文件上传失败，请检查网络后重试。',
    };
  }

  if (response.ok) {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      return { ok: false, reason: 'creation-failed', message: '文件上传失败，请稍后重试。' };
    }

    // 成功信封 { success: true, data: { id } }；错误信封 data 内无 id，自动落失败兜底
    const id = (payload as { data?: { id?: unknown } } | null)?.data?.id;

    if (typeof id === 'number') {
      return { ok: true, id };
    }

    return { ok: false, reason: 'creation-failed', message: '文件上传失败，请稍后重试。' };
  }

  // 错误响应：信封 { success, data: { statusCode, code, message } }；解析失败给通用兜底
  let envelope: RestErrorEnvelope = {};

  try {
    envelope = toRestErrorEnvelope(await response.json());
  } catch {
    // 非 JSON 错误体（网关/代理错误页），走下方兜底
  }

  const code = readEnvelopeField(envelope, 'code');
  const message = readEnvelopeField(envelope, 'message');

  if (code && UPLOAD_REASON_BY_CODE[code]) {
    const reason = UPLOAD_REASON_BY_CODE[code];

    return { ok: false, reason, message: message ?? UPLOAD_FALLBACK_MESSAGE_BY_REASON[reason] };
  }

  return {
    ok: false,
    reason: 'creation-failed',
    message: message ?? '文件上传失败，请稍后重试。',
  };
}

/**
 * REST 流式下载（所有已登录角色）：fetch blob 后交由调用方触发浏览器保存。
 * 资料不存在 / 已软删统一 not-found；纯文本资料与存储对象缺失统一 file-not-available。
 */
export async function downloadReferenceDocumentFile(
  id: number,
): Promise<ReferenceDocumentFileDownloadResult> {
  let response: Response;

  try {
    response = await fetchRestWithAuthRetry(downloadEndpoint(id), {});
  } catch {
    return {
      ok: false,
      reason: 'download-failed',
      message: '下载失败，请检查网络后重试。',
    };
  }

  if (response.ok) {
    let blob: Blob;

    try {
      blob = await response.blob();
    } catch {
      return { ok: false, reason: 'download-failed', message: '下载失败，请稍后重试。' };
    }

    const filename =
      parseAttachmentFilename(response.headers.get('Content-Disposition')) ??
      `reference-document-${id}`;

    return { ok: true, blob, filename };
  }

  let envelope: RestErrorEnvelope = {};

  try {
    envelope = toRestErrorEnvelope(await response.json());
  } catch {
    // 非 JSON 错误体，走下方兜底
  }

  const code = readEnvelopeField(envelope, 'code');
  const message = readEnvelopeField(envelope, 'message');

  if (code && DOWNLOAD_REASON_BY_CODE[code]) {
    const reason = DOWNLOAD_REASON_BY_CODE[code];

    return { ok: false, reason, message: message ?? DOWNLOAD_FALLBACK_MESSAGE_BY_REASON[reason] };
  }

  return {
    ok: false,
    reason: 'download-failed',
    message: message ?? '下载失败，请稍后重试。',
  };
}
