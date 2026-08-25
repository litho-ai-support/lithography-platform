// src/usecases/third-party-accounts/get-weapp-phone.usecase.ts

import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { GetWeappPhoneParams, GetWeappPhoneResult } from './get-weapp-phone.types';

/**
 * 获取微信小程序用户手机号 Usecase
 * 专门负责从微信 API 获取手机号，不处理数据库操作
 */
@Injectable()
export class GetWeappPhoneUsecase {
  constructor(
    private readonly thirdPartyAuthService: ThirdPartyAuthService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GetWeappPhoneUsecase.name);
  }

  /**
   * 执行获取微信小程序手机号
   * @param params 获取参数
   * @returns 手机号信息
   * @throws DomainError 当参数无效或 API 调用失败时抛出异常
   */
  async execute(params: GetWeappPhoneParams): Promise<GetWeappPhoneResult> {
    this.logger.info('开始从微信 API 获取手机号', {
      params: { ...params, phoneCode: '[REDACTED]' },
    });

    try {
      // 1. 验证参数
      this.validateParams(params);

      // 2. 通过模块服务获取手机号
      const phoneInfo = await this.thirdPartyAuthService.getWeappPhoneNumber({
        phoneCode: params.phoneCode,
        audience: params.audience,
      });

      this.logger.info('成功从微信 API 获取手机号', {
        phoneNumber: phoneInfo.phoneNumber,
      });

      return {
        phoneInfo,
      };
    } catch (error) {
      this.logger.error('从微信 API 获取手机号失败', {
        error,
        params: { ...params, phoneCode: '[REDACTED]' },
      });

      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(THIRDPARTY_ERROR.UNKNOWN_ERROR, '获取手机号时发生未知错误');
    }
  }

  /**
   * 验证输入参数
   * @param params 原始参数
   * @throws DomainError 当参数无效时抛出异常
   */
  private validateParams(params: GetWeappPhoneParams): void {
    if (!params.phoneCode || typeof params.phoneCode !== 'string') {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_CREDENTIAL, 'phoneCode 不能为空');
    }

    if (!params.audience) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_CREDENTIAL, 'audience 不能为空');
    }
  }
}
