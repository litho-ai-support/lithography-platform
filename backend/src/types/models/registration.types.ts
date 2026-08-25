// src/types/models/registration.types.ts

import { RegisterTypeEnum } from '@app-types/services/register.types';

/**
 * 邮箱注册用例参数
 */
export interface RegisterWithEmailParams {
  loginName?: string | null;
  loginEmail: string;
  loginPassword: string;
  nickname?: string | null;
  type?: RegisterTypeEnum;
  inviteToken?: string;
  clientIp?: string;
}

/**
 * 邮箱注册结果
 */
export interface RegisterWithEmailResult {
  success: boolean;
  message: string;
  accountId: number;
}
