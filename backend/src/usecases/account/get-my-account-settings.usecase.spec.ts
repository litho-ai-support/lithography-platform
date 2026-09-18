// src/usecases/account/get-my-account-settings.usecase.spec.ts

import type { UsecaseSession } from '@app-types/auth/session.types';
import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { ADMIN_USER_ERROR, INPUT_NORMALIZE_ERROR } from '@core/common/errors/domain-error';
import type { MyAccountSettingsSnapshot } from '@src/modules/account/account.types';
import type { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import type { PinoLogger } from 'nestjs-pino';
import { GetMyAccountSettingsUsecase } from './get-my-account-settings.usecase';

/**
 * P1：`GetMyAccountSettingsUsecase` 的 Session 透传、accountId 剥离与失败关闭冒泡。
 *
 * 三源收敛、双状态一致性与资料缺失的判定在 `AccountQueryService`（另有定向单测），
 * 本文件只核实用例层的四件事：
 * 1. 目标账号只来自 Session，`accountId` 原样透传给 QueryService，不存在读取他人设置的路径；
 * 2. 非法 Session `accountId` 先经 normalize 失败关闭，不触发任何查询；
 * 3. 返回的公开 View **剥离了 accountId**，其余字段直通；
 * 4. QueryService 抛出的 `ROLE_DATA_INCONSISTENT` / `READ_FAILED` 与账号行缺失（`null`）
 *    都失败关闭——不改写错误码、不兜底、不静默修复，只补服务端日志。
 */
describe('GetMyAccountSettingsUsecase', () => {
  const ACCOUNT_ID = 7;

  const accountQueryService = {
    findMyAccountSettingsSnapshot: jest.fn(),
  } as unknown as AccountQueryService;

  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;

  const usecase = new GetMyAccountSettingsUsecase(accountQueryService, logger);

  const session = (overrides: Partial<UsecaseSession> = {}): UsecaseSession => ({
    accountId: ACCOUNT_ID,
    roles: [IdentityTypeEnum.CUSTOMER],
    activeRole: IdentityTypeEnum.CUSTOMER,
    ...overrides,
  });

  const snapshot = (
    overrides: Partial<MyAccountSettingsSnapshot> = {},
  ): MyAccountSettingsSnapshot => ({
    accountId: ACCOUNT_ID,
    loginName: 'self_user',
    loginEmail: 'self@example.com',
    nickname: 'self_nickname',
    companyName: '示例公司',
    phone: '13800000000',
    contactEmail: 'contact@example.com',
    role: IdentityTypeEnum.CUSTOMER,
    status: AccountStatus.ACTIVE,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  const capturedAccountId = (): unknown =>
    (accountQueryService.findMyAccountSettingsSnapshot as jest.Mock).mock.calls[0][0] as unknown;

  beforeEach(() => {
    jest.clearAllMocks();
    (accountQueryService.findMyAccountSettingsSnapshot as jest.Mock)
      .mockReset()
      .mockResolvedValue(snapshot());
  });

  it('目标账号只来自 Session，accountId 原样透传给 QueryService', async () => {
    await usecase.execute({ session: session({ accountId: 99 }) });

    expect(accountQueryService.findMyAccountSettingsSnapshot).toHaveBeenCalledTimes(1);
    expect(capturedAccountId()).toEqual({ accountId: 99 });
  });

  it('非法 Session accountId 先失败关闭，不触发查询', async () => {
    await expect(usecase.execute({ session: session({ accountId: 0 }) })).rejects.toMatchObject({
      code: INPUT_NORMALIZE_ERROR.INVALID_LIMIT_VALUE,
    });
    expect(accountQueryService.findMyAccountSettingsSnapshot).not.toHaveBeenCalled();
  });

  it('返回的公开 View 剥离 accountId，其余字段直通', async () => {
    const view = await usecase.execute({ session: session() });

    expect(Object.keys(view).sort()).toEqual([
      'companyName',
      'contactEmail',
      'loginEmail',
      'loginName',
      'nickname',
      'phone',
      'role',
      'status',
      'updatedAt',
    ]);
    expect(view).not.toHaveProperty('accountId');
    expect(view).toEqual({
      loginName: 'self_user',
      loginEmail: 'self@example.com',
      nickname: 'self_nickname',
      companyName: '示例公司',
      phone: '13800000000',
      contactEmail: 'contact@example.com',
      role: IdentityTypeEnum.CUSTOMER,
      status: AccountStatus.ACTIVE,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('账号行缺失（null）失败关闭为 READ_FAILED，不塌缩为 UNAUTHENTICATED', async () => {
    (accountQueryService.findMyAccountSettingsSnapshot as jest.Mock).mockResolvedValue(null);

    await expect(usecase.execute({ session: session() })).rejects.toMatchObject({
      code: ADMIN_USER_ERROR.READ_FAILED,
      details: undefined,
      cause: { diagnostic: 'ACCOUNT_ROW_MISSING', accountId: ACCOUNT_ID },
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it.each([
    ['ROLE_DATA_INCONSISTENT', ADMIN_USER_ERROR.ROLE_DATA_INCONSISTENT],
    ['READ_FAILED', ADMIN_USER_ERROR.READ_FAILED],
  ])('QueryService 抛出的 %s 原样冒泡且被记录', async (_label, code) => {
    (accountQueryService.findMyAccountSettingsSnapshot as jest.Mock).mockRejectedValue(
      Object.assign(new Error('boom'), {
        name: 'DomainError',
        code,
        details: undefined,
        cause: {},
      }),
    );

    await expect(usecase.execute({ session: session() })).rejects.toMatchObject({ code });
    expect(logger.error).toHaveBeenCalled();
  });
});
