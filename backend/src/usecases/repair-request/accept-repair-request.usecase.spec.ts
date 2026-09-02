/// <reference types="jest" />
import { IdentityTypeEnum } from '@app-types/models/account.types';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import type { UsecaseSession } from '@app-types/auth/session.types';
import { PERMISSION_ERROR, REPAIR_REQUEST_ERROR } from '@src/core/common/errors/domain-error';
import type {
  RepairRequestAcceptanceStatusSnapshot,
  RepairRequestAcceptWriteResult,
  RepairRequestDetailView,
} from '@src/modules/lithography/lithography.types';
import type { RepairRequestService } from '@src/modules/lithography/repair-request.service';
import type { TransactionRunner } from '@src/usecases/common/ports/transaction-runner.contract';
import { AcceptRepairRequestUsecase } from './accept-repair-request.usecase';
import type { GetEngineerRepairRequestDetailUsecase } from './get-engineer-repair-request-detail.usecase';

type RepairRequestServiceMock = {
  readonly acceptRequest: jest.Mock<Promise<RepairRequestAcceptWriteResult>>;
  readonly findAcceptanceStatus: jest.Mock<Promise<RepairRequestAcceptanceStatusSnapshot | null>>;
};

type GetEngineerRepairRequestDetailUsecaseMock = {
  readonly execute: jest.Mock<Promise<RepairRequestDetailView>>;
};

/**
 * 接单用例单测：只验证 UseCase 自身持有的业务决策
 * （角色兜底、入参校验、事务边界、写入参数来源、未命中裁决、写后读复用），
 * 不复制 QueryService 的细粒度读权限规则（读权限归读用例与 E2E 覆盖）。
 */
