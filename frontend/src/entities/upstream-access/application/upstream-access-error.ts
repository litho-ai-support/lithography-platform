// src/entities/upstream-access/application/upstream-access-error.ts

import { isGraphQLIngressError } from '@/shared/graphql';

type UpstreamAccessGraphQLErrorDetail = {
  code: string | null;
  errorCode: string | null;
  message: string | null;
};

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function includesAnyPattern(value: string | null | undefined, patterns: readonly string[]) {
  if (!value) {
    return false;
  }

  const normalizedValue = value.toLowerCase();

  return patterns.some((pattern) => normalizedValue.includes(pattern.toLowerCase()));
}

function getReadableGraphQLMessage(detail: UpstreamAccessGraphQLErrorDetail | null): string | null {
  if (!detail?.message) {
    return null;
  }

  if (detail.message === detail.code || detail.message === detail.errorCode) {
    return null;
  }

  return detail.message;
}

function hasErrorCode(
  detail: UpstreamAccessGraphQLErrorDetail | null,
  errorCodes: readonly string[],
): boolean {
  return Boolean(
    (detail?.code && errorCodes.includes(detail.code)) ||
    (detail?.errorCode && errorCodes.includes(detail.errorCode)),
  );
}

function matchesMessage(
  error: unknown,
  detail: UpstreamAccessGraphQLErrorDetail | null,
  patterns: readonly string[],
): boolean {
  if (includesAnyPattern(getReadableGraphQLMessage(detail), patterns)) {
    return true;
  }

  return includesAnyPattern(error instanceof Error ? error.message : null, patterns);
}

export function readUpstreamAccessGraphQLErrorDetail(
  error: unknown,
): UpstreamAccessGraphQLErrorDetail | null {
  if (!isGraphQLIngressError(error) || !error.graphqlErrors?.length) {
    return null;
  }

  const [firstError] = error.graphqlErrors;
  const extensions = (firstError.extensions as Record<string, unknown> | undefined) || {};

  return {
    code: normalizeOptionalString(extensions.code),
    errorCode: normalizeOptionalString(extensions.errorCode),
    message:
      normalizeOptionalString(extensions.errorMessage) ||
      normalizeOptionalString(firstError.message),
  };
}

export function isExpiredUpstreamAccessError(error: unknown): boolean {
  const detail = readUpstreamAccessGraphQLErrorDetail(error);

  if (isGraphQLIngressError(error) && (error.type === 'auth' || error.statusCode === 401)) {
    return true;
  }

  if (hasErrorCode(detail, ['UPSTREAM_ACCESS_AUTH_REQUIRED', 'UPSTREAM_ACCESS_SESSION_EXPIRED'])) {
    return true;
  }

  return matchesMessage(error, detail, [
    'upstream access expired',
    'upstream access is expired',
    'upstream session expired',
    'upstream token expired',
    '请重新授权 upstream',
    '请重新登录 upstream',
    'upstream 会话已失效',
  ]);
}

export function resolveUpstreamAccessErrorMessage(error: unknown, fallback: string): string {
  const detail = readUpstreamAccessGraphQLErrorDetail(error);
  const graphQLMessage = getReadableGraphQLMessage(detail);

  if (graphQLMessage) {
    return graphQLMessage;
  }

  if (isGraphQLIngressError(error)) {
    return error.userMessage;
  }

  return error instanceof Error ? error.message : fallback;
}
