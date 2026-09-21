// src/adapters/api/graphql/account/dto/change-my-password-result.dto.ts

import { Field, ObjectType } from '@nestjs/graphql';
import type { ChangeMyPasswordOutcome } from '@src/usecases/account/my-account-settings.types';

/**
 * 当前用户修改密码结果 DTO（P3）。
 *
 * 由 Usecase 契约 `ChangeMyPasswordOutcome` 薄映射而来，只含 `isUpdated` 与固定成功
 * `notice` 两项；**严禁**出现当前密码、新密码、密码哈希或验证细节。`notice` 不声称
 * 服务端撤销了已签发 Token——旧 Access Token 按 `JWT_EXPIRES_IN` 自然过期，前端收到
 * 成功结果后清除本地 Session 并跳转登录（客户端会话收口）。
 */
@ObjectType({ description: '当前用户修改密码结果' })
export class ChangeMyPasswordResultDTO {
  @Field(() => Boolean, { description: '是否执行了更新' })
  isUpdated!: boolean;

  @Field(() => String, { description: '固定安全提示' })
  notice!: string;
}

/**
 * Usecase Outcome → DTO 薄映射（字段直通）。
 */
export function toChangeMyPasswordResultDTO(
  result: ChangeMyPasswordOutcome,
): ChangeMyPasswordResultDTO {
  return {
    isUpdated: result.isUpdated,
    notice: result.notice,
  };
}
