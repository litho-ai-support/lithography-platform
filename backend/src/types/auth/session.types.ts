// src/types/auth/session.types.ts
import { JwtPayload } from '../jwt.types';

/**
 * Usecase 层统一会话类型
 * 从 GraphQL 层的 `JwtPayload` 中抽取必要字段，避免在各 usecase 重复定义。
 */
export interface UsecaseSession {
  /** 当前账户 ID */
  accountId: number;
  /**
   * 角色访问组（已在此处做规范化）
   * - 来源：JWT `accessGroup`
   * - 格式：全部转为大写字符串，去除空值与重复项
   * - 语义：与 GraphQL `@Roles()` 所使用的角色编码保持一致（如 "STAFF"）
   */
  roles: string[];
}

/**
 * 从 JWT Payload 映射到 UsecaseSession 的辅助函数
 * 防止不同调用方手动拼装导致字段不一致。
 */
export function mapJwtToUsecaseSession(jwt: JwtPayload): UsecaseSession {
  return {
    accountId: jwt.sub,
    roles: normalizeAccessGroup(jwt.accessGroup),
  };
}

/**
 * 将 JWT `accessGroup` 规范化为用例层可直接使用的角色数组
 * - 统一转为大写字符串
 * - 过滤空值与空字符串
 * - 去重，避免重复角色影响后续判断与日志
 */
function normalizeAccessGroup(accessGroup: string[]): string[] {
  if (!Array.isArray(accessGroup)) return [];

  const normalized: string[] = [];
  for (const role of accessGroup) {
    if (role == null) continue;
    const name = String(role).trim();
    if (!name) continue;
    normalized.push(name.toUpperCase());
  }

  return Array.from(new Set(normalized));
}
