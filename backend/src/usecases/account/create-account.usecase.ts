// src/usecases/account/create-account.usecase.ts
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { AccountStatus, UserAccountView } from '@app-types/models/account.types';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';
import { Inject, Injectable } from '@nestjs/common';
import {
  AccountService,
  type AccountCreateData,
  type UserInfoCreateData,
} from '@src/modules/account/base/services/account.service';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@src/usecases/common/ports/transaction-runner.contract';
import { AUTH_ERROR, DomainError } from '../../core/common/errors/domain-error';

/**
 * 创建账户用例
 * 负责编排账户创建的完整业务流程
 */
@Injectable()
export class CreateAccountUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly accountQueryService: AccountQueryService,
    private readonly passwordPolicyService: PasswordPolicyService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  /**
   * 创建新账户
   * @param params 创建参数
   * @returns 创建的账户信息
   */
  async execute({
    accountData,
    userInfoData,
    transactionContext,
  }: {
    accountData: AccountCreateData;
    userInfoData: UserInfoCreateData;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<UserAccountView> {
    const run = async (activeTransactionContext: PersistenceTransactionContext) =>
      this.doCreate(activeTransactionContext, accountData, userInfoData);

    // 有外部事务则复用；否则自己开
    return transactionContext
      ? await run(transactionContext)
      : await this.transactionRunner.run(run);
  }

  /**
   * 实际创建账户的方法
   * @param transactionContext 事务上下文
   * @param accountData 账户数据
   * @param userInfoData 用户信息数据
   * @returns 创建的账户信息
   */
  private async doCreate(
    transactionContext: PersistenceTransactionContext,
    accountData: AccountCreateData,
    userInfoData: UserInfoCreateData,
  ): Promise<UserAccountView> {
    // 验证密码是否符合安全策略
    if (accountData.loginPassword) {
      const passwordValidation = this.passwordPolicyService.validatePassword(
        String(accountData.loginPassword),
      );
      if (!passwordValidation.isValid) {
        throw new DomainError(
          AUTH_ERROR.INVALID_PASSWORD,
          `密码不符合安全要求: ${passwordValidation.errors.join(', ')}`,
        );
      }
    }

    // 1) 创建账户（先写临时密码拿到 createdAt）
    const account = this.accountService.createAccountEntity({
      transactionContext,
      accountData: {
        ...accountData,
        loginPassword: 'temp',
        status: accountData.status || AccountStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const savedAccount = await this.accountService.saveAccount({ account, transactionContext });

    // 2) 依据 createdAt 生成最终哈希密码并更新
    const hashedPassword = AccountService.hashPasswordWithTimestamp(
      String(accountData.loginPassword),
      savedAccount.createdAt,
    );
    await this.accountService.updateAccountPasswordHash({
      accountId: savedAccount.id,
      passwordHash: hashedPassword,
      transactionContext,
    });

    // 3) 写入 UserInfo
    const userInfo = this.accountService.createUserInfoEntity({
      transactionContext,
      userInfoData: {
        ...userInfoData,
        accountId: savedAccount.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await this.accountService.saveUserInfo({ userInfo, transactionContext });

    return await this.accountQueryService.getUserAccountViewById({
      accountId: savedAccount.id,
      transactionContext,
    });
  }
}
