// src/usecases/third-party-accounts/resolve-third-party-identity.usecase.ts

import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { ThirdPartySession } from '@app-types/models/third-party-auth.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { normalizeRequiredText } from '@core/common/input-normalize/input-normalize.policy';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { Injectable } from '@nestjs/common';

/** 解析第三方身份输入参数（协议无关） */
export interface ResolveThirdPartyIdentityParams {
  provider: ThirdPartyProviderEnum;
  authCredential: string;
  audience: AudienceTypeEnum;
}

@Injectable()
export class ResolveThirdPartyIdentityUsecase {
  constructor(private readonly tpa: ThirdPartyAuthService) {}

  async execute(params: ResolveThirdPartyIdentityParams): Promise<ThirdPartySession> {
    const credential = normalizeThirdPartyAuthCredential(params.authCredential);

    try {
      return await this.tpa.resolveIdentity({
        provider: params.provider,
        authCredential: credential,
        audience: params.audience,
      });
    } catch (e) {
      if (e instanceof DomainError) {
        throw e;
      }
      throw new DomainError(THIRDPARTY_ERROR.UNKNOWN_ERROR, '解析第三方身份失败', {
        cause: (e as Error)?.message,
      });
    }
  }
}

function normalizeThirdPartyAuthCredential(input: string): string {
  try {
    return normalizeRequiredText(input, { fieldName: '第三方凭证' });
  } catch (error) {
    if (error instanceof DomainError) {
      throw new DomainError(THIRDPARTY_ERROR.CREDENTIAL_INVALID, '第三方凭证无效');
    }
    throw error;
  }
}
