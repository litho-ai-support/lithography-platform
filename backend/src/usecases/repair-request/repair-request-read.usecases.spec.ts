/// <reference types="jest" />
import { REPAIR_REQUEST_ERROR } from '@core/common/errors/domain-error';
import type { RepairRequestQueryService } from '@src/modules/lithography/queries/repair-request.query.service';
import { GetRepairRequestDetailUsecase } from './get-repair-request-detail.usecase';
import { ListEngineerRepairRequestsUsecase } from './list-engineer-repair-requests.usecase';
import { ListMyRepairRequestsUsecase } from './list-my-repair-requests.usecase';

const makeQueryService = () => ({
  listByCustomer: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 10 }),
  listByEngineer: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 10 }),
  findDetail: jest.fn().mockResolvedValue({ id: 1 }),
});

const session = { accountId: 10, roles: ['CUSTOMER'] };

describe('ListMyRepairRequestsUsecase', () => {
  it('OFFSET 分页透传至读侧查询服务，withTotal 缺省为 false', async () => {
    const queryService = makeQueryService();
    const usecase = new ListMyRepairRequestsUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await usecase.execute({
      session,
      pagination: { mode: 'OFFSET', page: 2, pageSize: 5 },
    });

    expect(queryService.listByCustomer).toHaveBeenCalledWith({
      customerAccountId: 10,
      pagination: { page: 2, pageSize: 5, withTotal: false },
    });
  });

  it('CURSOR 分页第一版拒绝（参数错误码）', async () => {
    const queryService = makeQueryService();
    const usecase = new ListMyRepairRequestsUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await expect(
      usecase.execute({
        session,
        pagination: { mode: 'CURSOR', limit: 5 },
      }),
    ).rejects.toMatchObject({
      code: REPAIR_REQUEST_ERROR.INVALID_PARAMS,
      details: { mode: 'CURSOR' },
    });
    expect(queryService.listByCustomer).not.toHaveBeenCalled();
  });

  it('pageSize 超上限时在用例层钳制为 100（传输无关策略，不依赖 GraphQL 边界校验）', async () => {
    const queryService = makeQueryService();
    const usecase = new ListMyRepairRequestsUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await usecase.execute({
      session,
      pagination: { mode: 'OFFSET', page: 1, pageSize: 500 },
    });

    expect(queryService.listByCustomer).toHaveBeenCalledWith({
      customerAccountId: 10,
      pagination: { page: 1, pageSize: 100, withTotal: false },
    });
  });
});

describe('ListEngineerRepairRequestsUsecase', () => {
  const engineerSession = { accountId: 20, roles: ['ENGINEER'] };

  it('合法视图（AWAITING / MINE）透传至读侧查询服务', async () => {
    const queryService = makeQueryService();
    const usecase = new ListEngineerRepairRequestsUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await usecase.execute({
      session: engineerSession,
      view: 'MINE',
      pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true },
    });

    expect(queryService.listByEngineer).toHaveBeenCalledWith({
      engineerAccountId: 20,
      view: 'MINE',
      pagination: { page: 1, pageSize: 10, withTotal: true },
    });
  });

  it('非法视图字符串拒绝（adapter 层不导入枚举，由用例校验映射）', async () => {
    const queryService = makeQueryService();
    const usecase = new ListEngineerRepairRequestsUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await expect(
      usecase.execute({
        session: engineerSession,
        view: 'ALL',
        pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
      }),
    ).rejects.toMatchObject({
      code: REPAIR_REQUEST_ERROR.INVALID_PARAMS,
      details: { view: 'ALL' },
    });
    expect(queryService.listByEngineer).not.toHaveBeenCalled();
  });

  it('CURSOR 分页第一版拒绝', async () => {
    const queryService = makeQueryService();
    const usecase = new ListEngineerRepairRequestsUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await expect(
      usecase.execute({
        session: engineerSession,
        view: 'AWAITING',
        pagination: { mode: 'CURSOR', limit: 5 },
      }),
    ).rejects.toMatchObject({ code: REPAIR_REQUEST_ERROR.INVALID_PARAMS });
  });

  it('pageSize 超上限时在用例层钳制为 100', async () => {
    const queryService = makeQueryService();
    const usecase = new ListEngineerRepairRequestsUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await usecase.execute({
      session: engineerSession,
      view: 'AWAITING',
      pagination: { mode: 'OFFSET', page: 1, pageSize: 999 },
    });

    expect(queryService.listByEngineer).toHaveBeenCalledWith({
      engineerAccountId: 20,
      view: 'AWAITING',
      pagination: { page: 1, pageSize: 100, withTotal: false },
    });
  });
});

describe('GetRepairRequestDetailUsecase', () => {
  it('原样透传申请 ID 与会话至读侧查询服务（读权限在 QueryService 内判定）', async () => {
    const queryService = makeQueryService();
    const usecase = new GetRepairRequestDetailUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await usecase.execute({ requestId: 3, session });

    expect(queryService.findDetail).toHaveBeenCalledWith({ requestId: 3, session });
  });
});
