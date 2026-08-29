/// <reference types="jest" />
import type { EquipmentModelQueryService } from '@src/modules/lithography/queries/equipment-model.query.service';
import { ListEquipmentModelsUsecase } from './list-equipment-models.usecase';

describe('ListEquipmentModelsUsecase', () => {
  it('原样返回读侧查询服务的启用设备型号列表', async () => {
    const equipmentModelQueryService = {
      listEnabledModels: jest
        .fn()
        .mockResolvedValue([{ id: 1, modelCode: 'LITHO-9000', modelName: '光刻机 9000' }]),
      findModelById: jest.fn(),
    };
    const usecase = new ListEquipmentModelsUsecase(
      equipmentModelQueryService as unknown as EquipmentModelQueryService,
    );

    await expect(usecase.execute()).resolves.toEqual([
      { id: 1, modelCode: 'LITHO-9000', modelName: '光刻机 9000' },
    ]);
    expect(equipmentModelQueryService.listEnabledModels).toHaveBeenCalledWith();
  });
});
