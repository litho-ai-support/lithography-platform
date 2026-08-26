// src/features/auth-session/infrastructure/auth-login-graphql.ts

import { executeGraphQL, GraphQLIngressError } from '@/shared/graphql';

import type { AuthSessionSnapshot } from '../application/auth-session.types';
import type { AuthLoginGateway, LoginWithPasswordInput } from '../application/login-with-password';

import { decodeAuthSessionPayload, isRecord } from './auth-session-mapper';

const LOGIN_WITH_PASSWORD_MUTATION = [
  'mutation LoginWithPassword($input: AuthLoginInput!) {',
  '  login(input: $input) {',
  '    accessToken',
  '    accountId',
  '    role',
  '    userInfo {',
  '      nickname',
  '      accessGroup',
  '    }',
  '  }',
  '}',
].join('\n');

type LoginGraphQLVariables = {
  input: {
    audience: 'SSTSWEB';
    loginName: string;
    loginPassword: string;
    type: 'PASSWORD';
  };
};

type LoginGraphQLExecutor = (
  query: string,
  variables: LoginGraphQLVariables,
  options: {
    allowAuthRetry: false;
    authMode: 'none';
  },
) => Promise<unknown>;

function decodeLoginResponse(value: unknown): AuthSessionSnapshot {
  const session = isRecord(value) ? decodeAuthSessionPayload(value.login) : null;

  if (!session) {
    throw new GraphQLIngressError({
      type: 'malformed',
      message: 'Login GraphQL response did not contain a valid session.',
      operationName: 'LoginWithPassword',
    });
  }

  return session;
}

export function createGraphQLAuthLoginGateway(
  execute: LoginGraphQLExecutor = executeGraphQL,
): AuthLoginGateway {
  return {
    async loginWithPassword(input: LoginWithPasswordInput) {
      const response = await execute(
        LOGIN_WITH_PASSWORD_MUTATION,
        {
          input: {
            audience: 'SSTSWEB',
            loginName: input.loginName,
            loginPassword: input.loginPassword,
            type: 'PASSWORD',
          },
        },
        {
          allowAuthRetry: false,
          authMode: 'none',
        },
      );

      return decodeLoginResponse(response);
    },
  };
}

export const graphQLAuthLoginGateway = createGraphQLAuthLoginGateway();
