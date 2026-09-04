// src/usecases/repair-request/assert-engineer-response-text-capacity.ts

import { DomainError, INPUT_NORMALIZE_ERROR } from '@core/common/errors/domain-error';

/**
 * 工程师回复正文容量断言（MySQL `TEXT` 的 UTF-8 字节容量保护）。
 *
 * - 仅服务回复正文容量，不做跨模块公共化重构；
 * - 计量单位为真实 UTF-8 字节数（Buffer.byteLength），而非 string.length 的
 *   UTF-16 码元数：中文 3 bytes、多数 emoji 4 bytes，用字符数会低估实际容量；
 * - 上限为 MySQL `TEXT` 列的 65,535 bytes，超限即在读取昵称/开启事务/调用写服务
 *   之前拒绝，不产生任何回复记录；
 * - 复用现有输入错误契约 INPUT_NORMALIZE_ERROR.INVALID_TEXT，经 GraphQL 异常过滤
 *   映射为稳定大类 BAD_USER_INPUT，不新增与现有错误体系平行的异常类。
 */

/** MySQL `TEXT` 列最大字节容量（UTF-8 计量），与前端容量策略常量一致 */
export const ENGINEER_RESPONSE_TEXT_MAX_BYTES = 65535;

/**
 * @param responseText 已经过 normalizeRequiredText（trim）后的回复正文
 */
export function assertEngineerResponseTextCapacity(responseText: string): void {
  const byteLength = Buffer.byteLength(responseText, 'utf8');
  if (byteLength > ENGINEER_RESPONSE_TEXT_MAX_BYTES) {
    throw new DomainError(
      INPUT_NORMALIZE_ERROR.INVALID_TEXT,
      '回复正文不能超过 65,535 字节（按 UTF-8 计算）',
      { byteLength, maxBytes: ENGINEER_RESPONSE_TEXT_MAX_BYTES },
    );
  }
}
