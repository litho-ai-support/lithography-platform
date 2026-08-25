// src/core/common/logger/templates.ts

/**
 * 提供与日志相关的纯函数模板，避免依赖框架类型。
 * 这些函数仅进行数据整形，不产生副作用。
 */

/**
 * 构建包含请求主体的日志对象（泛型支持）。
 * @param input 包含 url / method / body 的输入对象
 * @returns 规范化的请求主体日志对象
 */
export function buildRequestBody<T = unknown>(input: {
  url: string;
  method: string;
  body: unknown;
}): { url: string; method: string; body: T } {
  return {
    url: input.url,
    method: input.method,
    body: input.body as T,
  };
}

/**
 * 构建精简的请求日志对象，仅包含基本字段。
 * @param input 包含 url / method 的输入对象
 * @returns 精简请求日志对象
 */
export function buildMinimalRequest(input: { url: string; method: string }): {
  url: string;
  method: string;
} {
  return {
    url: input.url,
    method: input.method,
  };
}

/**
 * 构建完整的请求日志对象（泛型支持）。
 * @param input 包含 url / method / query / params / body 的输入对象
 * @returns 完整请求日志对象
 */
export function buildFullRequest<T = unknown>(input: {
  url: string;
  method: string;
  query: unknown;
  params: unknown;
  body: unknown;
}): {
  url: string;
  method: string;
  query: unknown;
  params: unknown;
  body: T;
} {
  return {
    url: input.url,
    method: input.method,
    query: input.query,
    params: input.params,
    body: input.body as T,
  };
}
