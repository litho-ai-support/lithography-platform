// src/usecases/registration/weapp-register.usecase.spec.ts
import {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { UserState } from '@app-types/models/user-info.types';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import type { ThirdPartySession } from '@app-types/models/third-party-auth.types';
import { THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { ThirdPartyAuthQueryService } from '@modules/third-party-auth/queries/third-party-auth.query.service';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import { PinoLogger } from 'nestjs-pino';
import { WeappRegisterUsecase } from './weapp-register.usecase';

describe('WeappRegisterUsecase（注册事务语义）', () => {
  const ACCOUNT_ID = 201;

  let tpa: {
    resolveIdentity: jest.Mock;
    bindThirdPartyForRegistration: jest.Mock;
    getWeappPhoneNumber: jest.Mock;
  };
  let thirdPartyAuthQueryService: { findAccountByThirdParty: jest.Mock };
  let accountService: {
    createAccountEntity: jest.Mock;
    saveAccount: jest.Mock;
    updateAccountPasswordHash: jest.Mock;
    createUserInfoEntity: jest.Mock;
    saveUserInfo: jest.Mock;
    updateAccount: jest.Mock;
  };
  let accountQueryService: {
    pickAvailableNickname: jest.Mock;
    getUserAccountViewById: jest.Mock;
  };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  let txContext: PersistenceTransactionContext;
  let committed: boolean;
  let rolledBack: boolean;
  let transactionRunner: { run: jest.Mock };

  let usecase: WeappRegisterUsecase;

  const validParams = () => ({
    provider: ThirdPartyProviderEnum.WEAPP,
    authCredential: 'wx-code-e2e',
    audience: AudienceTypeEnum.SSTSWEAPP,
  });

  const session = (): ThirdPartySession =>
    ({
      provider: ThirdPartyProviderEnum.WEAPP,
      providerUserId: 'openid-1',
      unionId: null,
      profile: { nickname: 'WeappUser' },
      sessionKeyRaw: 'session-key',
    }) as unknown as ThirdPartySession;

  beforeEach(() => {
    txContext = { transaction: {} } as unknown as PersistenceTransactionContext;
    committed = false;
    rolledBack = false;

    tpa = {
      resolveIdentity: jest.fn().mockResolvedValue(session()),
      bindThirdPartyForRegistration: jest.fn().mockResolvedValue(undefined),
      getWeappPhoneNumber: jest.fn(),
    };
    thirdPartyAuthQueryService = { findAccountByThirdParty: jest.fn().mockResolvedValue(null) };
    accountService = {
      createAccountEntity: jest.fn(),
      saveAccount: jest.fn(),
      updateAccountPasswordHash: jest.fn(),
      createUserInfoEntity: jest.fn(),
      saveUserInfo: jest.fn(),
      updateAccount: jest.fn(),
    };
    accountQueryService = {
      pickAvailableNickname: jest.fn().mockResolvedValue('微信用户_abc123'),
      getUserAccountViewById: jest.fn().mockResolvedValue({ id: ACCOUNT_ID }),
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

    accountService.saveAccount.mockImplementation(({ account }) => ({
      ...account,
      id: ACCOUNT_ID,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    usecase = new WeappRegisterUsecase(
      tpa as unknown as ThirdPartyAuthService,
      thirdPartyAuthQueryService as unknown as ThirdPartyAuthQueryService,
      accountService as unknown as AccountService,
      accountQueryService as unknown as AccountQueryService,
      logger as unknown as PinoLogger,
      transactionRunner as never,
    );
  });

  describe('注册成功：事务内直接写 ACTIVE / ACTIVE', () => {
    it('账号实体以 status=ACTIVE 创建，资料显式写 userState=ACTIVE', async () => {
      const result = await usecase.execute(validParams());

      expect(result).toMatchObject({ success: true, accountId: ACCOUNT_ID });

      const accountArg = accountService.createAccountEntity.mock.calls[0][0];
      expect(accountArg.transactionContext).toBe(txContext);
      expect(accountArg.accountData).toMatchObject({
        status: AccountStatus.ACTIVE,
        identityHint: IdentityTypeEnum.CUSTOMER,
      });

      const userInfoArg = accountService.createUserInfoEntity.mock.calls[0][0];
      expect(userInfoArg.transactionContext).toBe(txContext);
      expect(userInfoArg.userInfoData).toMatchObject({
        accountId: ACCOUNT_ID,
        userState: UserState.ACTIVE,
        accessGroup: [IdentityTypeEnum.CUSTOMER],
      });
    });

    it('事务提交后不再调用 updateAccount(...ACTIVE) 补救，第三方绑定照常创建', async () => {
      await usecase.execute(validParams());

      expect(accountService.updateAccount).not.toHaveBeenCalled();
      expect(tpa.bindThirdPartyForRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: ACCOUNT_ID }),
      );
      expect(committed).toBe(true);
      expect(rolledBack).toBe(false);
    });

    it('账号、密码哈希与资料写入共享同一事务上下文', async () => {
      await usecase.execute(validParams());

      expect(accountService.updateAccountPasswordHash).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: ACCOUNT_ID, transactionContext: txContext }),
      );
      expect(accountService.saveUserInfo).toHaveBeenCalledWith(
        expect.objectContaining({ transactionContext: txContext }),
      );
    });
  });

  describe('失败原子性', () => {
    it('userInfo 保存失败时异常上抛、事务回滚，不返回注册成功', async () => {
      accountService.saveUserInfo.mockRejectedValue(new Error('user_info insert failed'));

      await expect(usecase.execute(validParams())).rejects.toMatchObject({
        code: THIRDPARTY_ERROR.REGISTRATION_FAILED,
      });

      expect(rolledBack).toBe(true);
      expect(committed).toBe(false);
      expect(accountService.updateAccount).not.toHaveBeenCalled();
      // 账号创建事务失败时，第三方绑定不得进行
      expect(tpa.bindThirdPartyForRegistration).not.toHaveBeenCalled();
    });
  });
});
