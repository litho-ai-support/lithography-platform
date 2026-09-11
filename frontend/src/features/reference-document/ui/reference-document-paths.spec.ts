// src/features/reference-document/ui/reference-document-paths.spec.ts

/**
 * 详情路由参数解析单测（负责人 0909 必须修复 4）：
 * 只有安全正整数字面量才允许进入详情加载；非法参数一律 null，
 * 由页面直接呈现统一 not-found，不发 GraphQL 请求、无重试死循环入口。
 */

import { describe, expect, it } from 'vitest';

import { parseReferenceDocumentIdParam } from './reference-document-paths';

describe('parseReferenceDocumentIdParam', () => {
  it.each([
    ['abc', null],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['', null],
    [undefined, null],
    ['1e3', null],
    [' 971 ', null],
    ['970001x', null],
  ])('非法参数 %p 归为 null', (raw, expected) => {
    expect(parseReferenceDocumentIdParam(raw)).toBe(expected);
  });

  it.each([
    ['970001', 970001],
    ['1', 1],
    ['007', 7],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('合法正整数字面量 %p 解析为 %p', (raw, expected) => {
    expect(parseReferenceDocumentIdParam(raw)).toBe(expected);
  });
});
