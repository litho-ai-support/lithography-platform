// src/usecases/repair-request/delete-my-repair-request.types.ts

import type { UsecaseSession } from '@app-types/auth/session.types';

/**
 * 删除维修申请命令
 * 账号仅取自会话（JWT），客户端不可传入；requestId 为 adapter 结构校验后的输入
 */
export type DeleteMyRepairRequestCommand = {
  session: UsecaseSession;
  requestId: number;
};

/**
 * 删除维修申请成功结果（成功与幂等成功同形状；仅含申请标识，不含账号 ID）
 */
export type DeleteMyRepairRequestResult = {
  id: number;
  requestNo: string;
};
