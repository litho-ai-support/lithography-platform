// src/usecases/account/admin-change-user-role.usecase.spec.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import {
  ACCOUNT_ERROR,
  ADMIN_USER_ERROR,
  DomainError,
  INPUT_NORMALIZE_ERROR,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import type { AccountService } from '@src/modules/account/base/services/account.service';
import type { AdminUserQueryService } from '@src/modules/account/queries/admin-user.query.service';
import type { PinoLogger } from 'nestjs-pino';
import {
  ADMIN_ACCOUNT_ID,
  TARGET_ACCOUNT_ID,
  captureThrownError,
  createAdminUserView,
  createFakeTransactionHarness,
  createSuperAdminSession,
  createSuperAdminTargetView,
  createUnauthorizedSessions,
} from '../../../test/support/account/admin-user.fixture';
import { AdminChangeUserRoleUsecase } from './admin-change-user-role.usecase';

/**
 * P2-1A：`AdminChangeUserRoleUsecase` 的授权、目标保护、三源一致写入与原子回滚。
 *
 * 「三处同步」在分层上的归属必须分清，否则单测会写出假保证：
 * - `identity_hint` 由本用例经 `AccountService.updateAccount()` 写入；
 * - `access_group` 与 `meta_digest` 由 `AccountService.updateUserInfoAccessGroup()` **一次**
 *   写为同一个单元素数组（该同步在 modules 层内部完成，不在本用例）；
 * 因此本文件断言的是「本用例把单元素数组交给资料侧细粒度方法」这一协作契约，
 * 以及「任一写入失败 ⇒ 事务回滚 ⇒ 不存在两源新值一源旧值的可见中间态」。
 * 三源在数据库中的真实一致性（含 `meta_digest` 加解密往返）由管理员用户管理 E2E 直读核验。
 */
