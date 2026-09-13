// src/adapters/api/graphql/account/dto/admin-reset-user-password-result.dto.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { AdminResetUserPasswordResult } from '@src/usecases/account/admin-user-management.types';

/**
 * 管理员重置密码结果 DTO（P0-8）。
 *
 * 由 Usecase 契约 `AdminResetUserPasswordResult` 薄映射而来，只含目标账号 ID、
 * 是否执行了更新与固定安全提示三项；**严禁**出现新密码、旧密码、密码哈希或任何
 */
@ObjectType({ description: '管理员重置密码结果' })
export class AdminResetUserPasswordResultDTO {
  @Field(() => Int, { description: '目标账号 ID' })
  accountId!: number;

  @Field(() => Boolean, { description: '是否执行了更新' })
  isUpdated!: boolean;

  @Field(() => String, { description: '固定安全提示' })
  notice!: string;
}

/**
 * Usecase Result → DTO 薄映射（字段直通）。
 */
export function toAdminResetUserPasswordResultDTO(
  result: AdminResetUserPasswordResult,
): AdminResetUserPasswordResultDTO {
  return {
    accountId: result.accountId,
    isUpdated: result.isUpdated,
    notice: result.notice,
  };
}
