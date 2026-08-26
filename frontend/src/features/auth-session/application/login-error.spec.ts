// src/features/auth-session/application/login-error.spec.ts

import { describe, expect, it } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import { resolveLoginErrorMessage } from './login-error';

describe('login error message', () => {
  it('uses a non-enumerating credential message for login auth failures', () => {
    const error = new GraphQLIngressError({
      type: 'auth',
      message: 'internal credential detail',
    });

    expect(resolveLoginErrorMessage(error)).toBe('账号或密码错误，请检查后重试。');
    expect(resolveLoginErrorMessage(error)).not.toContain(error.message);
  });

  it('reuses safe ingress messages for transport and malformed failures', () => {
    const networkError = new GraphQLIngressError({
      type: 'network',
      message: 'socket detail',
    });
    const malformedError = new GraphQLIngressError({
      type: 'malformed',
      message: 'payload detail',
    });

    expect(resolveLoginErrorMessage(networkError)).toBe(networkError.userMessage);
    expect(resolveLoginErrorMessage(malformedError)).toBe(malformedError.userMessage);
  });

  it('does not expose unknown or GraphQL internal errors', () => {
    const graphQLError = new GraphQLIngressError({
      type: 'graphql',
      message: 'database internal detail',
    });

    expect(resolveLoginErrorMessage(graphQLError)).toBe('登录失败，请稍后重试。');
    expect(resolveLoginErrorMessage(new Error('unknown internal detail'))).toBe(
      '登录失败，请稍后重试。',
    );
  });
});