describe('AdminChangeUserRoleUsecase', () => {
  const harness = createFakeTransactionHarness();

  const accountService = {
    lockByIdForUpdate: jest.fn(),
    updateAccount: jest.fn(),
    updateUserInfoAccessGroup: jest.fn(),
  } as unknown as AccountService;

  const adminUserQueryService = {
    findAdminUserViewById: jest.fn(),
  } as unknown as AdminUserQueryService;

  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;

  const usecase = new AdminChangeUserRoleUsecase(
    accountService,
    adminUserQueryService,
    logger,
    harness.transactionRunner,
  );

  /** 锁内目标加载成功（缺省目标是当前 CUSTOMER 的可写账号） */
  const givenLockedTarget = (view = createAdminUserView()): void => {
    (adminUserQueryService.findAdminUserViewById as jest.Mock).mockResolvedValue(view);
  };

  /** 真实角色变更：锁内 CUSTOMER，写后回读 ENGINEER */
  const givenRoleChangeFromCustomerToEngineer = (): void => {
    (adminUserQueryService.findAdminUserViewById as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(createAdminUserView({ role: IdentityTypeEnum.CUSTOMER }))
      .mockResolvedValueOnce(createAdminUserView({ role: IdentityTypeEnum.ENGINEER }));
  };

  const executeAsSuperAdmin = (role: unknown, accountId: unknown = TARGET_ACCOUNT_ID) =>
    usecase.execute({ session: createSuperAdminSession(), accountId, role });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.reset();
    (adminUserQueryService.findAdminUserViewById as jest.Mock).mockReset();
    (accountService.lockByIdForUpdate as jest.Mock).mockReset().mockResolvedValue(undefined);
    (accountService.updateAccount as jest.Mock).mockReset().mockResolvedValue(undefined);
    (accountService.updateUserInfoAccessGroup as jest.Mock)
      .mockReset()
      .mockResolvedValue({ isUpdated: true });
    givenLockedTarget();
  });

  describe('精确 SUPER_ADMIN 授权', () => {
    it.each(createUnauthorizedSessions())(
      '%s 被拒，且不开启事务、不触碰数据库',
      async (_label, session) => {
        await expect(
          usecase.execute({
            session,
            accountId: TARGET_ACCOUNT_ID,
            role: IdentityTypeEnum.ENGINEER,
          }),
        ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });

        expect(harness.transactionRunner.run).not.toHaveBeenCalled();
        expect(accountService.lockByIdForUpdate).not.toHaveBeenCalled();
        expect(accountService.updateAccount).not.toHaveBeenCalled();
        expect(accountService.updateUserInfoAccessGroup).not.toHaveBeenCalled();
        expect(harness.isCommitted()).toBe(false);
        expect(harness.isRolledBack()).toBe(false);
      },
    );

    it('executeWithWriteOutcome 与 execute 走同一授权断言', async () => {
      const [, unauthorizedSession] = createUnauthorizedSessions()[0];

      await expect(
        usecase.executeWithWriteOutcome({
          session: unauthorizedSession,
          accountId: TARGET_ACCOUNT_ID,
          role: IdentityTypeEnum.ENGINEER,
        }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });

      expect(harness.transactionRunner.run).not.toHaveBeenCalled();
    });
  });

  describe('SUPER_ADMIN 目标只读保护', () => {
    it('修改管理员角色被拒且事务回滚', async () => {
      givenLockedTarget(createSuperAdminTargetView());

      const error = await captureThrownError(
        usecase.execute({
          session: createSuperAdminSession(),
          accountId: ADMIN_ACCOUNT_ID,
          // 目标保护裁决「当前是不是只读管理员」，写入白名单裁决「新角色是不是可写值」，
          // 两者不可互相替代：这里新角色合法，仍必须被目标保护拒绝
          role: IdentityTypeEnum.CUSTOMER,
        }),
      );

      expect(error).toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
      expect(accountService.lockByIdForUpdate).toHaveBeenCalledWith(
        ADMIN_ACCOUNT_ID,
        harness.txContext,
      );
      expect(accountService.updateAccount).not.toHaveBeenCalled();
      expect(accountService.updateUserInfoAccessGroup).not.toHaveBeenCalled();
      expect(harness.isRolledBack()).toBe(true);
      expect(harness.isCommitted()).toBe(false);
    });

    it('目标账号不存在时收敛为 TARGET_NOT_FOUND，不塌缩为 UNAUTHENTICATED', async () => {
      (accountService.lockByIdForUpdate as jest.Mock).mockRejectedValue(
        new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账号不存在'),
      );

      const error = await captureThrownError(executeAsSuperAdmin(IdentityTypeEnum.ENGINEER));

      expect(error).toMatchObject({ code: ADMIN_USER_ERROR.TARGET_NOT_FOUND });
      expect(harness.isRolledBack()).toBe(true);
    });
  });

  describe('三源一致写入', () => {
    it('账号侧写 identityHint、资料侧写单元素 accessGroup，且共用同一事务上下文', async () => {
      givenRoleChangeFromCustomerToEngineer();

      await expect(executeAsSuperAdmin(IdentityTypeEnum.ENGINEER)).resolves.toMatchObject({
        role: IdentityTypeEnum.ENGINEER,
      });

      expect(accountService.updateAccount).toHaveBeenCalledTimes(1);
      expect(accountService.updateAccount).toHaveBeenCalledWith(
        TARGET_ACCOUNT_ID,
        // patch 逐字段构造：只含角色与时间列，不透传任何调用方可控字段
        { identityHint: IdentityTypeEnum.ENGINEER, updatedAt: expect.any(Date) },
        harness.txContext,
      );

      expect(accountService.updateUserInfoAccessGroup).toHaveBeenCalledTimes(1);
      expect(accountService.updateUserInfoAccessGroup).toHaveBeenCalledWith({
        accountId: TARGET_ACCOUNT_ID,
        // 单元素数组是 convergeAccountRole 的硬前提：多元素会让该行成为
        // 令管理员列表整次失败关闭的异常行
        accessGroup: [IdentityTypeEnum.ENGINEER],
        transactionContext: harness.txContext,
      });
      const accessGroupArg = (accountService.updateUserInfoAccessGroup as jest.Mock).mock
        .calls[0][0].accessGroup as unknown[];
      expect(accessGroupArg).toHaveLength(1);

      expect(harness.isCommitted()).toBe(true);
      expect(harness.isRolledBack()).toBe(false);
    });

    it('写入顺序先账号侧后资料侧（同一事务内不存在可见中间态）', async () => {
      givenRoleChangeFromCustomerToEngineer();

      await executeAsSuperAdmin(IdentityTypeEnum.ENGINEER);

      const identityHintOrder = (accountService.updateAccount as jest.Mock).mock
        .invocationCallOrder[0];
      const accessGroupOrder = (accountService.updateUserInfoAccessGroup as jest.Mock).mock
        .invocationCallOrder[0];
      expect(identityHintOrder).toBeLessThan(accessGroupOrder);
    });

    it('资料侧写入失败时事务回滚，账号侧已写的 identityHint 一并撤销', async () => {
      givenRoleChangeFromCustomerToEngineer();
      (accountService.updateUserInfoAccessGroup as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ER_LOCK_DEADLOCK: Deadlock found when trying to get lock'), {
          name: 'QueryFailedError',
          driverError: { errno: 1213, code: 'ER_LOCK_DEADLOCK' },
        }),
      );

      const error = await captureThrownError(executeAsSuperAdmin(IdentityTypeEnum.ENGINEER));

      expect(error).toMatchObject({ code: ADMIN_USER_ERROR.WRITE_FAILED });
      // 两源写入都已触达：唯一能阻止「identityHint 新值 + accessGroup 旧值」的手段是回滚
      expect(accountService.updateAccount).toHaveBeenCalledTimes(1);
      expect(accountService.updateUserInfoAccessGroup).toHaveBeenCalledTimes(1);
      expect(harness.isRolledBack()).toBe(true);
      expect(harness.isCommitted()).toBe(false);
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'UNEXPECTED',
          phase: 'WRITE_ROLE',
          errorName: 'QueryFailedError',
          driverCode: 1213,
        }),
        expect.any(String),
      );
    });

    it('账号侧写入失败时不触碰资料侧，事务回滚', async () => {
      givenRoleChangeFromCustomerToEngineer();
      (accountService.updateAccount as jest.Mock).mockRejectedValue(
        new Error('simulated account write failure'),
      );

      await expect(executeAsSuperAdmin(IdentityTypeEnum.ENGINEER)).rejects.toMatchObject({
        code: ADMIN_USER_ERROR.WRITE_FAILED,
      });
      expect(accountService.updateUserInfoAccessGroup).not.toHaveBeenCalled();
      expect(harness.isRolledBack()).toBe(true);
      expect(harness.isCommitted()).toBe(false);
    });
  });

  describe('同角色幂等', () => {
    it.each([
      ['CUSTOMER', IdentityTypeEnum.CUSTOMER],
      ['ENGINEER', IdentityTypeEnum.ENGINEER],
    ])('目标当前已是 %s 时零写入并返回 isUpdated=false', async (_label, role) => {
      givenLockedTarget(createAdminUserView({ role }));

      const outcome = await usecase.executeWithWriteOutcome({
        session: createSuperAdminSession(),
        accountId: TARGET_ACCOUNT_ID,
        role,
      });

      expect(outcome.isUpdated).toBe(false);
      expect(outcome.view.role).toBe(role);
      expect(accountService.updateAccount).not.toHaveBeenCalled();
      expect(accountService.updateUserInfoAccessGroup).not.toHaveBeenCalled();
      // 幂等短路不触发写后回读，也不 bump updated_at
      expect(adminUserQueryService.findAdminUserViewById).toHaveBeenCalledTimes(1);
      expect(harness.isCommitted()).toBe(true);
      expect(harness.isRolledBack()).toBe(false);
      // 幂等仍是「事务成功提交」，因此成功日志照常记录（与 isUpdated 无关）
      expect(logger.info).toHaveBeenCalledWith(
        { accountId: TARGET_ACCOUNT_ID, role },
        expect.any(String),
      );
    });
  });

  describe('写后回读校验', () => {
    it('回读角色不等于请求角色时按写失败关闭并回滚', async () => {
      (adminUserQueryService.findAdminUserViewById as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(createAdminUserView({ role: IdentityTypeEnum.CUSTOMER }))
        // 回读仍是旧角色：三源未如预期收敛到目标角色
        .mockResolvedValueOnce(createAdminUserView({ role: IdentityTypeEnum.CUSTOMER }));

      const error = await captureThrownError(executeAsSuperAdmin(IdentityTypeEnum.ENGINEER));

      expect(error).toMatchObject({
        code: ADMIN_USER_ERROR.WRITE_FAILED,
        cause: { diagnostic: 'ROLE_NOT_REFLECTED_AFTER_WRITE' },
      });
      expect(harness.isRolledBack()).toBe(true);
      expect(harness.isCommitted()).toBe(false);
    });

    it('写后回读为空时按读失败关闭', async () => {
      (adminUserQueryService.findAdminUserViewById as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(createAdminUserView({ role: IdentityTypeEnum.CUSTOMER }))
        .mockResolvedValueOnce(null);

      const error = await captureThrownError(executeAsSuperAdmin(IdentityTypeEnum.ENGINEER));

      expect(error).toMatchObject({
        code: ADMIN_USER_ERROR.READ_FAILED,
        cause: { diagnostic: 'UPDATED_ROLE_NOT_READABLE' },
      });
      expect(harness.isRolledBack()).toBe(true);
    });

    it('资料行缺失导致的 USER_INFO_NOT_FOUND 原样冒泡（本路径不可达但不改写口径）', async () => {
      givenRoleChangeFromCustomerToEngineer();
      const userInfoMissing = new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
      (accountService.updateUserInfoAccessGroup as jest.Mock).mockRejectedValue(userInfoMissing);

      await expect(executeAsSuperAdmin(IdentityTypeEnum.ENGINEER)).rejects.toBe(userInfoMissing);
      expect(harness.isRolledBack()).toBe(true);
    });
  });

  describe('输入白名单失败关闭', () => {
    const illegalRoles: ReadonlyArray<unknown> = [
      IdentityTypeEnum.SUPER_ADMIN,
      'admin',
      '',
      '   ',
      null,
      undefined,
      1,
      [IdentityTypeEnum.ENGINEER],
      [IdentityTypeEnum.ENGINEER, IdentityTypeEnum.CUSTOMER],
    ];

    it.each(illegalRoles)('非法新角色 %p 被拒且不开启事务', async (role) => {
      await expect(executeAsSuperAdmin(role)).rejects.toMatchObject({
        code: INPUT_NORMALIZE_ERROR.INVALID_ENUM_VALUE,
      });
      expect(harness.transactionRunner.run).not.toHaveBeenCalled();
      expect(accountService.lockByIdForUpdate).not.toHaveBeenCalled();
      expect(accountService.updateUserInfoAccessGroup).not.toHaveBeenCalled();
    });

    const illegalAccountIds: ReadonlyArray<unknown> = [
      0,
      -1,
      1.5,
      Number.NaN,
      '2',
      null,
      undefined,
    ];

    it.each(illegalAccountIds)('非法目标账号 ID %p 被拒且不开启事务', async (accountId) => {
      await expect(
        usecase.execute({
          session: createSuperAdminSession(),
          accountId,
          role: IdentityTypeEnum.ENGINEER,
        }),
      ).rejects.toMatchObject({ code: INPUT_NORMALIZE_ERROR.INVALID_LIMIT_VALUE });
      expect(harness.transactionRunner.run).not.toHaveBeenCalled();
    });
  });

  describe('两条入口共享同一实现', () => {
    it('execute 只返回 View，executeWithWriteOutcome 额外暴露写入事实', async () => {
      givenRoleChangeFromCustomerToEngineer();

      const view = await executeAsSuperAdmin(IdentityTypeEnum.ENGINEER);
      expect(view.role).toBe(IdentityTypeEnum.ENGINEER);
      expect(view).not.toHaveProperty('isUpdated');

      givenRoleChangeFromCustomerToEngineer();
      const outcome = await usecase.executeWithWriteOutcome({
        session: createSuperAdminSession(),
        accountId: TARGET_ACCOUNT_ID,
        role: IdentityTypeEnum.ENGINEER,
      });
      expect(outcome).toEqual({
        view: expect.objectContaining({ role: IdentityTypeEnum.ENGINEER }),
        isUpdated: true,
      });

      // 提交后才记录成功日志，且只含账号主键与新角色（不含登录名、昵称等凭据派生物）
      expect(logger.info).toHaveBeenCalledWith(
        { accountId: TARGET_ACCOUNT_ID, role: IdentityTypeEnum.ENGINEER },
        expect.any(String),
      );
    });

    it('事务边界自身失败时收敛为 WRITE_FAILED', async () => {
      harness.runMock.mockRejectedValueOnce(new Error('simulated COMMIT failure'));

      await expect(executeAsSuperAdmin(IdentityTypeEnum.ENGINEER)).rejects.toMatchObject({
        code: ADMIN_USER_ERROR.WRITE_FAILED,
      });
      expect(harness.isCommitted()).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'TRANSACTION_BOUNDARY' }),
        expect.any(String),
      );
    });
  });
});
