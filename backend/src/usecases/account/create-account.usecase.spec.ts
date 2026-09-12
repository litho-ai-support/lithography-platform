// src/usecases/account/create-account.usecase.spec.ts
import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { UserState } from '@app-types/models/user-info.types';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { ACCOUNT_ERROR, AUTH_ERROR, DomainError } from '@core/common/errors/domain-error';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import { CreateAccountUsecase } from './create-account.usecase';

describe('CreateAccountUsecase（账号状态与用户状态一致性校验）', () => {
  const ACCOUNT_ID = 301;

  let accountService: {
    createAccountEntity: jest.Mock;
    saveAccount: jest.Mock;
    updateAccountPasswordHash: jest.Mock;
    createUserInfoEntity: jest.Mock;
    saveUserInfo: jest.Mock;
  };
  let accountQueryService: { getUserAccountViewById: jest.Mock };
  let passwordPolicyService: { validatePassword: jest.Mock };

  let txContext: PersistenceTransactionContext;
  let transactionRunner: { run: jest.Mock };

  let usecase: CreateAccountUsecase;

  const validCommand = (
    overrides: {
      status?: AccountStatus;
      userState?: UserState;
      omitStatus?: boolean;
    } = {},
  ) => {
    const accountData: Record<string, unknown> = {
      loginName: 'createduser',
      loginEmail: 'createduser@example.com',
      loginPassword: 'Str0ng!Passw0rd',
      status: overrides.status,
      identityHint: IdentityTypeEnum.CUSTOMER,
    };
    if (overrides.omitStatus) delete accountData.status;
    return {
      accountData: accountData as unknown as Parameters<
        CreateAccountUsecase['execute']
      >[0]['accountData'],
      userInfoData: {
        nickname: '创建用户',
        email: 'createduser@example.com',
        accessGroup: [IdentityTypeEnum.CUSTOMER],
        metaDigest: [IdentityTypeEnum.CUSTOMER],
        userState: overrides.userState ?? UserState.ACTIVE,
      } as Parameters<CreateAccountUsecase['execute']>[0]['userInfoData'],
    };
  };

  beforeEach(() => {
    txContext = { transaction: {} } as unknown as PersistenceTransactionContext;

    accountService = {
      createAccountEntity: jest.fn(),
      saveAccount: jest.fn(),
      updateAccountPasswordHash: jest.fn(),
      createUserInfoEntity: jest.fn(),
      saveUserInfo: jest.fn(),
    };
    accountQueryService = {
      getUserAccountViewById: jest.fn().mockResolvedValue({ id: ACCOUNT_ID }),
    };
    passwordPolicyService = {
      validatePassword: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
    };
    transactionRunner = {
      run: jest.fn((fn: (ctx: PersistenceTransactionContext) => Promise<unknown>) => fn(txContext)),
    };

    accountService.saveAccount.mockImplementation(({ account }) => ({
      ...account,
      id: ACCOUNT_ID,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    usecase = new CreateAccountUsecase(
      accountService as unknown as AccountService,
      accountQueryService as unknown as AccountQueryService,
      passwordPolicyService as unknown as PasswordPolicyService,
      transactionRunner as never,
    );
  });

  describe('一致状态允许创建', () => {
    it.each([
      ['ACTIVE / ACTIVE', AccountStatus.ACTIVE, UserState.ACTIVE],
      ['INACTIVE / INACTIVE', AccountStatus.INACTIVE, UserState.INACTIVE],
      ['SUSPENDED / SUSPENDED', AccountStatus.SUSPENDED, UserState.SUSPENDED],
      ['PENDING / PENDING', AccountStatus.PENDING, UserState.PENDING],
    ])('%s 通过校验并落库', async (_label, status, userState) => {
      await usecase.execute(validCommand({ status, userState }));

      const accountArg = accountService.createAccountEntity.mock.calls[0][0];
      expect(accountArg.accountData).toMatchObject({ status });
      const userInfoArg = accountService.createUserInfoEntity.mock.calls[0][0];
      expect(userInfoArg.userInfoData).toMatchObject({ userState });
    });
  });

  describe('不一致状态在任何写入之前拒绝', () => {
    it.each([
      ['ACTIVE / PENDING', AccountStatus.ACTIVE, UserState.PENDING],
      ['PENDING / ACTIVE', AccountStatus.PENDING, UserState.ACTIVE],
      ['INACTIVE / ACTIVE', AccountStatus.INACTIVE, UserState.ACTIVE],
    ])('%s 拒绝且不落库', async (_label, status, userState) => {
      await expect(usecase.execute(validCommand({ status, userState }))).rejects.toMatchObject({
        code: ACCOUNT_ERROR.ACCOUNT_STATUS_STATE_MISMATCH,
      });

      // 拒绝发生在落库之前：账号、哈希与资料全部零写入
      expect(accountService.saveAccount).not.toHaveBeenCalled();
      expect(accountService.updateAccountPasswordHash).not.toHaveBeenCalled();
      expect(accountService.saveUserInfo).not.toHaveBeenCalled();
    });
  });

  describe('BANNED / DELETED 无对应 UserState，失败关闭', () => {
    it.each([
      ['BANNED', AccountStatus.BANNED],
      ['DELETED', AccountStatus.DELETED],
    ])('%s 即使配对任何 UserState 也拒绝', async (_label, status) => {
      await expect(
        usecase.execute(validCommand({ status, userState: UserState.ACTIVE })),
      ).rejects.toBeInstanceOf(DomainError);

      await expect(
        usecase.execute(validCommand({ status, userState: UserState.INACTIVE })),
      ).rejects.toMatchObject({ code: ACCOUNT_ERROR.ACCOUNT_STATUS_STATE_MISMATCH });

      expect(accountService.saveAccount).not.toHaveBeenCalled();
      expect(accountService.saveUserInfo).not.toHaveBeenCalled();
    });
  });

  it('省略 status 时按缺省 PENDING 参与比对，不能靠省略字段绕过校验', async () => {
    await expect(
      usecase.execute(validCommand({ omitStatus: true, userState: UserState.ACTIVE })),
    ).rejects.toMatchObject({ code: ACCOUNT_ERROR.ACCOUNT_STATUS_STATE_MISMATCH });

    expect(accountService.saveAccount).not.toHaveBeenCalled();
  });

  it('密码策略失败时在一致性校验语义不变的前提下同样不落库', async () => {
    passwordPolicyService.validatePassword.mockReturnValue({
      isValid: false,
      errors: ['密码强度不足'],
    });

    await expect(
      usecase.execute(validCommand({ status: AccountStatus.ACTIVE, userState: UserState.ACTIVE })),
    ).rejects.toMatchObject({ code: AUTH_ERROR.INVALID_PASSWORD });

    expect(accountService.saveAccount).not.toHaveBeenCalled();
    expect(accountService.saveUserInfo).not.toHaveBeenCalled();
  });
});
