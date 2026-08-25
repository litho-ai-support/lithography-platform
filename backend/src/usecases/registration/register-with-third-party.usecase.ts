// src/usecases/registration/register-with-third-party.usecase.ts
import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { normalizeRegisterWithThirdPartyInput } from './registration-input.normalize';
import { WeappRegisterUsecase } from './weapp-register.usecase';

export interface ThirdPartyRegisterParams {
  provider: ThirdPartyProviderEnum;
  authCredential: string;
  audience?: string;
  // nickname?: string; // 移除此字段 - 昵称应通过第三方平台获取，而非前端传递
  email?: string | null;
  weAppData?: {
    phoneCode?: string;
  };
}

export interface ThirdPartyRegisterResult {
  success: boolean;
  message: string;
  accountId: number;
}

/**
 * 第三方注册分发器
 * 根据不同的第三方平台分发到对应的注册逻辑
 */
@Injectable()
export class RegisterWithThirdPartyUsecase {
  constructor(
    private readonly weappRegisterUsecase: WeappRegisterUsecase,
    // 未来可以注入其他平台的注册 usecase
  ) {}

  /**
   * 执行第三方注册
   * 根据 provider 分发到对应的注册逻辑
   */
  async execute(params: ThirdPartyRegisterParams): Promise<ThirdPartyRegisterResult> {
    const normalizedInput = normalizeRegisterWithThirdPartyInput({ email: params.email });
    const normalizedParams: ThirdPartyRegisterParams = {
      ...params,
      email: normalizedInput.email,
    };
    const { provider } = normalizedParams;

    switch (provider) {
      case ThirdPartyProviderEnum.WEAPP:
        // 验证 audience 参数
        if (!normalizedParams.audience) {
          throw new DomainError(
            THIRDPARTY_ERROR.INVALID_PARAMS,
            '微信小程序注册需要提供 audience 参数',
          );
        }

        // 验证 audience 是否为有效的枚举值
        if (
          !Object.values(AudienceTypeEnum).includes(normalizedParams.audience as AudienceTypeEnum)
        ) {
          throw new DomainError(
            THIRDPARTY_ERROR.INVALID_PARAMS,
            `无效的 audience 值: ${normalizedParams.audience}`,
          );
        }

        // 类型转换并调用
        return this.weappRegisterUsecase.execute({
          ...normalizedParams,
          audience: normalizedParams.audience as AudienceTypeEnum,
        });

      // 未来扩展其他平台
      // case ThirdPartyProviderEnum.WECHAT:
      //   return this.wechatRegisterUsecase.execute(params);

      default:
        throw new DomainError(
          THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
          `不支持的第三方平台: ${provider}`,
          { provider },
        );
    }
  }
}
