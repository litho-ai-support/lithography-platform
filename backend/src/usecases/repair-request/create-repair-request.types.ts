// src/usecases/repair-request/create-repair-request.types.ts

import type { RepairRequestSnapshot } from '@src/modules/lithography/lithography.types';

/**
 * 创建维修申请所需身份快照（由 adapter 从 JWT 载荷提取，客户端不可传）
 */
export type CreateRepairRequestSession = {
  accountId: number;
  accessGroup: readonly string[];
};

/**
 * 创建维修申请命令
 * 字段为 adapter 结构校验后的原始输入，空白语义与长度语义由 usecase 判定
 */
export type CreateRepairRequestCommand = {
  session: CreateRepairRequestSession;
  equipmentModelId: number;
  errorCode: string;
  faultDescription: string;
};

/**
 * 创建维修申请结果
 */
export type CreateRepairRequestResult = RepairRequestSnapshot;
