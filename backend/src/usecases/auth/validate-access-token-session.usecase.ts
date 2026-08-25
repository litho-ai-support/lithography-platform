// src/usecases/auth/validate-access-token-session.usecase.ts
import type { JwtPayload } from '@app-types/jwt.types';
import { DomainError, JWT_ERROR } from '@core/common/errors/domain-error';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ValidateAccessTokenSessionUsecase {
  constructor(private readonly accountQueryService: AccountQueryService) {}

  async execute(input: { readonly payload: JwtPayload }): Promise<JwtPayload> {
    const { payload } = input;

    if (payload.type !== 'access') {
      throw new DomainError(JWT_ERROR.AUTHENTICATION_FAILED, 'JWT 认证失败');
    }

    const account = await this.accountQueryService.findAccountSnapshotById({
      accountId: payload.sub,
    });
    if (!account) {
      throw new DomainError(JWT_ERROR.AUTHENTICATION_FAILED, 'JWT 认证失败');
    }

    return payload;
  }
}
