// src/app/providers/graphql-provider.tsx

import { ApolloProvider } from '@apollo/client/react';
import type { ReactNode } from 'react';

import { getGraphQLClient } from '@/shared/graphql';

type GraphQLProviderProps = {
  children: ReactNode;
};

export function GraphQLProvider({ children }: GraphQLProviderProps) {
  const client = getGraphQLClient();

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
