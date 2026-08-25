// src/shared/graphql/request.ts

import { type FetchPolicy, gql, type OperationVariables } from '@apollo/client';
import { type DocumentNode, getOperationAST, type OperationDefinitionNode } from 'graphql';

import { getGraphQLClient, getGraphQLRuntimeConfig } from './client';
import { GraphQLIngressError, toGraphQLIngressError } from './errors';

export type GraphQLAuthMode = 'required' | 'none';

type ExecuteGraphQLOptions = {
  accessToken?: string;
  allowAuthRetry?: boolean;
  authMode?: GraphQLAuthMode;
  fetchPolicy?: FetchPolicy;
};

type ParsedGraphQLDocument = {
  document: DocumentNode;
  operation: OperationDefinitionNode | null;
  operationName: string | undefined;
};

const parsedDocumentCache = new Map<string, ParsedGraphQLDocument>();

function parseGraphQLDocument(query: string): ParsedGraphQLDocument {
  const cachedDocument = parsedDocumentCache.get(query);

  if (cachedDocument) {
    return cachedDocument;
  }

  const document = gql(query);
  const operation = getOperationAST(document, undefined) ?? null;
  const parsedDocument = {
    document,
    operation,
    operationName: operation?.name?.value,
  };

  parsedDocumentCache.set(query, parsedDocument);

  return parsedDocument;
}

function buildOperationContext(options: ExecuteGraphQLOptions) {
  if (options.authMode === 'none') {
    return {
      authMode: 'none' as const,
    };
  }

  return {
    authMode: 'required' as const,
    ...(options.accessToken
      ? {
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
          },
        }
      : {}),
  };
}

async function dispatchGraphQLRequest<TData, TVariables extends OperationVariables>(
  query: string,
  variables: TVariables,
  options: ExecuteGraphQLOptions,
): Promise<TData> {
  const { document, operation, operationName } = parseGraphQLDocument(query);
  const client = getGraphQLClient();
  const context = buildOperationContext(options);

  if (operation?.operation === 'mutation') {
    const result = await client.mutate<TData, TVariables>({
      context,
      fetchPolicy: 'no-cache',
      mutation: document,
      variables,
    });

    if (!result.data) {
      throw new GraphQLIngressError({
        type: 'malformed',
        message: 'GraphQL 未返回 data。',
        operationName,
      });
    }

    return result.data;
  }

  const result = await client.query<TData, TVariables>({
    context,
    fetchPolicy: options.fetchPolicy || 'no-cache',
    query: document,
    variables,
  });

  if (!result.data) {
    throw new GraphQLIngressError({
      type: 'malformed',
      message: 'GraphQL 未返回 data。',
      operationName,
    });
  }

  return result.data;
}

function tryExtractOperationName(query: string): string | undefined {
  try {
    return parseGraphQLDocument(query).operationName;
  } catch {
    return undefined;
  }
}

export async function executeGraphQL<TData, TVariables extends OperationVariables>(
  query: string,
  variables: TVariables,
  options: ExecuteGraphQLOptions = {},
): Promise<TData> {
  try {
    return await dispatchGraphQLRequest<TData, TVariables>(query, variables, options);
  } catch (error) {
    const ingressError = toGraphQLIngressError(error, {
      operationName: tryExtractOperationName(query),
    });

    if (
      ingressError.type !== 'auth' ||
      options.authMode === 'none' ||
      options.allowAuthRetry === false
    ) {
      throw ingressError;
    }

    const { refreshSession, onAuthFailure } = getGraphQLRuntimeConfig();

    if (!refreshSession) {
      throw ingressError;
    }

    try {
      await refreshSession();
    } catch {
      onAuthFailure?.();
      throw ingressError;
    }

    const retryOptions = { ...options, accessToken: undefined };

    try {
      return await dispatchGraphQLRequest<TData, TVariables>(query, variables, retryOptions);
    } catch (retryError) {
      const retryIngressError = toGraphQLIngressError(retryError, {
        operationName: ingressError.operationName,
      });

      if (retryIngressError.type === 'auth') {
        onAuthFailure?.();
      }

      throw retryIngressError;
    }
  }
}
