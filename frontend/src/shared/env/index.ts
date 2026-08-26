// src/shared/env/index.ts

export type AppEnv = 'dev' | 'test' | 'prod';

export function getAppEnv(): AppEnv {
  const configuredAppEnv = import.meta.env.VITE_APP_ENV;

  if (configuredAppEnv === 'dev' || configuredAppEnv === 'test' || configuredAppEnv === 'prod') {
    return configuredAppEnv;
  }

  return import.meta.env.DEV ? 'dev' : 'prod';
}

// labs/sandbox 非生产暴露的统一环境边界，见 docs/environment-exposure.md；
// 模块自己的 access.ts 与导航目录都委托这里，避免重复实现环境判断。
export function isDevOrTestEnv(env: AppEnv): boolean {
  return env === 'dev' || env === 'test';
}

export function getGraphQLEndpoint() {
  const endpoint = import.meta.env.VITE_GRAPHQL_ENDPOINT;

  return typeof endpoint === 'string' && endpoint.trim() ? endpoint : '/graphql';
}

export function getHealthEndpoint() {
  const endpoint = import.meta.env.VITE_API_HEALTH_ENDPOINT;

  return typeof endpoint === 'string' && endpoint.trim() ? endpoint : null;
}
