/// <reference types="jest" />
import { PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { EngineerResolutionStatus } from '@app-types/models/repair-request.types';
import { In, type Repository } from 'typeorm';
import { EngineerResponseEntity } from '../entities/engineer-response.entity';
import { EquipmentModelEntity } from '../entities/equipment-model.entity';
import { RepairRequestEntity } from '../entities/repair-request.entity';
import { RepairRequestQueryService } from './repair-request.query.service';

type PartialRequest = Partial<RepairRequestEntity>;

const makeRequest = (overrides: PartialRequest = {}): RepairRequestEntity => ({
  id: 1,
  requestNo: '920_001',
  customerAccountId: 10,
  equipmentModelId: 5,
  errorCode: 'E-01',
  faultDescription: '无法曝光',
  contentMd: '# 维修申请',
  createdAt: new Date('2026-08-30T00:00:00.000Z'),
  isAccepted: false,
  acceptedByEngineerAccountId: null,
  acceptedAt: null,
  deprecated: false,
  deletedAt: null,
  ...overrides,
});

const makeResponse = (overrides: Partial<EngineerResponseEntity> = {}): EngineerResponseEntity => ({
  id: 1,
  requestId: 1,
  engineerAccountId: 20,
  customerAccountId: 10,
  resolutionStatus: EngineerResolutionStatus.PENDING,
  responseText: '已收到',
  createdAt: new Date('2026-08-30T01:00:00.000Z'),
  ...overrides,
});

const makeModel = (overrides: Partial<EquipmentModelEntity> = {}): EquipmentModelEntity =>
  ({
    id: 5,
    modelCode: 'LITHO-9000',
    modelName: '光刻机 9000',
    enabled: true,
    sortOrder: 1,
    ...overrides,
  }) as EquipmentModelEntity;

const customerSession = { accountId: 10, roles: ['CUSTOMER'] };
const engineerSession = { accountId: 20, roles: ['ENGINEER'] };
const superAdminSession = { accountId: 99, roles: ['SUPER_ADMIN'] };

describe('RepairRequestQueryService', () => {
  let requestRepository: ReturnType<typeof createMockRepository>;
  let responseRepository: ReturnType<typeof createMockRepository>;
  let equipmentModelRepository: ReturnType<typeof createMockRepository>;
  let service: RepairRequestQueryService;

  beforeEach(() => {
    requestRepository = createMockRepository();
    responseRepository = createMockRepository();
    equipmentModelRepository = createMockRepository();
    service = new RepairRequestQueryService(
      requestRepository as unknown as Repository<RepairRequestEntity>,
      responseRepository as unknown as Repository<EngineerResponseEntity>,
      equipmentModelRepository as unknown as Repository<EquipmentModelEntity>,
    );
    // 列表装配默认空集合，单测内按需覆盖
    equipmentModelRepository.find.mockResolvedValue([]);
    responseRepository.find.mockResolvedValue([]);
  });

  describe('listByCustomer', () => {
    it('仅查询本人且未删除的申请，排序固定 createdAt DESC + id DESC', async () => {
      requestRepository.find.mockResolvedValue([]);

      await service.listByCustomer({
        customerAccountId: 10,
        pagination: { page: 2, pageSize: 5, withTotal: false },
      });

      expect(requestRepository.find).toHaveBeenCalledWith({
        where: { customerAccountId: 10, deprecated: false },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: 5,
        take: 5,
      });
      expect(requestRepository.count).not.toHaveBeenCalled();
    });

    it('withTotal=true 时附带 count 并回填 total', async () => {
      requestRepository.find.mockResolvedValue([makeRequest()]);
      requestRepository.count.mockResolvedValue(3);
      equipmentModelRepository.find.mockResolvedValue([makeModel()]);

      const result = await service.listByCustomer({
        customerAccountId: 10,
        pagination: { page: 1, pageSize: 10, withTotal: true },
      });

      expect(requestRepository.count).toHaveBeenCalledWith({
        where: { customerAccountId: 10, deprecated: false },
      });
      expect(result.total).toBe(3);
    });

    it('页码越界向下钳制为第一页（分页边界）', async () => {
      requestRepository.find.mockResolvedValue([]);

      const result = await service.listByCustomer({
        customerAccountId: 10,
        pagination: { page: 0, pageSize: -3, withTotal: false },
      });

      expect(requestRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 1 }),
      );
      expect(result).toMatchObject({ page: 1, pageSize: 1, items: [] });
    });

    it('列表项批量装配机型与最新处理状态（多回复取倒序首条）', async () => {
      requestRepository.find.mockResolvedValue([
        makeRequest({ id: 1 }),
        makeRequest({ id: 2, requestNo: '920_002' }),
      ]);
      equipmentModelRepository.find.mockResolvedValue([makeModel({ id: 5 })]);
      // 倒序返回：申请 1 的最新回复是 RESOLVED（id=9 在前），申请 2 无回复
      responseRepository.find.mockResolvedValue([
        makeResponse({ id: 9, requestId: 1, resolutionStatus: EngineerResolutionStatus.RESOLVED }),
        makeResponse({ id: 8, requestId: 1, resolutionStatus: EngineerResolutionStatus.PENDING }),
      ]);

      const result = await service.listByCustomer({
        customerAccountId: 10,
        pagination: { page: 1, pageSize: 10, withTotal: false },
      });

      expect(equipmentModelRepository.find).toHaveBeenCalledWith({ where: { id: In([5]) } });
      expect(responseRepository.find).toHaveBeenCalledWith({
        where: { requestId: In([1, 2]) },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        id: 1,
        equipmentModel: { id: 5, modelCode: 'LITHO-9000', modelName: '光刻机 9000' },
        latestResolutionStatus: EngineerResolutionStatus.RESOLVED,
      });
      expect(result.items[1]).toMatchObject({ id: 2, latestResolutionStatus: null });
      // 不返回归属类账号 ID
      expect(result.items[0]).not.toHaveProperty('customerAccountId');
      expect(result.items[0]).not.toHaveProperty('acceptedByEngineerAccountId');
    });
  });

  describe('listByEngineer', () => {
    it('AVAILABLE 范围仅查询未删除且未接单的申请', async () => {
      requestRepository.find.mockResolvedValue([]);

      await service.listByEngineer({
        engineerAccountId: 20,
        scope: 'AVAILABLE',
        pagination: { page: 1, pageSize: 10, withTotal: false },
      });

      expect(requestRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deprecated: false, isAccepted: false } }),
      );
    });

    it('MINE 范围仅查询本人已接单的申请', async () => {
      requestRepository.find.mockResolvedValue([]);

      await service.listByEngineer({
        engineerAccountId: 20,
        scope: 'MINE',
        pagination: { page: 1, pageSize: 10, withTotal: false },
      });

      expect(requestRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { acceptedByEngineerAccountId: 20 } }),
      );
    });
  });

  describe('findDetail 读权限矩阵', () => {
    it('申请不存在时统一拒绝（防探测）', async () => {
      requestRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findDetail({ requestId: 99, session: customerSession, scope: 'CUSTOMER' }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.ACCESS_DENIED });
    });

    it('CUSTOMER 本人申请可读（客户入口）', async () => {
      requestRepository.findOne.mockResolvedValue(makeRequest());
      equipmentModelRepository.findOne.mockResolvedValue(makeModel());
      responseRepository.find.mockResolvedValue([]);

      const result = await service.findDetail({
        requestId: 1,
        session: customerSession,
        scope: 'CUSTOMER',
      });

      expect(result).toMatchObject({
        id: 1,
        requestNo: '920_001',
        equipmentModel: { id: 5, modelCode: 'LITHO-9000', modelName: '光刻机 9000' },
        latestResolutionStatus: null,
        responses: [],
      });
      expect(result).not.toHaveProperty('customerAccountId');
    });

    it('CUSTOMER 他人申请拒绝', async () => {
      requestRepository.findOne.mockResolvedValue(makeRequest({ customerAccountId: 11 }));

      await expect(
        service.findDetail({ requestId: 1, session: customerSession, scope: 'CUSTOMER' }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.ACCESS_DENIED });
    });

    it('CUSTOMER 本人已删除申请拒绝', async () => {
      requestRepository.findOne.mockResolvedValue(
        makeRequest({ deprecated: true, deletedAt: new Date() }),
      );

      await expect(
        service.findDetail({ requestId: 1, session: customerSession, scope: 'CUSTOMER' }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.ACCESS_DENIED });
    });

    it('纯 CUSTOMER 走工程师入口拒绝（入口 scope 隔离有效身份）', async () => {
      requestRepository.findOne.mockResolvedValue(makeRequest());

      await expect(
        service.findDetail({ requestId: 1, session: customerSession, scope: 'ENGINEER' }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.ACCESS_DENIED });
    });

    it('ENGINEER 未接单且未删除的申请可读（待接单池）', async () => {
      requestRepository.findOne.mockResolvedValue(makeRequest());
      equipmentModelRepository.findOne.mockResolvedValue(makeModel());
      responseRepository.find.mockResolvedValue([]);

      await expect(
        service.findDetail({ requestId: 1, session: engineerSession, scope: 'ENGINEER' }),
      ).resolves.toMatchObject({ id: 1 });
    });

    it('ENGINEER 未接单但已删除的申请拒绝', async () => {
      requestRepository.findOne.mockResolvedValue(
        makeRequest({ deprecated: true, deletedAt: new Date() }),
      );

      await expect(
        service.findDetail({ requestId: 1, session: engineerSession, scope: 'ENGINEER' }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.ACCESS_DENIED });
    });

    it('ENGINEER 本人已接单的申请可读', async () => {
      requestRepository.findOne.mockResolvedValue(
        makeRequest({
          isAccepted: true,
          acceptedByEngineerAccountId: 20,
          acceptedAt: new Date('2026-08-30T02:00:00.000Z'),
        }),
      );
      equipmentModelRepository.findOne.mockResolvedValue(makeModel());
      responseRepository.find.mockResolvedValue([]);

      await expect(
        service.findDetail({ requestId: 1, session: engineerSession, scope: 'ENGINEER' }),
      ).resolves.toMatchObject({ isAccepted: true, acceptedAt: expect.any(Date) });
    });

    it('ENGINEER 本人已接单的申请即使标记删除仍可读（对接方案权限矩阵：已接单分支不受软删除约束；写契约保证已接单不可删除，此例防口径漂移）', async () => {
      requestRepository.findOne.mockResolvedValue(
        makeRequest({
          isAccepted: true,
          acceptedByEngineerAccountId: 20,
          deprecated: true,
          deletedAt: new Date(),
        }),
      );
      equipmentModelRepository.findOne.mockResolvedValue(makeModel());
      responseRepository.find.mockResolvedValue([]);

      await expect(
        service.findDetail({ requestId: 1, session: engineerSession, scope: 'ENGINEER' }),
      ).resolves.toMatchObject({ id: 1, isAccepted: true });
    });

    it('ENGINEER 他人已接单的申请拒绝', async () => {
      requestRepository.findOne.mockResolvedValue(
        makeRequest({ isAccepted: true, acceptedByEngineerAccountId: 21 }),
      );

      await expect(
        service.findDetail({ requestId: 1, session: engineerSession, scope: 'ENGINEER' }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.ACCESS_DENIED });
    });

    it('SUPER_ADMIN 按角色继承可读未接单申请（负责人裁定 2：工程师入口）', async () => {
      requestRepository.findOne.mockResolvedValue(makeRequest());
      equipmentModelRepository.findOne.mockResolvedValue(makeModel());
      responseRepository.find.mockResolvedValue([]);

      await expect(
        service.findDetail({ requestId: 1, session: superAdminSession, scope: 'ENGINEER' }),
      ).resolves.toMatchObject({ id: 1 });
    });

    it('SUPER_ADMIN 继承工程师身份仍不可读他人已接单申请', async () => {
      requestRepository.findOne.mockResolvedValue(
        makeRequest({ isAccepted: true, acceptedByEngineerAccountId: 21 }),
      );

      await expect(
        service.findDetail({ requestId: 1, session: superAdminSession, scope: 'ENGINEER' }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.ACCESS_DENIED });
    });

    it('SUPER_ADMIN 客户入口仅见本人名下申请（超管无客户申请时不可见他人申请）', async () => {
      requestRepository.findOne.mockResolvedValue(makeRequest({ customerAccountId: 10 }));

      await expect(
        service.findDetail({ requestId: 1, session: superAdminSession, scope: 'CUSTOMER' }),
      ).rejects.toMatchObject({ code: PERMISSION_ERROR.ACCESS_DENIED });
    });
  });

  describe('findDetail 回复时间线与末条状态口径', () => {
    it('回复按 createdAt ASC + id ASC 读取，最新状态取末条', async () => {
      requestRepository.findOne.mockResolvedValue(
        makeRequest({ isAccepted: true, acceptedByEngineerAccountId: 20 }),
      );
      equipmentModelRepository.findOne.mockResolvedValue(makeModel());
      responseRepository.find.mockResolvedValue([
        makeResponse({ id: 8, resolutionStatus: EngineerResolutionStatus.PENDING }),
        makeResponse({
          id: 9,
          resolutionStatus: EngineerResolutionStatus.RESOLVED,
          createdAt: new Date('2026-08-30T02:00:00.000Z'),
        }),
      ]);

      const result = await service.findDetail({
        requestId: 1,
        session: engineerSession,
        scope: 'ENGINEER',
      });

      expect(responseRepository.find).toHaveBeenCalledWith({
        where: { requestId: 1 },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      expect(result.latestResolutionStatus).toBe(EngineerResolutionStatus.RESOLVED);
      expect(result.responses).toHaveLength(2);
      expect(result.responses[0].id).toBe(8);
      expect(result.responses[1].id).toBe(9);
    });

    it('无回复时最新状态为 null 且回复为空数组', async () => {
      requestRepository.findOne.mockResolvedValue(makeRequest());
      equipmentModelRepository.findOne.mockResolvedValue(makeModel());
      responseRepository.find.mockResolvedValue([]);

      const result = await service.findDetail({
        requestId: 1,
        session: customerSession,
        scope: 'CUSTOMER',
      });

      expect(result.latestResolutionStatus).toBeNull();
      expect(result.responses).toEqual([]);
    });
  });
});
