// src/usecases/repair-request/create-engineer-response.types.ts

import type { UsecaseSession } from '@app-types/auth/session.types';
import { EngineerResolutionStatus } from '@app-types/models/repair-request.types';
import type { EngineerResponseView } from '@src/modules/lithography/lithography.types';

/**
 * 工程师追加处理回复命令
 * 字段为 adapter 结构校验后的原始输入；
 * 空白语义与状态值域语义由 usecase 通过既有 normalize primitive 收敛
 */
export type CreateEngineerResponseCommand = {
  session: UsecaseSession;
  requestId: number;
  responseText: string;
  resolutionStatus: EngineerResolutionStatus;
};

/**
 * 工程师追加处理回复结果：复用既有回复稳定读视图
 * （与详情读链路同一输出契约，engineerNickname 缺失回落「工程师」）
 */
export type CreateEngineerResponseResult = EngineerResponseView;
