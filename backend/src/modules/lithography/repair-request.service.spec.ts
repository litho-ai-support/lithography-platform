/// <reference types="jest" />
import { DomainError, REPAIR_REQUEST_ERROR } from '@src/core/common/errors/domain-error';
import { createTypeOrmPersistenceTransactionContext } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { RepairRequestEntity } from './entities/repair-request.entity';
import { RepairRequestAcceptData, RepairRequestInsertData } from './lithography.types';
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

  describe('acceptRequest', () => {
    const acceptedAt = new Date('2026-09-02T08:30:00.000Z');
    const acceptData: RepairRequestAcceptData = {
      requestId: 21,
      engineerAccountId: 5,
      acceptedAt,
    };

    it('条件更新命中主键 + 未删除 + 未接单，并在同一语句一次性写入三个接单字段', async () => {
      repository.update.mockResolvedValue({ affected: 1 });

      await expect(service.acceptRequest(acceptData)).resolves.toEqual({ affected: 1 });

      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(repository.update).toHaveBeenCalledWith(
        { id: acceptData.requestId, deprecated: false, isAccepted: false },
        {
          isAccepted: true,
          acceptedByEngineerAccountId: acceptData.engineerAccountId,
          acceptedAt,
        },
      );
    });

    it('affected 缺失时安全归一为 0，未命中时原样返回 0 交由 usecase 裁决', async () => {
      repository.update.mockResolvedValueOnce({ affected: undefined });
      await expect(service.acceptRequest(acceptData)).resolves.toEqual({ affected: 0 });

      repository.update.mockResolvedValueOnce({ affected: 0 });
      await expect(service.acceptRequest(acceptData)).resolves.toEqual({ affected: 0 });
    });

    it('携带事务上下文时改用事务内 Repository 执行条件更新', async () => {
      const transactionRepository = createMockRepository();
      transactionRepository.update.mockResolvedValue({ affected: 1 });
      const transactionContext = createTypeOrmPersistenceTransactionContext({
        getRepository: () => transactionRepository,
      } as unknown as EntityManager);

      await expect(service.acceptRequest(acceptData, transactionContext)).resolves.toEqual({
        affected: 1,
      });

      expect(transactionRepository.update).toHaveBeenCalledTimes(1);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('数据库异常包装为接单失败，details 不泄漏 SQL / 表名 / 约束名 / 底层错误', async () => {
      // 真实驱动错误可能携带 SQL 语句、表名与错误码
      const sensitiveSql = 'UPDATE `repair_request` SET `is_accepted` = ? WHERE `id` = ?';
      const driverError = new Error(
        'Lock wait timeout exceeded; try restarting transaction',
      ) as Error & {
        code: string;
      };
      driverError.code = 'ER_LOCK_WAIT_TIMEOUT';
      const queryFailedError = new QueryFailedError(sensitiveSql, [], driverError);
      repository.update.mockRejectedValue(queryFailedError);

      let caught: unknown;
      try {
        await service.acceptRequest(acceptData);
      } catch (error) {
        caught = error;
      }

      const domainError = caught as DomainError;
      expect(domainError).toBeInstanceOf(DomainError);
      expect(domainError.code).toBe(REPAIR_REQUEST_ERROR.ACCEPT_FAILED);
      expect(domainError.details).toEqual({ requestId: acceptData.requestId });
      // details 会被全局 GraphQL Filter 原样写入响应，不得含任何数据库细节
      const serialized = JSON.stringify(domainError.details ?? null);
      expect(serialized).not.toContain('repair_request');
      expect(serialized).not.toContain('ER_LOCK_WAIT_TIMEOUT');
      expect(serialized).not.toContain('Lock wait timeout');
      expect(serialized).not.toContain('UPDATE');
      // 底层异常仅以 cause 保留，供服务端日志与排查使用
      expect(domainError.cause).toBe(queryFailedError);
    });
  });

  describe('findAcceptanceStatus', () => {
    it('只读取裁决所需的最小字段集合', async () => {
      repository.findOne.mockResolvedValue(null);

      await service.findAcceptanceStatus(31);

      expect(repository.findOne).toHaveBeenCalledTimes(1);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 31 },
        select: { id: true, isAccepted: true, deprecated: true },
      });
    });

    it('存在时返回最小快照，不携带归属账号 ID 等未选取字段', async () => {
      // 构造 select 之外字段意外出现在实体上的情况：快照必须收窄为三字段
      repository.findOne.mockResolvedValue({
        id: 31,
        isAccepted: true,
        deprecated: false,
        requestNo: 'RR20260902100000ABC123',
        customerAccountId: 7,
        acceptedByEngineerAccountId: 5,
      });

      await expect(service.findAcceptanceStatus(31)).resolves.toEqual({
        id: 31,
        isAccepted: true,
        deprecated: false,
      });
    });

    it('不存在时返回 null', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findAcceptanceStatus(32)).resolves.toBeNull();
    });

    it('携带事务上下文时在同一事务内读取（与条件更新同事务）', async () => {
      const transactionRepository = createMockRepository();
      transactionRepository.findOne.mockResolvedValue({
        id: 33,
        isAccepted: false,
        deprecated: false,
      });
      const transactionContext = createTypeOrmPersistenceTransactionContext({
        getRepository: () => transactionRepository,
      } as unknown as EntityManager);

      await expect(service.findAcceptanceStatus(33, transactionContext)).resolves.toEqual({
        id: 33,
        isAccepted: false,
        deprecated: false,
      });

      expect(transactionRepository.findOne).toHaveBeenCalledTimes(1);
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('数据库异常安全映射为接单失败，不泄漏数据库细节', async () => {
      const driverError = new Error(
        "Unknown column 'deprecated' in 'field list' (SELECT FROM `repair_request`)",
      ) as Error & { code: string };
      driverError.code = 'ER_BAD_FIELD_ERROR';
      const queryFailedError = new QueryFailedError(
        'SELECT `id`, `is_accepted`, `deprecated` FROM `repair_request`',
        [],
        driverError,
      );
      repository.findOne.mockRejectedValue(queryFailedError);

      let caught: unknown;
      try {
        await service.findAcceptanceStatus(34);
      } catch (error) {
        caught = error;
      }

      const domainError = caught as DomainError;
      expect(domainError).toBeInstanceOf(DomainError);
      expect(domainError.code).toBe(REPAIR_REQUEST_ERROR.ACCEPT_FAILED);
      expect(domainError.details).toEqual({ requestId: 34 });
      const serialized = JSON.stringify(domainError.details ?? null);
      expect(serialized).not.toContain('repair_request');
      expect(serialized).not.toContain('ER_BAD_FIELD_ERROR');
      expect(domainError.cause).toBe(queryFailedError);
    });
  });
});
