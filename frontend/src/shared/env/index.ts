// src/shared/env/index.ts

export type AppEnv = 'dev' | 'test' | 'prod';

export function getAppEnv(): AppEnv {
  const configuredAppEnv = import.meta.env.VITE_APP_ENV;

  if (configuredAppEnv === 'dev' || configuredAppEnv === 'test' || configuredAppEnv === 'prod') {
    return configuredAppEnv;
  }

  return import.meta.env.DEV ? 'dev' : 'prod';
}

export function getGraphQLEndpoint() {
  const endpoint = import.meta.env.VITE_GRAPHQL_ENDPOINT;

  return typeof endpoint === 'string' && endpoint.trim() ? endpoint : '/graphql';
}

export function getHealthEndpoint() {
  const endpoint = import.meta.env.VITE_API_HEALTH_ENDPOINT;

  return typeof endpoint === 'string' && endpoint.trim() ? endpoint : null;
}
