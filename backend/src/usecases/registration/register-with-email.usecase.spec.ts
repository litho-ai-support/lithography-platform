// src/usecases/registration/register-with-email.usecase.spec.ts
import { AccountStatus, IdentityTypeEnum, UserAccountView } from '@app-types/models/account.types';
import { UserState } from '@app-types/models/user-info.types';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { ACCOUNT_ERROR, DomainError } from '@core/common/errors';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import { PinoLogger } from 'nestjs-pino';
import { RegisterWithEmailUsecase } from './register-with-email.usecase';
import { RegisterTypeEnum } from '@app-types/services/register.types';

describe('RegisterWithEmailUsecase（注册事务语义）', () => {
  const ACCOUNT_ID = 101;

  let accountService: {
    createAccountEntity: jest.Mock;
    saveAccount: jest.Mock;
    updateAccountPasswordHash: jest.Mock;
    createUserInfoEntity: jest.Mock;
    saveUserInfo: jest.Mock;
    updateAccount: jest.Mock;
  };
  let accountQueryService: {
    checkAccountExists: jest.Mock;
    pickAvailableNickname: jest.Mock;
    getUserAccountViewById: jest.Mock;
  };
  let passwordPolicyService: { validatePassword: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  /** 模拟 TransactionRunner：成功提交、异常回滚，并把事务上下文透传给回调 */
  let txContext: PersistenceTransactionContext;
  let committed: boolean;
  let rolledBack: boolean;
  let transactionRunner: { run: jest.Mock };

  let usecase: RegisterWithEmailUsecase;

  const validParams = () => ({
    loginName: 'newuser',
    loginEmail: 'newuser@example.com',
    loginPassword: 'Str0ng!Passw0rd',
    nickname: '新用户',
    type: RegisterTypeEnum.CUSTOMER,
    clientIp: '127.0.0.1',
  });

  const savedView = (): UserAccountView =>
    ({
      id: ACCOUNT_ID,
      status: AccountStatus.ACTIVE,
    }) as unknown as UserAccountView;

  beforeEach(() => {
    txContext = { transaction: {} } as unknown as PersistenceTransactionContext;
    committed = false;
    rolledBack = false;

    accountService = {
      createAccountEntity: jest.fn(),
      saveAccount: jest.fn(),
      updateAccountPasswordHash: jest.fn(),
      createUserInfoEntity: jest.fn(),
      saveUserInfo: jest.fn(),
      updateAccount: jest.fn(),
    };
    accountQueryService = {
      checkAccountExists: jest.fn().mockResolvedValue(false),
      pickAvailableNickname: jest.fn().mockResolvedValue('新用户'),
      getUserAccountViewById: jest.fn().mockResolvedValue(savedView()),
    };
    passwordPolicyService = {
      validatePassword: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
    };
    logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    transactionRunner = {
      run: jest.fn(async (fn: (ctx: PersistenceTransactionContext) => Promise<unknown>) => {
        try {
          const result = await fn(txContext);
          committed = true;
          return result;
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      }),
    };

    // saveAccount 返回带 id / createdAt 的账号实体
    accountService.saveAccount.mockImplementation(({ account }) => ({
      ...account,
      id: ACCOUNT_ID,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    usecase = new RegisterWithEmailUsecase(
      accountService as unknown as AccountService,
      accountQueryService as unknown as AccountQueryService,
      passwordPolicyService as unknown as PasswordPolicyService,
      logger as unknown as PinoLogger,
      transactionRunner as never,
    );
  });

  describe('注册成功：事务内直接写 ACTIVE / ACTIVE', () => {
    it('账号实体以 status=ACTIVE 创建（不再先写 PENDING 再补救）', async () => {
      await usecase.execute(validParams());

      expect(accountService.createAccountEntity).toHaveBeenCalledTimes(1);
      const arg = accountService.createAccountEntity.mock.calls[0][0];
      expect(arg.transactionContext).toBe(txContext);
      expect(arg.accountData).toMatchObject({
        status: AccountStatus.ACTIVE,
        identityHint: IdentityTypeEnum.CUSTOMER,
      });
    });

    it('userInfo 实体在事务内显式写 userState=ACTIVE，不依赖 Entity 默认值', async () => {
      await usecase.execute(validParams());

      expect(accountService.createUserInfoEntity).toHaveBeenCalledTimes(1);
      const arg = accountService.createUserInfoEntity.mock.calls[0][0];
      expect(arg.transactionContext).toBe(txContext);
      expect(arg.userInfoData).toMatchObject({
        accountId: ACCOUNT_ID,
        userState: UserState.ACTIVE,
        accessGroup: [IdentityTypeEnum.CUSTOMER],
      });
    });

    it('账号、密码哈希与资料写入共享同一事务上下文，事务正常提交', async () => {
      const result = await usecase.execute(validParams());

      expect(result).toMatchObject({ success: true, accountId: ACCOUNT_ID });
      expect(accountService.updateAccountPasswordHash).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: ACCOUNT_ID, transactionContext: txContext }),
      );
      expect(accountService.saveUserInfo).toHaveBeenCalledWith(
        expect.objectContaining({ transactionContext: txContext }),
      );
      expect(committed).toBe(true);
      expect(rolledBack).toBe(false);
    });

    it('事务提交后不再单独调用 updateAccount(...ACTIVE) 补救', async () => {
      await usecase.execute(validParams());

      expect(accountService.updateAccount).not.toHaveBeenCalled();
    });
  });

  describe('失败原子性：任一步失败不得返回成功或留下半成品', () => {
    it('userInfo 保存失败时异常上抛、事务回滚，不返回注册成功', async () => {
      accountService.saveUserInfo.mockRejectedValue(new Error('user_info insert failed'));

      await expect(usecase.execute(validParams())).rejects.toMatchObject({
        code: ACCOUNT_ERROR.REGISTRATION_FAILED,
      });

      expect(rolledBack).toBe(true);
      expect(committed).toBe(false);
      // 失败路径不得出现任何事务外补救写
      expect(accountService.updateAccount).not.toHaveBeenCalled();
    });

    it('密码策略失败时同样不发生任何落库写入', async () => {
      passwordPolicyService.validatePassword.mockReturnValue({
        isValid: false,
        errors: ['密码强度不足'],
      });

      await expect(usecase.execute(validParams())).rejects.toBeInstanceOf(DomainError);

      expect(accountService.saveAccount).not.toHaveBeenCalled();
      expect(accountService.saveUserInfo).not.toHaveBeenCalled();
      expect(rolledBack).toBe(true);
    });
  });
});
