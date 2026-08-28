// src/shared/graphql/request.spec.ts

import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureGraphQLRuntime, getGraphQLClient } from './client';
import { GraphQLIngressError } from './errors';
import { executeGraphQL } from './request';

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();

  return {
    ...actual,
    getGraphQLClient: vi.fn(),
  };
});

const mockedGetGraphQLClient = vi.mocked(getGraphQLClient);

function useFakeClient(queryError: unknown) {
  mockedGetGraphQLClient.mockReturnValue({
    query: vi.fn().mockRejectedValue(queryError),
  } as never);
}

function createUnauthenticatedError() {
  return new CombinedGraphQLErrors({
    errors: [{ extensions: { code: 'UNAUTHENTICATED' }, message: 'Unauthorized' }],
  });
}

describe('executeGraphQL auth failure signaling', () => {
  afterEach(() => {
    configureGraphQLRuntime({
      getAccessToken: () => null,
      onAuthFailure: undefined,
      refreshSession: undefined,
    });
    vi.clearAllMocks();
  });

  it('announces auth failure once when no refreshSession is configured', async () => {
    const onAuthFailure = vi.fn();
    configureGraphQLRuntime({ getAccessToken: () => 'token', onAuthFailure });
    useFakeClient(createUnauthenticatedError());

    await expect(executeGraphQL('query Probe { viewer { id } }', {})).rejects.toMatchObject({
      type: 'auth',
    });

    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('announces auth failure when the injected refreshSession rejects', async () => {
    const onAuthFailure = vi.fn();
    const refreshSession = vi.fn().mockRejectedValue(new Error('refresh failed'));
    configureGraphQLRuntime({ getAccessToken: () => 'token', onAuthFailure, refreshSession });
    useFakeClient(createUnauthenticatedError());

    await expect(executeGraphQL('query Probe { viewer { id } }', {})).rejects.toMatchObject({
      type: 'auth',
    });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('does not announce auth failure for public requests or non-auth errors', async () => {
    const onAuthFailure = vi.fn();
    configureGraphQLRuntime({ getAccessToken: () => 'token', onAuthFailure });

    useFakeClient(createUnauthenticatedError());
    await expect(
      executeGraphQL('query Login { login { accessToken } }', {}, { authMode: 'none' }),
    ).rejects.toMatchObject({ type: 'auth' });

    useFakeClient(
      new ServerError('Server error', {
        bodyText: 'boom',
        response: new Response('boom', { status: 500, statusText: 'Internal Server Error' }),
      }),
    );
    await expect(executeGraphQL('query Probe { viewer { id } }', {})).rejects.toBeInstanceOf(
      GraphQLIngressError,
    );

    expect(onAuthFailure).not.toHaveBeenCalled();
  });
});
