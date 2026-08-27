// src/features/auth-session/application/login-error.ts

import { isGraphQLIngressError } from '@/shared/graphql';

const DEFAULT_LOGIN_ERROR_MESSAGE = '登录失败，请稍后重试。';
const INVALID_CREDENTIALS_MESSAGE = '账号或密码错误，请检查后重试。';

export function resolveLoginErrorMessage(error: unknown): string {
  if (!isGraphQLIngressError(error)) {
    return DEFAULT_LOGIN_ERROR_MESSAGE;
  }

  if (error.type === 'auth') {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  if (error.type === 'network' || error.type === 'http' || error.type === 'malformed') {
    return error.userMessage;
  }

  return DEFAULT_LOGIN_ERROR_MESSAGE;
}
