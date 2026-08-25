// src/usecases/third-party-accounts/bind-third-party-account.usecase.ts

import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import {
  BindThirdPartyInputModel,
  ThirdPartyAuthView,
} from '@app-types/models/third-party-auth.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { HttpException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

/** 绑定第三方账户输入参数（协议无关） */
export interface BindThirdPartyAccountParams {
  accountId: number;
  provider: ThirdPartyProviderEnum;
  providerUserId: string;
  unionId?: string;
  accessToken?: string;
}

@Injectable()
export class BindThirdPartyAccountUsecase {
  private static readonly ALLOWED_ERROR_CODES = new Set<string>(Object.values(THIRDPARTY_ERROR));

  constructor(
    private readonly tpa: ThirdPartyAuthService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BindThirdPartyAccountUsecase.name);
  }

  /**
   * 执行绑定第三方账户
   * 将账户与第三方平台的 `providerUserId` 建立绑定关系
   * @param params 绑定参数
   * @returns 绑定后的第三方认证实体
   * @throws DomainError 当参数无效或服务层返回错误时抛出领域错误
   */
  async execute(params: BindThirdPartyAccountParams): Promise<ThirdPartyAuthView> {
    this.validateParams(params);

    try {
      const result = await this.tpa.bindThirdParty({
        accountId: params.accountId,
        input: this.buildInput(params),
      });
      this.logger.info(
        { accountId: params.accountId, provider: params.provider },
        '第三方账户绑定成功',
      );
      return result;
    } catch (e) {
      throw this.normalizeError(e, THIRDPARTY_ERROR.BIND_FAILED, '绑定第三方账户失败');
    }
  }

  /**
   * 参数校验
   * 检查 `accountId`、`provider`、`providerUserId` 是否有效
   * @param params 绑定参数
   */
  private validateParams(params: BindThirdPartyAccountParams): void {
    const { accountId, provider, providerUserId } = params;
    if (!accountId || !provider || !providerUserId) {
      this.logger.warn({ accountId, provider, providerUserId }, '绑定参数不完整');
      throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, '绑定参数不完整');
    }
  }

  /**
   * 构建服务层输入参数
   * 将可选字段标准化为 `null`
   * @param params 绑定参数
   */
  private buildInput(params: BindThirdPartyAccountParams): BindThirdPartyInputModel {
    return {
      provider: params.provider,
      providerUserId: params.providerUserId,
      unionId: params.unionId ?? null,
      accessToken: params.accessToken ?? null,
    };
  }

  /**
   * 标准化错误为 DomainError
   * 将 HTTP 风格异常转译为领域错误，其它错误使用兜底错误码
   * @param error 捕获的错误
   * @param fallbackCode 兜底错误码
   * @param fallbackMessage 兜底错误信息
   */
  private normalizeError(
    error: unknown,
    fallbackCode: string,
    fallbackMessage: string,
  ): DomainError {
    if (error instanceof DomainError) {
      return error;
    }

    if (error instanceof HttpException) {
      const resp = error.getResponse() as
        string | { errorCode?: string; errorMessage?: string; message?: string };
      const responseErrorCode =
        typeof resp === 'object' && resp?.errorCode ? String(resp.errorCode) : undefined;
      const code =
        responseErrorCode && BindThirdPartyAccountUsecase.ALLOWED_ERROR_CODES.has(responseErrorCode)
          ? responseErrorCode
          : fallbackCode;
      const message =
        typeof resp === 'object' && (resp.errorMessage || resp.message)
          ? String(resp.errorMessage || resp.message)
          : undefined;
      const finalMessage = message || fallbackMessage;
      this.logger.error({ code, message }, '绑定第三方账户失败');
      return new DomainError(code, finalMessage);
    }

    const cause = (error as Error)?.message;
    this.logger.error({ cause }, '绑定第三方账户失败');
    return new DomainError(fallbackCode, fallbackMessage, { cause });
  }
}
