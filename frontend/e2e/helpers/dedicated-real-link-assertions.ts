// e2e/helpers/dedicated-real-link-assertions.ts
// 专用真实链路（R4 修正轮）的验收断言收口：
//
// 1. assertRealMyAccountSettingsSuccess：真实受保护 Query 的 GraphQL **数据级**验收。
//    GraphQL HTTP 200 不等于成功——必须断言 errors 为空、data.myAccountSettings 存在，
//    且 loginName 与专用账号一致；正向真实用例禁止 route.fulfill，本 helper 只用于
//    判定真实响应体。
// 2. assertBrowserRequestsBoundToDedicatedOrigins：浏览器流量绑定守卫。专用入口下
//    浏览器只允许访问专用前端 origin（同源 /graphql 经 vite 代理）或专用后端 origin；
//    出现任何 127.0.0.1:3000 或其他来源即视为「复用来源不明的开发后端」，直接失败。

export const DEDICATED_FRONTEND_ORIGIN = 'http://127.0.0.1:4174';
export const DEDICATED_BACKEND_ORIGIN = 'http://127.0.0.1:3100';
export const PROHIBITED_DEV_ORIGIN = 'http://127.0.0.1:3000';

export type RealMyAccountSettingsData = {
  companyName: string | null;
  contactEmail: string | null;
  loginEmail: string | null;
  loginName: string | null;
  nickname: string;
  phone: string | null;
  role: string;
  status: string;
  updatedAt: string;
};

export type RealGraphqlPayload = {
  data?: { myAccountSettings?: RealMyAccountSettingsData | null } | null;
  errors?: unknown;
};

function hasGraphQLerrors(errors: unknown): boolean {
  if (errors === null || errors === undefined) {
    return false;
  }

  return Array.isArray(errors) ? errors.length > 0 : true;
}

/**
 * 验收真实 MyAccountSettings 响应：errors 为空、data.myAccountSettings 存在、
 * loginName 与专用账号一致。任何一条不满足都抛错（验收不通过）。
 */
export function assertRealMyAccountSettingsSuccess(
  payload: unknown,
  expectedLoginName: string,
): RealMyAccountSettingsData {
  const { data, errors } = (payload ?? {}) as RealGraphqlPayload;

  if (hasGraphQLerrors(errors)) {
    throw new Error(
      `MyAccountSettings 返回了 GraphQL errors，验收不通过：${JSON.stringify(payload).slice(0, 500)}`,
    );
  }

  if (!data?.myAccountSettings) {
    throw new Error(
      `MyAccountSettings 未返回 data.myAccountSettings，验收不通过：${JSON.stringify(payload).slice(0, 500)}`,
    );
  }

  if (data.myAccountSettings.loginName !== expectedLoginName) {
    throw new Error(
      `MyAccountSettings 的 loginName 与专用账号不一致：期望 ${JSON.stringify(expectedLoginName)}，实际 ${JSON.stringify(data.myAccountSettings.loginName)}`,
    );
  }

  return data.myAccountSettings;
}

/** 判定一次浏览器请求是否落在专用前端 / 专用后端 origin 上（仅检查 http/https） */
export function isRequestBoundToDedicatedOrigins(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) {
    return true;
  }

  return (
    url.startsWith(`${DEDICATED_FRONTEND_ORIGIN}/`) ||
    url === DEDICATED_FRONTEND_ORIGIN ||
    url.startsWith(`${DEDICATED_BACKEND_ORIGIN}/`) ||
    url === DEDICATED_BACKEND_ORIGIN
  );
}

/**
 * 浏览器流量绑定守卫：本次用例收集到的全部请求 URL 必须都落在专用前端 / 专用后端
 * origin；出现 127.0.0.1:3000 或任何其他来源即抛错。
 */
export function assertBrowserRequestsBoundToDedicatedOrigins(urls: readonly string[]): void {
  const unbound = urls.filter((url) => !isRequestBoundToDedicatedOrigins(url));

  if (unbound.length > 0) {
    throw new Error(
      `检测到脱离专用环境的浏览器请求（复用来源不明的开发后端或其他来源），链路判失败：${JSON.stringify(unbound.slice(0, 10))}`,
    );
  }
}
