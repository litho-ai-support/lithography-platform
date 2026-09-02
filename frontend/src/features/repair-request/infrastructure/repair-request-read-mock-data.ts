// src/features/repair-request/infrastructure/repair-request-read-mock-data.ts

import type {
  EngineerResponse,
  RepairRequestDetail,
  RepairRequestListItem,
} from './repair-request-read.types';

/**
 * 阶段一 Mock 数据集（覆盖：未接单 / 已接单 / 已软删除 / 有回复 / 无回复），
 * 形状对齐 backend seed-mock 的语义（920_001~920_005），仅供开发与组件测试。
 *
 * 阶段三接真实后端后本文件与 mock adapter 一并下线；
 * 公共类型（repair-request-read.types.ts）保留为长期契约。
 */

const MOCK_EQUIPMENT_MODEL = {
  id: 48,
  modelCode: 'ASML-TWINSCAN-NXT-2000I',
  modelName: 'ASML TWINSCAN NXT:2000i',
};

/** 列表可见数据（Mock 数据源内部的「落库全量」，含已软删除条目） */
export const MOCK_MY_REPAIR_REQUESTS: Array<RepairRequestListItem & { deprecated: boolean }> = [
  {
    id: 920001,
    requestNo: 'MOCK-RR-2026-0001',
    errorCode: 'E-STAGE-201',
    createdAt: '2026-01-10T00:30:00.000Z',
    isAccepted: false,
    acceptedAt: null,
    latestResolutionStatus: null,
    equipmentModel: MOCK_EQUIPMENT_MODEL,
    deprecated: false,
  },
  {
    id: 920002,
    requestNo: 'MOCK-RR-2026-0002',
    errorCode: 'E-LENS-102',
    createdAt: '2026-01-11T00:30:00.000Z',
    isAccepted: true,
    acceptedAt: '2026-01-11T00:50:00.000Z',
    latestResolutionStatus: 'RESOLVED',
    equipmentModel: MOCK_EQUIPMENT_MODEL,
    deprecated: false,
  },
  {
    id: 920003,
    requestNo: 'MOCK-RR-2026-0003',
    errorCode: 'E-STAGE-315',
    createdAt: '2026-01-12T00:30:00.000Z',
    isAccepted: true,
    acceptedAt: '2026-01-12T00:50:00.000Z',
    latestResolutionStatus: 'PENDING',
    equipmentModel: MOCK_EQUIPMENT_MODEL,
    deprecated: false,
  },
  {
    id: 920004,
    requestNo: 'MOCK-RR-2026-0004',
    errorCode: 'E-SOURCE-088',
    createdAt: '2026-01-13T00:30:00.000Z',
    isAccepted: false,
    acceptedAt: null,
    latestResolutionStatus: null,
    equipmentModel: MOCK_EQUIPMENT_MODEL,
    // 已软删除：正常列表不可见，详情视为不可访问
    deprecated: true,
  },
  {
    id: 920005,
    requestNo: 'MOCK-RR-2026-0005',
    errorCode: 'E-WAFER-410',
    createdAt: '2026-01-14T00:30:00.000Z',
    isAccepted: false,
    acceptedAt: null,
    latestResolutionStatus: null,
    equipmentModel: MOCK_EQUIPMENT_MODEL,
    deprecated: false,
  },
];

/** 回复时间线（形状对齐后端富集结果：实时昵称，无账号 ID） */
export const MOCK_ENGINEER_RESPONSES: Record<number, EngineerResponse[]> = {
  920002: [
    {
      id: 960001,
      engineerNickname: '李工',
      resolutionStatus: 'PENDING',
      responseText: '已接单，正在采集干涉仪原始数据。',
      createdAt: '2026-01-11T01:00:00.000Z',
    },
    {
      id: 960002,
      engineerNickname: '李工',
      resolutionStatus: 'RESOLVED',
      responseText: '误差已校准，设备恢复正常运行。',
      createdAt: '2026-01-11T03:30:00.000Z',
    },
  ],
  920003: [
    {
      id: 960003,
      engineerNickname: '王工',
      resolutionStatus: 'PENDING',
      responseText: '已接单，正在比对高速与低速扫描的伺服误差数据。',
      createdAt: '2026-01-12T01:00:00.000Z',
    },
  ],
};

/** 详情由列表条目补充正文与回复组装（逐字段显式映射，剔除数据源内部标志 deprecated） */
export function buildMockMyRepairRequestDetail(
  listItem: RepairRequestListItem & { deprecated: boolean },
): RepairRequestDetail {
  return {
    id: listItem.id,
    requestNo: listItem.requestNo,
    errorCode: listItem.errorCode,
    createdAt: listItem.createdAt,
    isAccepted: listItem.isAccepted,
    acceptedAt: listItem.acceptedAt,
    latestResolutionStatus: listItem.latestResolutionStatus,
    equipmentModel: listItem.equipmentModel,
    faultDescription: `【${listItem.errorCode}】设备在运行中出现异常，需要工程师跟进排查。`,
    contentMd: '## 故障现象\n设备运行时报错，影响正常生产节拍。\n\n## 已尝试\n重启后现象仍复现。',
    responses: MOCK_ENGINEER_RESPONSES[listItem.id] ?? [],
  };
}
