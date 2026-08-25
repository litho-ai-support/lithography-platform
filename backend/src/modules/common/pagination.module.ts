// src/modules/common/pagination.module.ts
// 绑定分页器与游标签名器实现，并导出 PaginationService

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaginationService } from './pagination.service';
import { PAGINATION_TOKENS } from './tokens/pagination.tokens';

import { HmacCursorSigner } from '@src/infrastructure/security/hmac-signer';
import { TypeOrmPaginator } from '@src/infrastructure/typeorm/pagination/typeorm-paginator';
import { TypeOrmSort } from '@src/infrastructure/typeorm/sort/typeorm-sort';

@Module({
  providers: [
    {
      provide: PAGINATION_TOKENS.CURSOR_SIGNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('pagination.hmacSecret');
        if (!secret) {
          throw new Error('pagination.hmacSecret is required');
        }
        return new HmacCursorSigner(secret);
      },
    },
    {
      provide: PAGINATION_TOKENS.PAGINATOR,
      inject: [PAGINATION_TOKENS.CURSOR_SIGNER],
      useFactory: (signer: HmacCursorSigner) => new TypeOrmPaginator(signer),
    },
    // ★ 示例：集中注册一个可复用的排序解析器（可按域拆分注入）
    {
      provide: 'DEFAULT_SORT_RESOLVER',
      useFactory: () => new TypeOrmSort([], {}),
    },
    PaginationService,
  ],
  exports: [PAGINATION_TOKENS.PAGINATOR, PAGINATION_TOKENS.CURSOR_SIGNER, PaginationService],
})
export class PaginationModule {}
