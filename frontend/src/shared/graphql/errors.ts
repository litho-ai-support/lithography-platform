// src/shared/graphql/errors.ts

import { CombinedGraphQLErrors, ServerError, ServerParseError } from '@apollo/client/errors';
import type { GraphQLFormattedError } from 'graphql';

export type GraphQLIngressErrorType = 'network' | 'http' | 'graphql' | 'auth' | 'malformed';

type GraphQLIngressErrorContext = {
  operationName?: string;
};

const defaultUserMessages: Record<GraphQLIngressErrorType, string> = {
  network: '网络连接异常，请稍后重试。',
  http: '服务暂时不可用，请稍后重试。',
  graphql: '请求处理失败，请稍后重试。',
  auth: '登录状态已失效，请重新登录后再试。',
  malformed: '返回结果异常，请稍后重试。',
};

export class GraphQLIngressError extends Error {
  readonly type: GraphQLIngressErrorType;
  readonly statusCode?: number;
  readonly operationName?: string;
  readonly graphqlErrors?: readonly GraphQLFormattedError[];
  readonly isRetryable: boolean;
  override readonly cause?: unknown;

  constructor(options: {
    type: GraphQLIngressErrorType;
    message: string;
    statusCode?: number;
    operationName?: string;
    graphqlErrors?: readonly GraphQLFormattedError[];
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'GraphQLIngressError';
    this.type = options.type;
    this.statusCode = options.statusCode;
    this.operationName = options.operationName;
    this.graphqlErrors = options.graphqlErrors;
    this.cause = options.cause;
    this.isRetryable = resolveIsRetryable(options.type, options.statusCode);
  }

  get userMessage(): string {
    return defaultUserMessages[this.type];
  }
}

export function isGraphQLIngressError(error: unknown): error is GraphQLIngressError {
  return error instanceof GraphQLIngressError;
}

function resolveIsRetryable(type: GraphQLIngressErrorType, statusCode?: number): boolean {
  if (type === 'network') {
    return true;
  }

  if (type === 'http') {
    return typeof statusCode === 'number' && statusCode >= 500;
  }

  return false;
}

function hasUnauthenticatedCode(errors: readonly GraphQLFormattedError[]): boolean {
  return errors.some((error) => {
    const extensions = error.extensions as Record<string, unknown> | undefined;

    return (
      extensions?.code === 'UNAUTHENTICATED' ||
      error.message === 'TOKEN_INVALID' ||
      error.message === 'TOKEN_INVALID_AFTER_REFRESH'
    );
  });
}

function isNetworkLikeError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();

    return (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    );
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return false;
}

export function toGraphQLIngressError(
  error: unknown,
  context?: GraphQLIngressErrorContext,
): GraphQLIngressError {
  if (isGraphQLIngressError(error)) {
    return error;
  }

  const operationName = context?.operationName;

  if (CombinedGraphQLErrors.is(error)) {
    const graphqlErrors = error.errors;

    if (hasUnauthenticatedCode(graphqlErrors)) {
      return new GraphQLIngressError({
        type: 'auth',
        message: error.message,
        operationName,
        graphqlErrors,
        cause: error,
      });
    }

    return new GraphQLIngressError({
      type: 'graphql',
      message: error.message,
      operationName,
      graphqlErrors,
      cause: error,
    });
  }

  if (ServerError.is(error)) {
    const type: GraphQLIngressErrorType = error.statusCode === 401 ? 'auth' : 'http';

    return new GraphQLIngressError({
      type,
      message: error.message,
      statusCode: error.statusCode,
      operationName,
      cause: error,
    });
  }

  if (ServerParseError.is(error)) {
    const isHTTPError = error.statusCode < 200 || error.statusCode >= 300;

    return new GraphQLIngressError({
      type: isHTTPError ? 'http' : 'malformed',
      message: error.message,
      statusCode: error.statusCode,
      operationName,
      cause: error,
    });
  }

  if (isNetworkLikeError(error)) {
    return new GraphQLIngressError({
      type: 'network',
      message: error instanceof Error ? error.message : 'Network error',
      operationName,
      cause: error,
    });
  }

  return new GraphQLIngressError({
    type: 'graphql',
    message: error instanceof Error ? error.message : 'Unknown GraphQL execution error',
    operationName,
    cause: error,
  });
}
