// src/infrastructure/security/hmac-signer.ts
// ICursorSigner 的 HMAC 实现，secret 由上层 DI wiring 注入

import { DomainError, PAGINATION_ERROR } from '@core/common/errors/domain-error';
import type { ICursorSigner } from '@core/pagination/pagination.contract';
import type { CursorToken } from '@core/pagination/pagination.types';
import { createHmac } from 'crypto';

export class HmacCursorSigner implements ICursorSigner {
  constructor(private readonly secret: string) {}

  sign(token: CursorToken): string {
    const payload = JSON.stringify(token);
    const mac = createHmac('sha256', this.secret).update(payload).digest('base64');
    const combined = Buffer.from(JSON.stringify({ p: payload, m: mac }), 'utf8').toString('base64');
    return combined;
  }

  verify(cursor: string): CursorToken {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const obj = JSON.parse(decoded) as { p: string; m: string };
      const expectedMac = createHmac('sha256', this.secret).update(obj.p).digest('base64');
      if (expectedMac !== obj.m) {
        throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标签名不匹配');
      }
      const token = JSON.parse(obj.p) as CursorToken;
      // 轻量结构校验
      if (!token || typeof token.key !== 'string') {
        throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标结构无效');
      }
      return token;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        PAGINATION_ERROR.INVALID_CURSOR,
        '游标解析失败',
        { error: error instanceof Error ? error.message : '未知错误' },
        error,
      );
    }
  }
}
