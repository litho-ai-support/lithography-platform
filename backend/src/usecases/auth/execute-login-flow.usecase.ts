// src/usecases/auth/execute-login-flow.usecase.ts

import { BasicLoginResult, LoginUserDataCollection } from '@modules/auth/auth.types';
import {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { ACCOUNT_ERROR, AUTH_ERROR, DomainError } from '@core/common/errors/domain-error';
import { AccountSecurityService } from '@modules/account/base/services/account-security.service';
import { AccountQueryService } from '@modules/account/queries/account.query.service';
import { AuthService } from '@modules/auth/auth.service';
import { LoginBootstrapQueryService } from '@modules/auth/queries/login-bootstrap.query.service';
import { LoginResultQueryService } from '@modules/auth/queries/login-result.query.service';
import { TokenHelper } from '@modules/auth/token.helper';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { PinoLogger } from 'nestjs-pino';

/**
 * 执行登录流程用例
 * 职责：认证、发券、记录登录历史，返回基础登录信息
 */
@Injectable()
export class ExecuteLoginFlowUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly accountQueryService: AccountQueryService,
    private readonly accountSecurityService: AccountSecurityService,
    private readonly authService: AuthService,
    private readonly tokenHelper: TokenHelper,
    private readonly loginBootstrapQueryService: LoginBootstrapQueryService,
    private readonly loginResultQueryService: LoginResultQueryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ExecuteLoginFlowUsecase.name);
  }

  /**
   * 执行登录流程
   * @param params 登录参数
   * @returns 基础登录结果
   */
  async execute({
    accountId,
    ip,
    audience,
    provider,
  }: {
    accountId: number;
    ip?: string;
    audience?: AudienceTypeEnum;
    provider?: ThirdPartyProviderEnum;
  }): Promise<BasicLoginResult> {
    // 验证 audience 类型安全性
    this.validateAudience(audience);

    // 获取用户相关数据
    const userData = await this.fetchUserData(accountId);

    // 安全校验通过后，在登录流程内读取完整用户资料（供适配器映射 DTO，不再由 Resolver 二次编排）
    const userInfoView = await this.accountQueryService.getUserInfoViewStrict({ accountId });

    // 生成 JWT tokens，传入 audience 参数
    const tokens = this.generateTokens(userData, audience);

    // 记录登录历史
    await this.handleLoginHistory({ accountId, ip, audience, provider });

    // 构建并返回基础登录结果
    return this.loginResultQueryService.toBasicLoginResult({
      userData,
      tokens,
      userInfoView,
    });
  }

  /**
   * 验证 audience 参数
   * @param audience 客户端类型枚举
   */
  private validateAudience(audience?: AudienceTypeEnum): void {
    if (audience) {
      const isValid = this.authService.validateAudience(audience);
      if (!isValid) {
        throw new DomainError(AUTH_ERROR.INVALID_AUDIENCE, `无效的客户端类型: ${audience}`);
      }
    }
  }

  /**
   * 获取用户相关数据
   * @param accountId 账户 ID
   * @returns 用户数据集合
   */
  private async fetchUserData(accountId: number): Promise<LoginUserDataCollection> {
    const loginSnapshot = await this.accountQueryService.getLoginBootstrapSnapshot({ accountId });

    // 安全校验（纯判断）：由本用例编排后续的暂停写入与阻断决策
    const validationResult = this.accountSecurityService.validateAccessGroupConsistency({
      id: loginSnapshot.account.id,
      userInfo: loginSnapshot.userInfo,
    });
    if (!validationResult.isValid && validationResult.shouldSuspend) {
      await this.handleSecurityBreach({
        accountId: loginSnapshot.account.id,
        realAccessGroup: validationResult.realAccessGroup,
      });
    }

    // 检查账户状态
    if (loginSnapshot.account.status !== AccountStatus.ACTIVE) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_INACTIVE, '账户未激活');
    }

    return this.loginBootstrapQueryService.toLoginUserDataCollection(loginSnapshot);
  }

  /**
   * 处理安全违规：记录安全事件、等待暂停写入完成并阻断本次登录
   * 暂停持久化失败不阻断拒绝决策（访问仍被拒绝），失败详情记录到日志
   */
  private async handleSecurityBreach(params: {
    accountId: number;
    realAccessGroup?: IdentityTypeEnum[];
  }): Promise<never> {
    const reason = '检测到访问组不一致 - 潜在安全威胁';
    const { accountId, realAccessGroup } = params;

    this.accountSecurityService.logSecurityEvent({
      accountId,
      eventType: 'SECURITY_BREACH_DETECTED',
      details: {
        reason,
        realAccessGroup,
        detectedAt: new Date().toISOString(),
        immediateBlock: true,
      },
    });

    try {
      await this.accountSecurityService.suspendAccount(accountId);
      this.accountSecurityService.logSecurityEvent({
        accountId,
        eventType: 'ACCOUNT_SUSPENDED',
        details: {
          reason,
          suspendedAt: new Date().toISOString(),
        },
      });
      this.logger.warn({ accountId, reason }, `账号 ${accountId} 已被暂停`);
    } catch (error) {
      this.logger.error(
        { err: error, accountId },
        `在数据库中暂停账号 ${accountId} 失败，但访问仍被阻止`,
      );
    }

    throw new DomainError(ACCOUNT_ERROR.ACCOUNT_SUSPENDED, '账户因安全问题已被暂停');
  }

  /**
   * 生成 JWT tokens
   * @param userData 用户数据集合
   * @param audience 客户端类型（用于 JWT audience 声明）
   * @returns JWT tokens 对象
   */
  private generateTokens(
    userData: LoginUserDataCollection,
    audience?: AudienceTypeEnum,
  ): {
    accessToken: string;
    refreshToken: string;
  } {
    const { userWithAccessGroup, userInfo } = userData;

    // 创建 JWT payload
    const jwtPayload = this.tokenHelper.createPayloadFromUser({
      id: userWithAccessGroup.id,
      nickname: userInfo.nickname,
      loginEmail: userWithAccessGroup.loginEmail,
      accessGroup: userWithAccessGroup.accessGroup,
    });

    // 生成 tokens，传入 audience 参数
    const accessToken = this.tokenHelper.generateAccessToken({
      payload: jwtPayload,
      audience: audience, // 传递 audience 参数
    });

    const refreshToken = this.tokenHelper.generateRefreshToken({
      payload: { sub: jwtPayload.sub },
      audience: audience, // 传递 audience 参数
    });

    return { accessToken, refreshToken };
  }

  /**
   * 处理登录历史记录
   * @param params 登录历史参数
   */
  private async handleLoginHistory({
    accountId,
    ip,
    audience,
    provider,
  }: {
    accountId: number;
    ip?: string;
    audience?: AudienceTypeEnum;
    provider?: ThirdPartyProviderEnum;
  }): Promise<void> {
    try {
      if (provider) {
        this.logger.info(`第三方登录: 账户 ID=${accountId}, 提供商=${provider}, IP=${ip}`);
      }
      await this.accountService.recordLoginHistory(
        accountId,
        new Date().toISOString(),
        ip,
        audience,
      );
    } catch (error) {
      this.logger.error(
        {
          accountId,
          ip,
          audience,
          provider,
          error: error instanceof Error ? error.message : String(error),
        },
        '记录登录历史失败',
      );
    }
  }
}
