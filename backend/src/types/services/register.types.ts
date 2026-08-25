// src/types/services/register.types.ts

import { AccountStatus } from '../models/account.types';

/**
 * 注册类型枚举
 */
export enum RegisterTypeEnum {
  /** 工作人员 */
  STAFF = 'STAFF',
  /** 注册用户 */
  REGISTRANT = 'REGISTRANT',
}

export interface RegisterInputModel {
  loginName?: string | null;
  loginEmail: string;
  loginPassword: string;
  nickname?: string;
  type: RegisterTypeEnum;
  inviteToken?: string;
  confirmPassword?: string;
}

/**
 * 准备好的注册数据类型
 * 用于 TypeORM 创建账户实体的数据结构
 */
export type PreparedRegisterData = Omit<RegisterInputModel, 'confirmPassword' | 'type'> & {
  /** 账户状态 */
  status: AccountStatus;
  /** 用户昵称 */
  nickname: string;
  /** 邮箱地址 */
  email: string;
  /** 访问权限组 */
  accessGroup: string[];
  /** 身份提示 */
  identityHint: string;
  /** 私有字段 */
  metaDigest: string | null; // 修复：改为 string | null，与实体定义一致
};
