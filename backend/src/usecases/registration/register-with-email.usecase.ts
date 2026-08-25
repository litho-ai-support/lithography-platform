// src/usecases/registration/register-with-email.usecase.ts

import { AccountStatus, IdentityTypeEnum, UserAccountView } from '@app-types/models/account.types';
import { ACCOUNT_ERROR, AUTH_ERROR, DomainError } from '@core/common/errors';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';
import { Inject, Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@src/usecases/common/ports/transaction-runner.contract';
import {
  RegisterWithEmailParams,
  RegisterWithEmailResult,
} from '@app-types/models/registration.types';
import { RegisterTypeEnum } from '@app-types/services/register.types';
import { PinoLogger } from 'nestjs-pino';
import {
  normalizeRegisterWithEmailInput,
  normalizeRegistrationNicknameCandidatesInput,
} from './registration-input.normalize';

/**
 * 邮箱注册用例
 * 负责处理用户通过邮箱注册的完整业务流程
 */
@Injectable()
export class RegisterWithEmailUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly accountQueryService: AccountQueryService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly logger: PinoLogger,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {
    this.logger.setContext(RegisterWithEmailUsecase.name);
  }

  /**
   * 执行邮箱注册流程
   * @param params 注册参数
   * @returns 注册结果
   */
  async execute(params: RegisterWithEmailParams): Promise<RegisterWithEmailResult> {
    const {
      loginName,
      loginEmail,
      loginPassword,
      nickname,
      type = RegisterTypeEnum.REGISTRANT,
      inviteToken,
      clientIp,
    } = params;
    const normalizedInput = normalizeRegisterWithEmailInput({ loginEmail, nickname });
    const normalizedLoginEmail = normalizedInput.loginEmail;
    const normalizedNickname = normalizedInput.nickname;

    try {
      const finalClientIp = clientIp ?? '';

      // 检查账户是否已存在
      await this.checkAccountExists({ loginName, loginEmail: normalizedLoginEmail });

      // 准备注册数据
      const preparedData = await this.prepareRegisterData({
        loginName,
        loginEmail: normalizedLoginEmail,
        loginPassword,
        nickname: normalizedNickname,
        type,
      });

      // 创建账户
      const account = await this.createAccount(preparedData);

      if (inviteToken) {
        this.logger.warn(
          { accountId: account.id },
          '注册请求携带 inviteToken，但通用邀请流程尚未启用，已忽略',
        );
      }

      if (account.status !== AccountStatus.ACTIVE) {
        await this.accountService.updateAccount(account.id, { status: AccountStatus.ACTIVE });
      }

      this.logger.info(`用户注册成功: ${account.id}，注册时 IP 为：${finalClientIp}`);

      return {
        success: true,
        message: '注册成功',
        accountId: account.id,
      };
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      if (error instanceof Error) {
        this.logger.error(`用户注册失败: ${error.message}`);
      }

      throw new DomainError(ACCOUNT_ERROR.REGISTRATION_FAILED, '注册失败');
    }
  }

  /**
   * 检查账户是否已存在
   */
  private async checkAccountExists({
    loginName,
    loginEmail,
  }: {
    loginName?: string | null;
    loginEmail: string;
  }): Promise<void> {
    const exists = await this.accountQueryService.checkAccountExists({
      loginName,
      loginEmail,
    });

    if (exists) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_ALREADY_EXISTS, '该登录名或邮箱已被注册');
    }
  }

  /**
   * 准备注册数据
   */
  private async prepareRegisterData({
    loginName,
    loginEmail,
    loginPassword,
    nickname,
    type,
  }: {
    loginName?: string | null;
    loginEmail: string;
    loginPassword: string;
    nickname?: string;
    type: RegisterTypeEnum;
  }) {
    const role = this.mapRegisterTypeToRole(type);
    const nicknameCandidates = normalizeRegistrationNicknameCandidatesInput({
      providedNickname: nickname,
      fallbackOptions: [loginName ?? undefined, loginEmail.split('@')[0]],
    });

    const finalNickname = await this.accountQueryService.pickAvailableNickname({
      providedNickname: nicknameCandidates.providedNickname,
      fallbackOptions: nicknameCandidates.fallbackOptions,
    });

    if (!finalNickname) {
      throw new DomainError(
        ACCOUNT_ERROR.NICKNAME_ALREADY_EXISTS,
        '昵称已被使用或不合规，请选择其他昵称',
      );
    }

    return {
      loginName,
      loginEmail,
      loginPassword,
      status: AccountStatus.PENDING,
      nickname: finalNickname,
      email: loginEmail,
      accessGroup: [role],
      identityHint: role,
      metaDigest: [role],
    };
  }

  private mapRegisterTypeToRole(type: RegisterTypeEnum): IdentityTypeEnum {
    switch (type) {
      case RegisterTypeEnum.STAFF:
        return IdentityTypeEnum.STAFF;
      case RegisterTypeEnum.REGISTRANT:
        return IdentityTypeEnum.REGISTRANT;
    }
  }

  /**
   * 创建账户
   * @param preparedData 准备好的注册数据
   * @returns 创建的账户实体
   */
  private async createAccount(preparedData: {
    loginName?: string | null;
    loginEmail: string;
    loginPassword: string;
    status: AccountStatus;
    nickname: string;
    email: string;
    accessGroup: IdentityTypeEnum[];
    identityHint: IdentityTypeEnum;
    metaDigest: IdentityTypeEnum[];
  }): Promise<UserAccountView> {
    const {
      loginName,
      loginEmail,
      loginPassword,
      status,
      nickname,
      email,
      accessGroup,
      identityHint,
      metaDigest,
    } = preparedData;

    return await this.transactionRunner.run(async (transactionContext) => {
      const passwordValidation = this.passwordPolicyService.validatePassword(loginPassword);
      if (!passwordValidation.isValid) {
        throw new DomainError(
          AUTH_ERROR.INVALID_PASSWORD,
          `密码不符合安全要求: ${passwordValidation.errors.join(', ')}`,
        );
      }

      const account = this.accountService.createAccountEntity({
        transactionContext,
        accountData: {
          loginName,
          loginEmail,
          loginPassword: 'temp',
          status,
          identityHint,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const savedAccount = await this.accountService.saveAccount({ account, transactionContext });

      await this.accountService.updateAccountPasswordHash({
        accountId: savedAccount.id,
        passwordHash: AccountService.hashPasswordWithTimestamp(
          loginPassword,
          savedAccount.createdAt,
        ),
        transactionContext,
      });

      const userInfo = this.accountService.createUserInfoEntity({
        transactionContext,
        userInfoData: {
          accountId: savedAccount.id,
          nickname,
          email,
          accessGroup,
          metaDigest,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await this.accountService.saveUserInfo({ userInfo, transactionContext });

      return await this.accountQueryService.getUserAccountViewById({
        accountId: savedAccount.id,
        transactionContext,
      });
    });
  }
}
