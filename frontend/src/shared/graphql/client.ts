// src/shared/graphql/client.ts

import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

import { getGraphQLEndpoint } from '@/shared/env';

type GraphQLRuntimeConfig = {
  getAccessToken?: () => string | null | undefined;
  // 可选：未注入时受保护请求遇到 auth 错误会直接宣布失效（见 request.ts 与 ingress 契约）。
  refreshSession?: () => Promise<void>;
  onAuthFailure?: () => void;
};

let runtimeConfig: GraphQLRuntimeConfig = {};
let graphQLClient: ApolloClient | null = null;

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return { ...value };
}

function getContextAuthMode(context: unknown): 'required' | 'none' | null {
  const authMode = toRecord(context).authMode;

  return authMode === 'required' || authMode === 'none' ? authMode : null;
}

function getRequestAuthorizationHeader(headers: unknown): string | null {
  const headerRecord = toRecord(headers);

  if (typeof headerRecord.Authorization === 'string') {
    return headerRecord.Authorization;
  }

  if (typeof headerRecord.authorization === 'string') {
    return headerRecord.authorization;
  }

  return null;
}

// Bearer 头格式化的唯一实现；authLink 与 request.ts 的显式 token 注入都复用它。
export function getAuthorizationHeader(accessToken?: string | null) {
  return accessToken ? `Bearer ${accessToken}` : null;
}

function removeAuthorizationHeader(headers: unknown) {
  const nextHeaders = toRecord(headers);

  delete nextHeaders.Authorization;
  delete nextHeaders.authorization;

  return nextHeaders;
}

function createApolloClient() {
  const httpLink = new HttpLink({
    uri: getGraphQLEndpoint(),
  });
  const authLink = setContext((_, previousContext) => {
    if (getContextAuthMode(previousContext) === 'none') {
      return {
        headers: removeAuthorizationHeader(previousContext.headers),
      };
    }

    const requestAuthorizationHeader = getRequestAuthorizationHeader(previousContext.headers);
    const authorizationHeader =
      requestAuthorizationHeader ??
      getAuthorizationHeader(runtimeConfig.getAccessToken?.() ?? null);

    return {
      headers: {
        ...previousContext.headers,
        ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
      },
    };
  });

  return new ApolloClient({
    cache: new InMemoryCache(),
    link: authLink.concat(httpLink),
  });
}

export function configureGraphQLRuntime(config: GraphQLRuntimeConfig) {
  runtimeConfig = {
    ...runtimeConfig,
    ...config,
  };
}

export function getGraphQLRuntimeConfig(): Readonly<GraphQLRuntimeConfig> {
  return runtimeConfig;
}

export function getGraphQLClient() {
  if (!graphQLClient) {
    graphQLClient = createApolloClient();
  }

  return graphQLClient;
}

export async function clearGraphQLClientCache(): Promise<void> {
  if (!graphQLClient) {
    return;
  }

  await graphQLClient.clearStore();
}
