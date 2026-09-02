/// <reference types="jest" />
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import {
  DomainError,
  PERMISSION_ERROR,
  REPAIR_REQUEST_ERROR,
} from '@src/core/common/errors/domain-error';
import type { RepairRequestDeleteOutcome } from '@src/modules/lithography/lithography.types';
import type { RepairRequestService } from '@src/modules/lithography/repair-request.service';
import type { TransactionRunner } from '@src/usecases/common/ports/transaction-runner.contract';
import { DeleteMyRepairRequestUsecase } from './delete-my-repair-request.usecase';
import type { DeleteMyRepairRequestCommand } from './delete-my-repair-request.types';

type RepairRequestServiceMock = {
  readonly softDeleteRequest: jest.Mock<Promise<RepairRequestDeleteOutcome>>;
};

describe('DeleteMyRepairRequestUsecase', () => {
  const transactionContext = Symbol(
    'transactionContext',
  ) as unknown as PersistenceTransactionContext;

  let repairRequestService: RepairRequestServiceMock;
  let transactionRunner: TransactionRunner;
  let usecase: DeleteMyRepairRequestUsecase;

  const buildCommand = (
    overrides: Partial<DeleteMyRepairRequestCommand> = {},
  ): DeleteMyRepairRequestCommand => ({
    session: { accountId: 7, roles: ['CUSTOMER'] },
    requestId: 11,
    ...overrides,
  });

  beforeEach(() => {
    repairRequestService = {
      softDeleteRequest: jest
        .fn()
        .mockResolvedValue({ kind: 'DELETED', id: 11, requestNo: 'RR20260901' } as const),
    };
    transactionRunner = {
      run: jest.fn(async (callback) => await callback(transactionContext)),
    };
    usecase = new DeleteMyRepairRequestUsecase(
      repairRequestService as unknown as RepairRequestService,
      transactionRunner,
    );
  });

  describe('成功路径（含幂等成功）', () => {
    it('CUSTOMER 删除成功返回申请标识，账号取自会话且事务内执行', async () => {
      const result = await usecase.execute(buildCommand());

      expect(transactionRunner.run).toHaveBeenCalledTimes(1);
      expect(repairRequestService.softDeleteRequest).toHaveBeenCalledWith(
        { requestId: 11, customerAccountId: 7 },
        transactionContext,
      );
      expect(result).toEqual({ id: 11, requestNo: 'RR20260901' });
    });

    it('本人重复删除（ALREADY_DELETED）幂等成功，返回与首次删除一致的结果', async () => {
      repairRequestService.softDeleteRequest.mockResolvedValueOnce({
        kind: 'ALREADY_DELETED',
        id: 11,
        requestNo: 'RR20260901',
      });

      await expect(usecase.execute(buildCommand())).resolves.toEqual({
        id: 11,
        requestNo: 'RR20260901',
      });
    });
  });

  describe('角色决策（裁定 2：仅真实 CUSTOMER，不含 SUPER_ADMIN）', () => {
    it.each([[['ENGINEER']], [['SUPER_ADMIN']], [['ENGINEER', 'SUPER_ADMIN']], [[]]])(
      'roles=%j 时拒绝删除且不开事务',
      async (roles) => {
        await expect(
          usecase.execute(buildCommand({ session: { accountId: 7, roles } })),
        ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
        expect(transactionRunner.run).not.toHaveBeenCalled();
        expect(repairRequestService.softDeleteRequest).not.toHaveBeenCalled();
      },
    );

    it('未归一化小写角色被精确匹配拒绝（归一化职责在 adapter 边界，usecase 不重复归一化）', async () => {
      await expect(
        usecase.execute(buildCommand({ session: { accountId: 7, roles: ['customer'] } })),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS });
    });
  });

  describe('输入决策', () => {
    it.each([[0], [-1], [1.5], [Number.NaN]])('requestId=%j 时拒绝且不落库', async (requestId) => {
      await expect(usecase.execute(buildCommand({ requestId }))).rejects.toMatchObject({
        code: REPAIR_REQUEST_ERROR.INVALID_PARAMS,
      });
      expect(transactionRunner.run).not.toHaveBeenCalled();
      expect(repairRequestService.softDeleteRequest).not.toHaveBeenCalled();
    });
  });

  describe('拒绝分支映射（裁定 5）', () => {
    it('不存在/非本人统一 NOT_FOUND，details 只含 id 不泄露存在性', async () => {
      repairRequestService.softDeleteRequest.mockResolvedValueOnce({
        kind: 'NOT_FOUND_OR_NOT_OWNER',
        id: 11,
      });

      let caught: unknown;
      try {
        await usecase.execute(buildCommand());
      } catch (error) {
        caught = error;
      }

      const domainError = caught as DomainError;
      expect(domainError).toBeInstanceOf(DomainError);
      expect(domainError.code).toBe(REPAIR_REQUEST_ERROR.NOT_FOUND);
      expect(domainError.details).toEqual({ id: 11 });
    });

    it('已接单拒绝映射为 REPAIR_REQUEST_ALREADY_ACCEPTED（接单/删除互斥）', async () => {
      repairRequestService.softDeleteRequest.mockResolvedValueOnce({
        kind: 'ALREADY_ACCEPTED',
        id: 11,
        requestNo: 'RR20260901',
      });

      await expect(usecase.execute(buildCommand())).rejects.toMatchObject({
        code: REPAIR_REQUEST_ERROR.ALREADY_ACCEPTED,
      });
    });
  });
});
