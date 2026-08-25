import { AudienceTypeEnum } from '@app-types/models/account.types';
import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';

export interface VerificationRecordDetailView {
  id: number;
  type: VerificationRecordType;
  status: VerificationRecordStatus;
  expiresAt: Date;
  notBefore: Date | null;
  targetAccountId: number | null;
  subjectType: SubjectType | null;
  subjectId: number | null;
  payload: Record<string, unknown> | null;
  issuedByAccountId: number | null;
  consumedByAccountId: number | null;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 验证记录公开载荷数据
 * 只包含对上层有用且非敏感的字段
 */
export interface VerificationRecordPublicPayload {
  /** 客户端类型 */
  audience?: AudienceTypeEnum;
  /** 流程 ID */
  flowId?: string;
  /** 标题 */
  title?: string;
  /** 描述 */
  description?: string;
  /** 签发机构 */
  issuer?: string;
  /** 验证链接（不含敏感参数） */
  verifyUrl?: string;
  /** 邀请链接（不含敏感参数） */
  inviteUrl?: string;
  /** 角色名称（非敏感） */
  roleName?: string;
  /** 其他非敏感的业务字段 */
  [key: string]: unknown;
}

/**
 * 验证记录清洁视图
 * 用于返回给调用方的安全数据结构
 *
 * 安全设计原则：
 * - 移除原始 payload，避免泄露 email/phone 等 PII 信息
 * - 使用 publicPayload 白名单，只导出对上层有用且非敏感的字段
 * - 即使被上层/日志/埋点无意中打印，也不会泄露敏感信息
 */
export interface VerificationRecordView {
  /** 记录 ID */
  id: number;
  /** 记录类型 */
  type: VerificationRecordType;
  /** 记录状态 */
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
  /** 公开载荷数据（仅包含非敏感字段） */
  publicPayload: VerificationRecordPublicPayload | null;
  /** 签发者账号 ID */
  issuedByAccountId: number | null;
  /** 创建时间 */
  createdAt: Date;
}
