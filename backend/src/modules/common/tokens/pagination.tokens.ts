// src/modules/common/tokens/pagination.tokens.ts
// 分页相关的 DI token 定义

export const PAGINATION_TOKENS = {
  PAGINATOR: Symbol('PAGINATOR'),
  CURSOR_SIGNER: Symbol('CURSOR_SIGNER'),
} as const;

export type PaginatorToken = typeof PAGINATION_TOKENS.PAGINATOR;
export type CursorSignerToken = typeof PAGINATION_TOKENS.CURSOR_SIGNER;
