// src/usecases/auth/login-with-third-party.usecase.ts

import { Injectable } from '@nestjs/common';

import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { LoginResultModel } from '@app-types/models/auth.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors';
import { normalizeRequiredText } from '@core/common/input-normalize/input-normalize.policy';

import { ThirdPartyAuthQueryService } from '@modules/third-party-auth/queries/third-party-auth.query.service';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { LoginByAccountIdUsecase } from './login-by-account-id.usecase';
import type { ThirdPartyLoginParams } from './login-with-third-party.types';

/**
 * 第三方登录用例
 * 流程：
 *  1) 解析第三方凭证 → 标准会话
 *  2) 用 provider + providerUserId 查绑定
 *  3) 已绑定 → 按 accountId 发放令牌
 *  4) 未绑定 → 抛领域错误（统一错误码）
 *
 * 只抛 DomainError；不抛 HttpException
 */
@Injectable()
export class LoginWithThirdPartyUsecase {
  constructor(
    private readonly tpa: ThirdPartyAuthService,
    private readonly thirdPartyAuthQueryService: ThirdPartyAuthQueryService,
    private readonly loginByAccountId: LoginByAccountIdUsecase,
  ) {}

  async execute(params: ThirdPartyLoginParams): Promise<LoginResultModel> {
    const provider = params.provider;
    const audience = params.audience ?? AudienceTypeEnum.DESKTOP; // 修复：直接使用枚举值
    const ip = params.ip;
    const authCredential = normalizeThirdPartyAuthCredential(params.authCredential);

    // 1) 解析第三方凭证
    const session = await this.resolveIdentitySafe({
      provider,
      authCredential,
      audience, // 修复：现在是 AudienceTypeEnum 类型
    });

    // 2) 查找绑定关系
    const bound = await this.thirdPartyAuthQueryService.findAccountByThirdParty({
      provider,
      providerUserId: session.providerUserId,
    });

    if (!bound?.accountId) {
      // 平台无关、可前端稳定识别的错误码
      throw new DomainError(THIRDPARTY_ERROR.ACCOUNT_NOT_BOUND, '该第三方账户未绑定', {
        provider,
        providerUserId: session.providerUserId,
      });
    }

    // 3) 已绑定 → 按 accountId 发放令牌（复用既有用例）
    const result = await this.loginByAccountId.execute({
      accountId: bound.accountId,
      ip,
      audience, // 修复：现在是 AudienceTypeEnum 类型
      provider,
    });

    return result; // { accessToken, refreshToken, accountId, role, identity? }
  }

  /**
   * 将 ThirdPartyAuthService 抛出的 HttpException 折叠为 DomainError
   * 这样上层（GraphQL 适配器）只需要处理一种错误形态
   */
  private async resolveIdentitySafe(args: {
    provider: ThirdPartyProviderEnum;
    authCredential: string;
    audience: AudienceTypeEnum;
  }) {
    try {
      return await this.tpa.resolveIdentity(args);
    } catch (e) {
      if (e instanceof DomainError) {
        throw e;
      }
      // 其它未知错误统一收敛
      throw new DomainError(THIRDPARTY_ERROR.LOGIN_FAILED, '第三方登录失败', {
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
