// src/modules/lithography/queries/admin-repair-request.query.service.spec.ts

import { Between } from 'typeorm';

import { ADMIN_DOCUMENT_DATABASE_ERROR, DomainError } from '@core/common/errors/domain-error';
import { captureThrownError } from '../../../../test/support/account/admin-user.fixture';
import { EquipmentModelEntity } from '../entities/equipment-model.entity';
import { RepairRequestEntity } from '../entities/repair-request.entity';
import { AdminRepairRequestQueryService } from './admin-repair-request.query.service';

/**
 * PR3 S4：管理员维修申请读侧 QueryService 单测。
 *
 * 覆盖计划表 S4.1 的读模型语义：软删除默认过滤、真实 total、固定排序
 * （排序白名单由契约冻结，不采纳客户端排序）、时间范围边界、空集合短路、
 * 摘要的删除状态防探测口径与批量装配防 N+1。
 */
describe('AdminRepairRequestQueryService', () => {
  const pagination = { page: 1, pageSize: 10, withTotal: true };

  const makeRequestRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn().mockResolvedValue(null),
  });
  const makeResponseRepo = () => ({ find: jest.fn().mockResolvedValue([]) });
  const makeModelRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  });

  const requestEntity = (overrides: Partial<RepairRequestEntity> = {}) =>
    ({
      id: 880001,
      requestNo: 'RR-20260901-001',
      customerAccountId: 900001,
      equipmentModelId: 930001,
      errorCode: 'E-001',
      faultDescription: '描述',
      contentMd: '# 正文',
      isAccepted: false,
      acceptedAt: null,
      acceptedByEngineerAccountId: null,
      deprecated: false,
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
      updatedAt: new Date('2026-09-01T08:00:00.000Z'),
      ...overrides,
    }) as unknown as RepairRequestEntity;

  const modelEntity = (overrides: Partial<EquipmentModelEntity> = {}) =>
    ({
      id: 930001,
      modelCode: 'ASML-TWINSCAN-NXT-1980DI',
      modelName: 'NXT:1980Di',
      enabled: true,
      ...overrides,
    }) as unknown as EquipmentModelEntity;

  /** 读取 TypeORM FindOperator 私有字段（Raw 的注入参数 / In 的值集合） */
  const findOperatorField = (whereClause: unknown, key: string): unknown =>
    (whereClause as Record<string, unknown>)[key];

  it('列表默认仅未删除（deprecated = 0），固定排序与 OFFSET 分页透传', async () => {
    const requestRepo = makeRequestRepo();
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      makeResponseRepo() as never,
      makeModelRepo() as never,
    );

    await service.listAll({ filter: {}, pagination });

    expect(requestRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deprecated: false },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: 0,
        take: 10,
      }),
    );
    expect(requestRepo.count).toHaveBeenCalledWith({ where: { deprecated: false } });
  });

  it('分页翻页：page = 3, pageSize = 20 时 skip = 40', async () => {
    const requestRepo = makeRequestRepo();
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      makeResponseRepo() as never,
      makeModelRepo() as never,
    );

    await service.listAll({
      filter: {},
      pagination: { page: 3, pageSize: 20, withTotal: false },
    });

    expect(requestRepo.find).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
    expect(requestRepo.count).not.toHaveBeenCalled();
  });

  it('非法分页参数（0/负数）二级防御钳制，不产生负 skip / 零 take', async () => {
    const requestRepo = makeRequestRepo();
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      makeResponseRepo() as never,
      makeModelRepo() as never,
    );

    await service.listAll({
      filter: {},
      pagination: { page: 0, pageSize: -5, withTotal: true },
    });

    expect(requestRepo.find).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 1 }));
  });

  it('requestNo 走 Raw LIKE 且通配符转义；errorCode / isAccepted / equipmentModelId 等值透传', async () => {
    const requestRepo = makeRequestRepo();
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      makeResponseRepo() as never,
      makeModelRepo() as never,
    );

    await service.listAll({
      filter: {
        requestNo: '100%_a\\b',
        errorCode: 'E-001',
        isAccepted: false,
        equipmentModelId: 930001,
      },
      pagination,
    });

    const call = requestRepo.find.mock.calls[0][0];
    const rawParams = findOperatorField(call.where.requestNo, '_objectLiteralParameters') as {
      pattern?: string;
    };
    expect(rawParams.pattern).toBe('%100\\%\\_a\\\\b%');
    expect(call.where.errorCode).toBe('E-001');
    expect(call.where.isAccepted).toBe(false);
    expect(call.where.equipmentModelId).toBe(930001);
  });

  it('customerAccountIds 收敛为 In 集合；时间范围收敛为 Between', async () => {
    const requestRepo = makeRequestRepo();
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      makeResponseRepo() as never,
      makeModelRepo() as never,
    );
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.000Z');

    await service.listAll({
      filter: { customerAccountIds: [900001, 900002], createdAtFrom: from, createdAtTo: to },
      pagination,
    });

    const call = requestRepo.find.mock.calls[0][0];
    expect(findOperatorField(call.where.customerAccountId, '_value')).toEqual([900001, 900002]);
    expect(call.where.createdAt).toEqual(Between(from, to));
  });

  it('时间范围单端缺省收敛为开区间（下界纪元 / 上界当前时间）', async () => {
    const requestRepo = makeRequestRepo();
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      makeResponseRepo() as never,
      makeModelRepo() as never,
    );
    const from = new Date('2026-09-01T00:00:00.000Z');
    const before = new Date();

    await service.listAll({
      filter: { createdAtFrom: from },
      pagination,
    });

    const where = (requestRepo.find.mock.calls[0][0] as { where: { createdAt: unknown } }).where;
    const value = (where.createdAt as { value: Date[] }).value;
    // 下界为入参 from，上界取当前时间兜底（单端开区间）
    expect(value[0]).toEqual(from);
    expect(value[1].getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('customerAccountIds 空集合短路返回空页，不产生空 IN 查询', async () => {
    const requestRepo = makeRequestRepo();
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      makeResponseRepo() as never,
      makeModelRepo() as never,
    );

    const page = await service.listAll({
      filter: { customerAccountIds: [] },
      pagination,
    });

    expect(page).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
    expect(requestRepo.find).not.toHaveBeenCalled();
    expect(requestRepo.count).not.toHaveBeenCalled();
  });

  it('列表批量装配防 N+1：机型与最新回复各一次批量查询；机型缺失回落占位', async () => {
    const requestRepo = makeRequestRepo();
    requestRepo.find.mockResolvedValue([
      requestEntity(),
      requestEntity({ id: 880002, equipmentModelId: 930001 }),
    ]);
    const modelRepo = makeModelRepo();
    modelRepo.find.mockResolvedValue([modelEntity()]);
    const responseRepo = makeResponseRepo();
    responseRepo.find.mockResolvedValue([
      { requestId: 880001, resolutionStatus: 'PENDING' },
      { requestId: 880001, resolutionStatus: 'RESOLVED' },
    ] as unknown);
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      responseRepo as never,
      modelRepo as never,
    );

    const page = await service.listAll({ filter: {}, pagination });

    // N+1 防护断言：2 条申请只触发 1 次机型批量与 1 次回复批量
    expect(modelRepo.find).toHaveBeenCalledTimes(1);
    expect(responseRepo.find).toHaveBeenCalledTimes(1);
    const inValue = findOperatorField(
      (modelRepo.find.mock.calls[0][0] as { where: { id: unknown } }).where.id,
      '_value',
    );
    expect(inValue).toEqual([930001]);
    // 最新回复状态取排序末条（DESC 排序后的第一条）
    expect(page.items[0].latestResolutionStatus).toBe('PENDING');
    expect(page.items[1].latestResolutionStatus).toBeNull();
  });

  it('摘要：不存在与已软删统一 NOT_FOUND（防删除状态探测），不发起装配查询', async () => {
    const requestRepo = makeRequestRepo();
    const modelRepo = makeModelRepo();
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      makeResponseRepo() as never,
      modelRepo as never,
    );

    const notFound = await captureThrownError(service.findSummaryById(880001));
    expect(notFound).toBeInstanceOf(DomainError);
    expect((notFound as DomainError).code).toBe(ADMIN_DOCUMENT_DATABASE_ERROR.NOT_FOUND);

    requestRepo.findOne.mockResolvedValue(requestEntity({ deprecated: true }));
    const deleted = await captureThrownError(service.findSummaryById(880001));
    expect((deleted as DomainError).code).toBe(ADMIN_DOCUMENT_DATABASE_ERROR.NOT_FOUND);
    expect(modelRepo.findOne).not.toHaveBeenCalled();
  });

  it('摘要返回申请全貌（含正文与故障描述）与最新处理状态', async () => {
    const requestRepo = makeRequestRepo();
    requestRepo.findOne.mockResolvedValue(requestEntity());
    const modelRepo = makeModelRepo();
    modelRepo.findOne.mockResolvedValue(modelEntity());
    const responseRepo = makeResponseRepo();
    responseRepo.find.mockResolvedValue([
      { requestId: 880001, resolutionStatus: 'RESOLVED' },
    ] as unknown);
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      responseRepo as never,
      modelRepo as never,
    );

    const summary = await service.findSummaryById(880001);

    expect(summary).toMatchObject({
      id: 880001,
      requestNo: 'RR-20260901-001',
      customerAccountId: 900001,
      errorCode: 'E-001',
      faultDescription: '描述',
      contentMd: '# 正文',
      latestResolutionStatus: 'RESOLVED',
    });
    expect(summary.equipmentModel.modelCode).toBe('ASML-TWINSCAN-NXT-1980DI');
  });

  it('统计口径与默认列表过滤一致：仅统计未删除申请', async () => {
    const requestRepo = makeRequestRepo();
    requestRepo.count.mockResolvedValue(7);
    const service = new AdminRepairRequestQueryService(
      requestRepo as never,
      makeResponseRepo() as never,
      makeModelRepo() as never,
    );

    await expect(service.countAll()).resolves.toBe(7);
    expect(requestRepo.count).toHaveBeenCalledWith({ where: { deprecated: false } });
  });
});
