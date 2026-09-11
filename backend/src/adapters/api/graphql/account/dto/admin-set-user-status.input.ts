// src/adapters/api/graphql/account/dto/admin-set-user-status.input.ts

import { AccountStatus } from '@app-types/models/account.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, Min } from 'class-validator';

/**
 *
 * - `status` 在协议层使用完整 `AccountStatus`（领域 enum 单一真源），但可写值域
 *   只有 `ACTIVE` / `INACTIVE`：`PENDING` / `SUSPENDED` / `BANNED` / `DELETED` 等
 *   绕过前端的值由 Usecase 的 `normalizeAdminUserWritableStatus()` 白名单拒绝
 *   （失败关闭方向），本层不做第二份可写值枚举副本；
 * - 转换合法性（仅双字段一致的 ACTIVE/INACTIVE 互转）由 Usecase 依 P0-5 的
 *   R8 状态转换矩阵裁决；「管理员不能停用自己」也由 Usecase 显式拒绝；
 * - 状态写入是双字段同步（`status` + `user_state`），实现归 Usecase，本层不表达。
 */
@InputType({ description: '管理员设置用户状态输入' })
export class AdminSetUserStatusInput {
  @Field(() => Int, { description: '目标账号 ID' })
  @IsInt({ message: '账号 ID 必须是整数' })
  @Min(1, { message: '账号 ID 必须是正整数' })
  accountId!: number;

  @Field(() => AccountStatus, { description: '目标状态（可写值域仅 ACTIVE / INACTIVE）' })
  @IsEnum(AccountStatus, { message: '状态无效' })
  status!: AccountStatus;
}