describe('AcceptRepairRequestUsecase', () => {
  const transactionContext = Symbol(
    'transactionContext',
  ) as unknown as PersistenceTransactionContext;
  const requestId = 21;
  const engineerSession: UsecaseSession = {
    accountId: 5,
    roles: [IdentityTypeEnum.ENGINEER],
  };

  const detailView: RepairRequestDetailView = {
    id: requestId,
    requestNo: 'RR20260902100000ABC123',
    equipmentModel: { id: 3, modelCode: 'LITHO-9000', modelName: '光刻机 9000' },
    errorCode: 'E-100',
    faultDescription: '设备无法启动',
    contentMd: '# 设备维修申请',
    createdAt: new Date('2026-09-02T08:00:00.000Z'),
    isAccepted: true,
    acceptedAt: new Date('2026-09-02T08:30:00.000Z'),
    latestResolutionStatus: null,
    responses: [],
  };

  let repairRequestService: RepairRequestServiceMock;
  let getEngineerRepairRequestDetailUsecase: GetEngineerRepairRequestDetailUsecaseMock;
  let transactionRunner: TransactionRunner;
  let usecase: AcceptRepairRequestUsecase;

  beforeEach(() => {
    repairRequestService = {
      acceptRequest: jest.fn().mockResolvedValue({ affected: 1 }),
      findAcceptanceStatus: jest.fn().mockResolvedValue(null),
    };
    getEngineerRepairRequestDetailUsecase = {
      execute: jest.fn().mockResolvedValue(detailView),
    };
    transactionRunner = {
      run: jest.fn(async (callback) => await callback(transactionContext)),
    };
    usecase = new AcceptRepairRequestUsecase(
      repairRequestService as unknown as RepairRequestService,
      getEngineerRepairRequestDetailUsecase as unknown as GetEngineerRepairRequestDetailUsecase,
      transactionRunner,
    );
  });

  const writtenData = () => repairRequestService.acceptRequest.mock.calls[0][0];

  describe('成功路径', () => {
    it('ENGINEER 接单成功并返回写后详情', async () => {
      await expect(usecase.execute({ requestId, session: engineerSession })).resolves.toBe(
        detailView,
      );

      expect(transactionRunner.run).toHaveBeenCalledTimes(1);
      expect(repairRequestService.acceptRequest).toHaveBeenCalledTimes(1);
      expect(repairRequestService.findAcceptanceStatus).not.toHaveBeenCalled();
    });

    it('engineerAccountId 只来自 Session：客户端夹带的接单人字段被忽略', async () => {
      // 入参契约只有 requestId 与 session，这里模拟调用方（Adapter 或恶意客户端）
      // 额外夹带 engineerAccountId / acceptedAt，验证写入值不受影响
      const smuggled = {
        requestId,
        session: engineerSession,
        engineerAccountId: 999,
        acceptedAt: new Date('2000-01-01T00:00:00.000Z'),
      } as unknown as { requestId: number; session: UsecaseSession };

      await usecase.execute(smuggled);

      expect(writtenData().engineerAccountId).toBe(engineerSession.accountId);
      expect(writtenData().engineerAccountId).not.toBe(999);
      expect(writtenData().acceptedAt.getTime()).not.toBe(
        new Date('2000-01-01T00:00:00.000Z').getTime(),
      );
    });

    it('acceptedAt 由后端生成，是落在调用区间内的有效 Date', async () => {
      const before = Date.now();
      await usecase.execute({ requestId, session: engineerSession });
      const after = Date.now();

      const { acceptedAt } = writtenData();
      expect(acceptedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(acceptedAt.getTime())).toBe(false);
      expect(acceptedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(acceptedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('事务边界由 UseCase 持有，条件更新与未命中读取共用同一 transactionContext', async () => {
      repairRequestService.acceptRequest.mockResolvedValue({ affected: 0 });
      repairRequestService.findAcceptanceStatus.mockResolvedValue({
        id: requestId,
        isAccepted: true,
        deprecated: false,
      });

      await expect(usecase.execute({ requestId, session: engineerSession })).rejects.toMatchObject({
        code: REPAIR_REQUEST_ERROR.ALREADY_ACCEPTED,
      });

      expect(transactionRunner.run).toHaveBeenCalledTimes(1);
      expect(repairRequestService.acceptRequest.mock.calls[0][1]).toBe(transactionContext);
      expect(repairRequestService.findAcceptanceStatus.mock.calls[0][1]).toBe(transactionContext);
    });

    it('成功后复用既有工程师详情用例，透传同一 requestId 与 session', async () => {
      await usecase.execute({ requestId, session: engineerSession });

      expect(getEngineerRepairRequestDetailUsecase.execute).toHaveBeenCalledTimes(1);
      expect(getEngineerRepairRequestDetailUsecase.execute).toHaveBeenCalledWith({
        requestId,
        session: engineerSession,
      });
    });
  });

  describe('入参决策', () => {
    it.each([0, -1, 1.5, Number.NaN])(
      '非正整数申请 ID（%p）被拒绝且不开始事务',
      async (invalidId) => {
        await expect(
          usecase.execute({ requestId: invalidId, session: engineerSession }),
        ).rejects.toMatchObject({ code: REPAIR_REQUEST_ERROR.INVALID_PARAMS });

        expect(transactionRunner.run).not.toHaveBeenCalled();
        expect(repairRequestService.acceptRequest).not.toHaveBeenCalled();
        expect(getEngineerRepairRequestDetailUsecase.execute).not.toHaveBeenCalled();
      },
    );
  });

  describe('角色兜底决策', () => {
    it.each([[[IdentityTypeEnum.CUSTOMER]], [[IdentityTypeEnum.SUPER_ADMIN]], [[] as string[]]])(
      'roles=%j 被拒绝，不开始事务、不执行写入',
      async (roles) => {
        await expect(
          usecase.execute({ requestId, session: { accountId: 5, roles } }),
        ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });

        expect(transactionRunner.run).not.toHaveBeenCalled();
        expect(repairRequestService.acceptRequest).not.toHaveBeenCalled();
        expect(getEngineerRepairRequestDetailUsecase.execute).not.toHaveBeenCalled();
      },
    );

    it('SUPER_ADMIN 只继承读权限：读详情用例不因角色兜底被拒绝', async () => {
      // 反向确认「读权限继承不等于接单权限」：SUPER_ADMIN 走读用例不被本用例拦截，
      // 而接单入口被拦截，两者不共享同一判定
      const superAdminSession: UsecaseSession = {
        accountId: 99,
        roles: [IdentityTypeEnum.SUPER_ADMIN],
      };
      await expect(
        usecase.execute({ requestId, session: superAdminSession }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
      expect(getEngineerRepairRequestDetailUsecase.execute).not.toHaveBeenCalled();
    });
  });

  describe('条件更新未命中裁决（affected = 0）', () => {
    beforeEach(() => {
      repairRequestService.acceptRequest.mockResolvedValue({ affected: 0 });
    });

    it('记录不存在时返回 NOT_FOUND，且不泄漏接单人身份', async () => {
      repairRequestService.findAcceptanceStatus.mockResolvedValue(null);

      let caught: unknown;
      try {
        await usecase.execute({ requestId, session: engineerSession });
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        code: REPAIR_REQUEST_ERROR.NOT_FOUND,
        details: { requestId },
      });
      expect(getEngineerRepairRequestDetailUsecase.execute).not.toHaveBeenCalled();
    });

    it('记录已删除时返回 NOT_FOUND', async () => {
      repairRequestService.findAcceptanceStatus.mockResolvedValue({
        id: requestId,
        isAccepted: false,
        deprecated: true,
      });

      await expect(usecase.execute({ requestId, session: engineerSession })).rejects.toMatchObject({
        code: REPAIR_REQUEST_ERROR.NOT_FOUND,
        details: { requestId },
      });
      expect(getEngineerRepairRequestDetailUsecase.execute).not.toHaveBeenCalled();
    });

    it('记录已接单时返回 REPAIR_REQUEST_ALREADY_ACCEPTED，details 只含申请标识', async () => {
      repairRequestService.findAcceptanceStatus.mockResolvedValue({
        id: requestId,
        isAccepted: true,
        deprecated: false,
      });

      let caught: unknown;
      try {
        await usecase.execute({ requestId, session: engineerSession });
      } catch (error) {
        caught = error;
      }

      // 最小快照不读接单人：错误 details 不得含任何工程师账号标识
      expect(caught).toMatchObject({
        code: REPAIR_REQUEST_ERROR.ALREADY_ACCEPTED,
        details: { requestId },
      });
      expect(JSON.stringify((caught as { details?: unknown }).details ?? null)).not.toContain(
        'engineer',
      );
      expect(getEngineerRepairRequestDetailUsecase.execute).not.toHaveBeenCalled();
    });

    it('记录仍未删除且未接单（不应出现的状态）时按系统失败上报', async () => {
      repairRequestService.findAcceptanceStatus.mockResolvedValue({
        id: requestId,
        isAccepted: false,
        deprecated: false,
      });

      await expect(usecase.execute({ requestId, session: engineerSession })).rejects.toMatchObject({
        code: REPAIR_REQUEST_ERROR.ACCEPT_FAILED,
        details: { requestId },
      });
      expect(getEngineerRepairRequestDetailUsecase.execute).not.toHaveBeenCalled();
    });

    it('未命中后只做一次最小状态读取，不额外读取详情或列表', async () => {
      repairRequestService.findAcceptanceStatus.mockResolvedValue(null);

      await expect(usecase.execute({ requestId, session: engineerSession })).rejects.toMatchObject({
        code: REPAIR_REQUEST_ERROR.NOT_FOUND,
      });

      expect(repairRequestService.acceptRequest).toHaveBeenCalledTimes(1);
      expect(repairRequestService.findAcceptanceStatus).toHaveBeenCalledTimes(1);
      expect(repairRequestService.findAcceptanceStatus.mock.calls[0][0]).toBe(requestId);
    });
  });

  describe('写入失败路径', () => {
    it('Service 抛出的接单失败直接上抛，不执行写后详情读取', async () => {
      const dbFailure = { code: REPAIR_REQUEST_ERROR.ACCEPT_FAILED, details: { requestId } };
      repairRequestService.acceptRequest.mockRejectedValue(dbFailure);

      await expect(usecase.execute({ requestId, session: engineerSession })).rejects.toBe(
        dbFailure,
      );

      expect(repairRequestService.findAcceptanceStatus).not.toHaveBeenCalled();
      expect(getEngineerRepairRequestDetailUsecase.execute).not.toHaveBeenCalled();
    });

    it('事务开启失败时不执行写入与写后读取', async () => {
      (transactionRunner.run as jest.Mock).mockRejectedValueOnce(new Error('begin failed'));

      await expect(usecase.execute({ requestId, session: engineerSession })).rejects.toThrow(
        'begin failed',
      );

      expect(repairRequestService.acceptRequest).not.toHaveBeenCalled();
      expect(getEngineerRepairRequestDetailUsecase.execute).not.toHaveBeenCalled();
    });

    it('写后详情读取失败时上抛读用例原始错误，不掩盖为接单失败', async () => {
      const readFailure = { code: 'REPAIR_REQUEST_NOT_FOUND', details: { requestId } };
      getEngineerRepairRequestDetailUsecase.execute.mockRejectedValue(readFailure);

      await expect(usecase.execute({ requestId, session: engineerSession })).rejects.toBe(
        readFailure,
      );

      expect(repairRequestService.acceptRequest).toHaveBeenCalledTimes(1);
    });
  });
});
