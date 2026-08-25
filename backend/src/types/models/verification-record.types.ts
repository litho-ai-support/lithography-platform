// src/types/models/verification-record.types.ts

/**
 * 验证记录类型枚举
 * 通用验证/一次性动作；细分邮箱链接 vs 验证码
 */
export enum VerificationRecordType {
  /** 邮箱验证链接 */
  EMAIL_VERIFY_LINK = 'EMAIL_VERIFY_LINK',
  /** 邮箱验证码 */
  EMAIL_VERIFY_CODE = 'EMAIL_VERIFY_CODE',
  /** 密码重置 */
  PASSWORD_RESET = 'PASSWORD_RESET',
  /** 短信验证码 */
  SMS_VERIFY_CODE = 'SMS_VERIFY_CODE',
}

/**
 * 可创建的验证记录类型枚举
 * 对外创建入口仅开放当前可稳定消费的类型
 */
export enum CreatableVerificationRecordType {
  /** 密码重置 */
  PASSWORD_RESET = 'PASSWORD_RESET',
}

/**
 * 验证记录状态枚举
 * 状态机：一票一次
 */
export enum VerificationRecordStatus {
  /** 活跃状态 */
  ACTIVE = 'ACTIVE',
  /** 已消费 */
  CONSUMED = 'CONSUMED',
  /** 已撤销 */
  REVOKED = 'REVOKED',
  /** 已过期 */
  EXPIRED = 'EXPIRED',
}

/**
 * 主体类型枚举
 */
export enum SubjectType {
  /** 账户 */
  ACCOUNT = 'ACCOUNT',
}

/**
 * 创建验证记录的参数
 */
export interface CreateVerificationRecordParams {
  /** 记录类型 */
  type: VerificationRecordType;
  /** 令牌明文 (用于生成指纹) */
  token: string;
  /** 过期时间 */
  expiresAt: Date;
  /** 生效时间 (可选) */
  notBefore?: Date;
  /** 目标账号 ID (可选) */
  targetAccountId?: number;
  /** 主体类型 (可选) */
  subjectType?: SubjectType;
  /** 主体 ID (可选) */
  subjectId?: number;
  /** 载荷数据 (可选) */
  payload?: Record<string, unknown>;
  /** 签发者账号 ID (可选) */
  issuedByAccountId?: number;
}

/**
 * 验证记录查询参数
 */
export interface FindVerificationRecordParams {
  /** 对外可见 ID */
  uid?: string;
  /** 令牌明文 (用于生成指纹查询) */
  token?: string;
  /** 记录类型 */
  type?: VerificationRecordType;
  /** 状态 */
  status?: VerificationRecordStatus;
  /** 目标账号 ID */
  targetAccountId?: number;
  /** 主体类型 */
  subjectType?: SubjectType;
  /** 主体 ID */
  subjectId?: number;
}

/**
 * 消费验证记录的参数
 */
export interface ConsumeVerificationRecordParams {
  /** 令牌明文 */
  token: string;
  /** 消费者账号 ID */
  consumedByAccountId: number;
  /** 验证目标账号 ID (可选，用于额外验证) */
  expectedTargetAccountId?: number;
}

/**
 * 验证记录 DTO
 */
export interface VerificationRecordDTO {
  /** 主键 ID */
  id: number;
  /** 对外可见 ID */
  uid: string;
  /** 记录类型 */
  type: VerificationRecordType;
  /** 状态 */
  status: VerificationRecordStatus;
  /** 过期时间 */
  expiresAt: Date;
  /** 生效时间 */
  notBefore: Date | null;
  /** 目标账号 ID */
  targetAccountId: number | null;
  /** 主体类型 */
  subjectType: SubjectType | null;
  /** 主体 ID */
  subjectId: number | null;
  /** 载荷数据 */
  payload: Record<string, unknown> | null;
  /** 签发者账号 ID */
  issuedByAccountId: number | null;
  /** 消费者账号 ID */
  consumedByAccountId: number | null;
  /** 消费时间 */
  consumedAt: Date | null;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}
