/// <reference types="jest" />
import type { EntityManager, Repository } from 'typeorm';
import { createTypeOrmPersistenceTransactionContext } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { EquipmentModelEntity } from './entities/equipment-model.entity';
import { EquipmentModelQueryService } from './queries/equipment-model.query.service';

describe('EquipmentModelQueryService', () => {
  let repository: ReturnType<typeof createMockRepository>;
  let service: EquipmentModelQueryService;

  beforeEach(() => {
    repository = createMockRepository();
    service = new EquipmentModelQueryService(
      repository as unknown as Repository<EquipmentModelEntity>,
    );
  });

  it('listEnabledModels 只读取启用型号并映射为视图', async () => {
    repository.find.mockResolvedValue([
      { id: 1, modelCode: 'LITHO-9000', modelName: '光刻机 9000', enabled: true, sortOrder: 1 },
    ]);

    const result = await service.listEnabledModels();

    expect(repository.find).toHaveBeenCalledWith({
      where: { enabled: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    expect(result).toEqual([{ id: 1, modelCode: 'LITHO-9000', modelName: '光刻机 9000' }]);
  });

  it('findModelById 不存在时返回 null', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findModelById({ id: 9 })).resolves.toBeNull();
  });

  it('findModelById 返回含启用状态的详情快照（无事务时不加锁）', async () => {
    repository.findOne.mockResolvedValue({
      id: 2,
      modelCode: 'LITHO-8000',
      modelName: '光刻机 8000',
      enabled: false,
    });

    await expect(service.findModelById({ id: 2 })).resolves.toEqual({
      id: 2,
      modelCode: 'LITHO-8000',
      modelName: '光刻机 8000',
      enabled: false,
    });
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  it('findModelById 携带事务上下文时排他锁定读（防并发停用）', async () => {
    const transactionContext = createTypeOrmPersistenceTransactionContext({
      getRepository: () => repository,
    } as unknown as EntityManager);
    repository.findOne.mockResolvedValue(null);

    await service.findModelById({ id: 2, transactionContext });

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 2 },
      lock: { mode: 'pessimistic_write' },
    });
  });
});
