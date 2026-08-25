// src/core/account/identity/parse-staff-id.ts
import { ACCOUNT_ERROR, DomainError } from '../../common/errors/domain-error';

/**
 * 解析 Staff ID（员工编号）为 number，并在无效时抛出领域错误。
 * - 允许输入为 string 或 number；string 会做去空格与前导零处理后再解析。
 * - 禁止 NaN、Infinity、负数、空字符串等无效值。
 * - 纯函数：不依赖外部状态或框架。
 *
 * @param params 输入参数对象，包含 `id` 字段
 * @returns 解析后的合法 `number`
 * @throws DomainError 当 `id` 无法解析为合法的整数时，抛出 `ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED`
 */
export function parseStaffId({ id }: { id: string | number }): number {
  // 直接接受 number 类型（保证是有限正整数）
  if (typeof id === 'number') {
    if (!Number.isFinite(id) || Number.isNaN(id)) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '员工 ID 非法：不是有限数字');
    }
    const n = Math.trunc(id);
    if (n <= 0) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '员工 ID 非法：必须为正整数');
    }
    return n;
  }

  // 处理字符串：去空格、去前导零
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '员工 ID 非法：空字符串');
  }

  // 去除前导零，但保留单个零的情况用于校验（零将被视为非法）
  const normalized = trimmed.replace(/^0+/, '') || '0';

  // 仅允许纯数字（不含符号与小数点）
  if (!/^\d+$/.test(normalized)) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '员工 ID 非法：必须为纯数字');
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '员工 ID 非法：必须为正整数');
  }

  return parsed;
}
