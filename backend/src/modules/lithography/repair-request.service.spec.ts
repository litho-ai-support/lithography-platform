/// <reference types="jest" />
import { DomainError, REPAIR_REQUEST_ERROR } from '@src/core/common/errors/domain-error';
import { createTypeOrmPersistenceTransactionContext } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { RepairRequestEntity } from './entities/repair-request.entity';
import { RepairRequestInsertData } from './lithography.types';
import { RepairRequestService } from './repair-request.service';

describe('RepairRequestService', () => {
  const createdAt = new Date('2026-08-26T10:00:00.000Z');
  const insertData: RepairRequestInsertData = {
    requestNo: 'RR20260826100000ABC123',
    customerAccountId: 7,
    equipmentModelId: 3,
    errorCode: 'E-100',
    faultDescription: '设备无法启动',
    contentMd: '# 设备维修申请',
  };

  let repository: ReturnType<typeof createMockRepository>;
  let service: RepairRequestService;

  beforeEach(() => {
    repository = createMockRepository();
    repository.create.mockImplementation((data: Record<string, unknown>) => data);
    repository.save.mockImplementation((entity: Record<string, unknown>) => ({
      ...entity,
      id: 11,
      createdAt,
    }));
    service = new RepairRequestService(repository as unknown as Repository<RepairRequestEntity>);
  });

  it('insertRequest 显式落初始状态并返回稳定快照', async () => {
    const snapshot = await service.insertRequest(insertData);

    const created = repository.create.mock.calls[0][0] as Record<string, unknown>;
    expect(created.isAccepted).toBe(false);
    expect(created.deprecated).toBe(false);
    expect(created.acceptedByEngineerAccountId).toBeUndefined();
    expect(created.acceptedAt).toBeUndefined();
    expect(created.deletedAt).toBeUndefined();

    expect(snapshot).toEqual({
      id: 11,
      requestNo: insertData.requestNo,
      customerAccountId: 7,
      equipmentModelId: 3,
      errorCode: 'E-100',
      faultDescription: '设备无法启动',
      createdAt,
      isAccepted: false,
    });
  });

  it('唯一索引冲突（ER_DUP_ENTRY）抛出可区分的编号冲突错误', async () => {
    const driverError = new Error('dup entry') as Error & { code: string };
    driverError.code = 'ER_DUP_ENTRY';
    repository.save.mockRejectedValue(new QueryFailedError('INSERT', [], driverError));

    await expect(service.insertRequest(insertData)).rejects.toMatchObject({
      code: REPAIR_REQUEST_ERROR.REQUEST_NO_CONFLICT,
    });
  });

  it('driverError 缺失时回退读取错误对象本身识别唯一约束冲突（errno 1062）', async () => {
    const driverError = new Error('dup') as Error & { errno: number };
    driverError.errno = 1062;
    const failedError = new QueryFailedError('INSERT', [], driverError);
    delete (failedError as unknown as { driverError?: unknown }).driverError;
    repository.save.mockRejectedValue(failedError);

    await expect(service.insertRequest(insertData)).rejects.toMatchObject({
      code: REPAIR_REQUEST_ERROR.REQUEST_NO_CONFLICT,
    });
  });

  it('非唯一约束冲突的落库失败包装为创建失败，且不向客户端泄漏原始数据库错误', async () => {
    // 构造含敏感信息的驱动错误：真实 MySQL 错误可能携带表名、约束名与输入内容
    const sensitiveMessage =
      "Cannot add or update a child row: foreign key constraint fails on 'repair_request'";
    const driverError = new Error(sensitiveMessage) as Error & { code: string };
    driverError.code = 'ER_NO_REFERENCED_ROW_2';
    const queryFailedError = new QueryFailedError('INSERT', [], driverError);
    repository.save.mockRejectedValue(queryFailedError);

    let caught: unknown;
    try {
      await service.insertRequest(insertData);
    } catch (error) {
      caught = error;
    }

    const domainError = caught as DomainError;
    expect(domainError).toBeInstanceOf(DomainError);
    expect(domainError.code).toBe(REPAIR_REQUEST_ERROR.CREATION_FAILED);
    // details 会被全局 GraphQL Filter 原样写入响应：不得包含驱动错误文本，
    // 仅保留业务上可公开的编号；底层异常保留为 cause 供服务端日志使用。
    expect(JSON.stringify(domainError.details ?? null)).not.toContain('ER_NO_REFERENCED_ROW_2');
    expect(JSON.stringify(domainError.details ?? null)).not.toContain('repair_request');
    expect(domainError.details).toEqual({ requestNo: insertData.requestNo });
    expect(domainError.cause).toBe(queryFailedError);
  });

  it('非 QueryFailedError 的异常同样包装为创建失败，且不向客户端泄漏异常消息', async () => {
    repository.save.mockRejectedValue(new Error('connection lost'));

    let caught: unknown;
    try {
      await service.insertRequest(insertData);
    } catch (error) {
      caught = error;
    }

    const domainError = caught as DomainError;
    expect(domainError).toBeInstanceOf(DomainError);
    expect(domainError.code).toBe(REPAIR_REQUEST_ERROR.CREATION_FAILED);
    expect(JSON.stringify(domainError.details ?? null)).not.toContain('connection lost');
  });

  it('携带事务上下文时改用事务内的 EntityManager 落库', async () => {
    const transactionContext = createTypeOrmPersistenceTransactionContext({
      getRepository: () => repository,
    } as unknown as EntityManager);

    await service.insertRequest(insertData, transactionContext);

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('requestNoExists 按计数结果返回是否存在', async () => {
    repository.count.mockResolvedValueOnce(1);
    await expect(service.requestNoExists(insertData.requestNo)).resolves.toBe(true);
    expect(repository.count).toHaveBeenLastCalledWith({
      where: { requestNo: insertData.requestNo },
    });

    repository.count.mockResolvedValueOnce(0);
    await expect(service.requestNoExists(insertData.requestNo)).resolves.toBe(false);
  });

  describe('softDeleteRequest（原子条件软删除）', () => {
    const deleteParams = { requestId: 11, customerAccountId: 7 };

    it('条件更新命中时软删除并回读编号返回 DELETED', async () => {
      repository.update.mockResolvedValueOnce({ affected: 1 });
      repository.findOne.mockResolvedValueOnce({ id: 11, requestNo: insertData.requestNo });

      const outcome = await service.softDeleteRequest(deleteParams);

      expect(outcome).toEqual({ kind: 'DELETED', id: 11, requestNo: insertData.requestNo });
      // 原子条件更新：删除条件必须含归属与接单/作废状态（接单/删除互斥）
      expect(repository.update).toHaveBeenCalledWith(
        { id: 11, customerAccountId: 7, isAccepted: false, deprecated: false },
        { deprecated: true, deletedAt: expect.any(Function) },
      );
      const setClause = repository.update.mock.calls[0][1] as Record<string, unknown>;
      expect((setClause.deletedAt as () => string)()).toBe('CURRENT_TIMESTAMP(3)');
    });

    it('条件未命中且行不存在时返回 NOT_FOUND_OR_NOT_OWNER', async () => {
      repository.update.mockResolvedValueOnce({ affected: 0 });
      repository.findOne.mockResolvedValueOnce(null);

      await expect(service.softDeleteRequest(deleteParams)).resolves.toEqual({
        kind: 'NOT_FOUND_OR_NOT_OWNER',
        id: 11,
      });
    });

    it('非本人申请一律返回 NOT_FOUND_OR_NOT_OWNER，不泄露已接单/已删除状态', async () => {
      repository.update.mockResolvedValueOnce({ affected: 0 });
      repository.findOne.mockResolvedValueOnce({
        id: 11,
        requestNo: insertData.requestNo,
        customerAccountId: 999,
        isAccepted: true,
        deprecated: false,
      });

      await expect(service.softDeleteRequest(deleteParams)).resolves.toEqual({
        kind: 'NOT_FOUND_OR_NOT_OWNER',
        id: 11,
      });
      // 钉住最小读取投影：防止后续扩大投影泄露无关字段
      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 11 },
          select: {
            id: true,
            requestNo: true,
            customerAccountId: true,
            isAccepted: true,
            deprecated: true,
          },
        }),
      );
    });

    it('本人已软删除时返回 ALREADY_DELETED（幂等成功语义由 usecase 决定）', async () => {
      repository.update.mockResolvedValueOnce({ affected: 0 });
      repository.findOne.mockResolvedValueOnce({
        id: 11,
        requestNo: insertData.requestNo,
        customerAccountId: 7,
        isAccepted: false,
        deprecated: true,
      });

      await expect(service.softDeleteRequest(deleteParams)).resolves.toEqual({
        kind: 'ALREADY_DELETED',
        id: 11,
        requestNo: insertData.requestNo,
      });
    });

    it('本人已接单时返回 ALREADY_ACCEPTED（接单/删除互斥：并发接单先命中后删除未命中）', async () => {
      repository.update.mockResolvedValueOnce({ affected: 0 });
      repository.findOne.mockResolvedValueOnce({
        id: 11,
        requestNo: insertData.requestNo,
        customerAccountId: 7,
        isAccepted: true,
        deprecated: false,
      });

      await expect(service.softDeleteRequest(deleteParams)).resolves.toEqual({
        kind: 'ALREADY_ACCEPTED',
        id: 11,
        requestNo: insertData.requestNo,
      });
      // 钉住最小读取投影与锁读（当前读）：分类不得受 RR 快照时序影响
      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 11 },
          select: {
            id: true,
            requestNo: true,
            customerAccountId: true,
            isAccepted: true,
            deprecated: true,
          },
          lock: { mode: 'pessimistic_read' },
        }),
      );
    });

    it('条件未命中但重读仍满足删除条件时防御性抛出删除失败（理论上不可达）', async () => {
      repository.update.mockResolvedValueOnce({ affected: 0 });
      repository.findOne.mockResolvedValueOnce({
        id: 11,
        requestNo: insertData.requestNo,
        customerAccountId: 7,
        isAccepted: false,
        deprecated: false,
      });

      await expect(service.softDeleteRequest(deleteParams)).rejects.toMatchObject({
        code: REPAIR_REQUEST_ERROR.DELETION_FAILED,
      });
    });

    it('落库失败包装为删除失败，details 只含 id，原始异常进 cause', async () => {
      const dbError = new Error('connection lost');
      repository.update.mockRejectedValueOnce(dbError);

      let caught: unknown;
      try {
        await service.softDeleteRequest(deleteParams);
      } catch (error) {
        caught = error;
      }

      const domainError = caught as DomainError;
      expect(domainError).toBeInstanceOf(DomainError);
      expect(domainError.code).toBe(REPAIR_REQUEST_ERROR.DELETION_FAILED);
      expect(domainError.details).toEqual({ id: 11 });
      expect(JSON.stringify(domainError.details ?? null)).not.toContain('connection lost');
      expect(domainError.cause).toBe(dbError);
    });

    it('携带事务上下文时改用事务内的 EntityManager 执行条件更新与重读', async () => {
      // 独立的仓库 mock：证明操作确实走事务上下文的 EntityManager，而非默认仓库
      const txRepository = createMockRepository();
      txRepository.update.mockResolvedValueOnce({ affected: 1 });
      txRepository.findOne.mockResolvedValueOnce({ id: 11, requestNo: insertData.requestNo });
      const transactionContext = createTypeOrmPersistenceTransactionContext({
        getRepository: () => txRepository,
      } as unknown as EntityManager);

      await service.softDeleteRequest(deleteParams, transactionContext);

      expect(txRepository.update).toHaveBeenCalledTimes(1);
      expect(txRepository.findOne).toHaveBeenCalledTimes(1);
      // 默认仓库不得被使用：事务内操作必须全部经由事务上下文
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });
});
