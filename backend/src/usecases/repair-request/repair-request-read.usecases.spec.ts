/// <reference types="jest" />
import { REPAIR_REQUEST_ERROR } from '@core/common/errors/domain-error';
import type { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import type { RepairRequestQueryService } from '@src/modules/lithography/queries/repair-request.query.service';
import { GetEngineerRepairRequestDetailUsecase } from './get-engineer-repair-request-detail.usecase';
import { GetMyRepairRequestDetailUsecase } from './get-my-repair-request-detail.usecase';
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

  it('合法范围（AVAILABLE / MINE）透传至读侧查询服务', async () => {
    const queryService = makeQueryService();
    const usecase = new ListEngineerRepairRequestsUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await usecase.execute({
      session: engineerSession,
      scope: 'MINE',
      pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true },
    });

    expect(queryService.listByEngineer).toHaveBeenCalledWith({
      engineerAccountId: 20,
      scope: 'MINE',
      pagination: { page: 1, pageSize: 10, withTotal: true },
    });
  });

  it('非法范围字符串拒绝（adapter 层不导入枚举，由用例校验映射）', async () => {
    const queryService = makeQueryService();
    const usecase = new ListEngineerRepairRequestsUsecase(
      queryService as unknown as RepairRequestQueryService,
    );

    await expect(
      usecase.execute({
        session: engineerSession,
        scope: 'ALL',
        pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
      }),
    ).rejects.toMatchObject({
      code: REPAIR_REQUEST_ERROR.INVALID_PARAMS,
      details: { scope: 'ALL' },
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
        scope: 'AVAILABLE',
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
      scope: 'AVAILABLE',
      pagination: { mode: 'OFFSET', page: 1, pageSize: 999 },
    });

    expect(queryService.listByEngineer).toHaveBeenCalledWith({
      engineerAccountId: 20,
      scope: 'AVAILABLE',
      pagination: { page: 1, pageSize: 100, withTotal: false },
    });
  });
});

describe('详情用例（客户 / 工程师入口）', () => {
  const detailQueryResult = {
    id: 3,
    requestNo: '920_003',
    equipmentModel: { id: 5, modelCode: 'M', modelName: 'N' },
    errorCode: 'E-01',
    faultDescription: '故障',
    contentMd: '# md',
    createdAt: new Date(),
    isAccepted: true,
    acceptedAt: new Date(),
    latestResolutionStatus: 'RESOLVED',
    responses: [
      {
        id: 7,
        engineerAccountId: 20,
        resolutionStatus: 'PENDING',
        responseText: '已收到',
        createdAt: new Date(),
      },
    ],
  };

  const makeDetailQueryService = () => ({
    findDetail: jest.fn().mockResolvedValue(detailQueryResult),
  });

  const makeAccountQueryService = (nicknames: Map<number, string>) => ({
    findNicknamesByAccountIds: jest.fn().mockResolvedValue(nicknames),
  });

  it('客户入口以 scope=CUSTOMER 读取，并把工程师账号 ID 富集为当前昵称', async () => {
    const queryService = makeDetailQueryService();
    const accountQueryService = makeAccountQueryService(new Map([[20, '陈工']]));
    const usecase = new GetMyRepairRequestDetailUsecase(
      queryService as unknown as RepairRequestQueryService,
      accountQueryService as unknown as AccountQueryService,
    );

    const result = await usecase.execute({ requestId: 3, session });

    expect(queryService.findDetail).toHaveBeenCalledWith({
      requestId: 3,
      session,
      scope: 'CUSTOMER',
    });
    expect(accountQueryService.findNicknamesByAccountIds).toHaveBeenCalledWith([20]);
    expect(result.responses[0]).toMatchObject({ id: 7, engineerNickname: '陈工' });
    // 契约防泄漏：对外视图不含工程师账号 ID（负责人裁定 3）
    expect(result.responses[0]).not.toHaveProperty('engineerAccountId');
  });

  it('工程师入口以 scope=ENGINEER 读取', async () => {
    const queryService = makeDetailQueryService();
    const accountQueryService = makeAccountQueryService(new Map([[20, '陈工']]));
    const usecase = new GetEngineerRepairRequestDetailUsecase(
      queryService as unknown as RepairRequestQueryService,
      accountQueryService as unknown as AccountQueryService,
    );

    await usecase.execute({ requestId: 3, session: { accountId: 20, roles: ['ENGINEER'] } });

    expect(queryService.findDetail).toHaveBeenCalledWith({
      requestId: 3,
      session: { accountId: 20, roles: ['ENGINEER'] },
      scope: 'ENGINEER',
    });
  });

  it('昵称缺失时回落「工程师」（负责人裁定 3）', async () => {
    const queryService = makeDetailQueryService();
    const accountQueryService = makeAccountQueryService(new Map());
    const usecase = new GetMyRepairRequestDetailUsecase(
      queryService as unknown as RepairRequestQueryService,
      accountQueryService as unknown as AccountQueryService,
    );

    const result = await usecase.execute({ requestId: 3, session });

    expect(result.responses[0].engineerNickname).toBe('工程师');
  });

  it('无回复时不调用昵称查询，回复为空数组', async () => {
    const queryService = {
      findDetail: jest.fn().mockResolvedValue({ ...detailQueryResult, responses: [] }),
    };
    const accountQueryService = makeAccountQueryService(new Map());
    const usecase = new GetMyRepairRequestDetailUsecase(
      queryService as unknown as RepairRequestQueryService,
      accountQueryService as unknown as AccountQueryService,
    );

    const result = await usecase.execute({ requestId: 3, session });

    expect(result.responses).toEqual([]);
    expect(accountQueryService.findNicknamesByAccountIds).toHaveBeenCalledWith([]);
  });
});
