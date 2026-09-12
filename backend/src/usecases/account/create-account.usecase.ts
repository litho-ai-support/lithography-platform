// src/usecases/account/create-account.usecase.ts
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { AccountStatus, UserAccountView } from '@app-types/models/account.types';
import { UserState } from '@app-types/models/user-info.types';
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
import { ACCOUNT_ERROR, AUTH_ERROR, DomainError } from '../../core/common/errors/domain-error';

/**
 * `AccountStatus` → `UserState` 的显式映射。
 *
 * 两个枚举是不同类型（成员字符串当前逐字相同），映射刻意逐成员书写而非断言复用
 * （与 `AdminSetUserStatusUsecase` 的双字段同步同口径）：`BANNED` / `DELETED` 在
 * `UserState` 中没有对应成员，映射为 `null`——创建入口遇到它们一律失败关闭，
 * 绝不选任一字段为真源或静默降级。将来任一枚举扩容导致成员不再逐字相同时，
 * 新成员同样会落在「无映射」分支保持失败关闭。
 */
const ACCOUNT_STATUS_TO_USER_STATE: Readonly<Record<AccountStatus, UserState | null>> = {
  [AccountStatus.ACTIVE]: UserState.ACTIVE,
  [AccountStatus.INACTIVE]: UserState.INACTIVE,
  [AccountStatus.SUSPENDED]: UserState.SUSPENDED,
  [AccountStatus.PENDING]: UserState.PENDING,
  [AccountStatus.BANNED]: null,
  [AccountStatus.DELETED]: null,
};

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

    // 0) 账号状态与用户状态一致性校验：发生在任何数据库写入之前，失败关闭。
    //    未显式提供 status 时按既有缺省 PENDING 参与比对，因此调用方不能靠省略字段
    //    绕过校验；BANNED / DELETED 无对应 UserState，一律拒绝。
    const effectiveStatus = accountData.status ?? AccountStatus.PENDING;
    const expectedUserState = ACCOUNT_STATUS_TO_USER_STATE[effectiveStatus];
    if (
      expectedUserState === null ||
      String(userInfoData.userState) !== String(expectedUserState)
    ) {
      throw new DomainError(
        ACCOUNT_ERROR.ACCOUNT_STATUS_STATE_MISMATCH,
        '账号状态与用户状态不一致，已拒绝创建',
        undefined,
        {
          diagnostic: 'ACCOUNT_STATUS_USER_STATE_MISMATCH',
          accountStatus: effectiveStatus,
          userState: userInfoData.userState,
        },
      );
    }

    // 1) 创建账户（先写临时密码拿到 createdAt）
    const account = this.accountService.createAccountEntity({
      transactionContext,
      accountData: {
        ...accountData,
        loginPassword: 'temp',
        status: effectiveStatus,
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
