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

  it('非唯一约束冲突的落库失败包装为创建失败', async () => {
    const driverError = new Error('fk') as Error & { code: string };
    driverError.code = 'ER_NO_REFERENCED_ROW_2';
    repository.save.mockRejectedValue(new QueryFailedError('INSERT', [], driverError));

    await expect(service.insertRequest(insertData)).rejects.toMatchObject({
      code: REPAIR_REQUEST_ERROR.CREATION_FAILED,
    });
  });

  it('非 QueryFailedError 的异常同样包装为创建失败', async () => {
    repository.save.mockRejectedValue(new Error('connection lost'));

    await expect(service.insertRequest(insertData)).rejects.toBeInstanceOf(DomainError);
    await expect(service.insertRequest(insertData)).rejects.toMatchObject({
      code: REPAIR_REQUEST_ERROR.CREATION_FAILED,
    });
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
});
