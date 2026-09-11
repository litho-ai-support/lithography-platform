// src/adapters/api/graphql/account/dto/admin-change-user-role.input.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, Min } from 'class-validator';

/**
 *
 * - `role` 在协议层使用完整 `IdentityTypeEnum`（领域 enum 单一真源，
 *   见 `type.rules.md` 第 3 节），但可写值域只有 `ENGINEER` / `CUSTOMER`：
 *   `SUPER_ADMIN` 等其余值由 Usecase 的 `normalizeAdminUserWritableRole()`
 *   白名单拒绝（失败关闭方向），本层不做第二份可写值枚举副本；
 * - 目标含 SUPER_ADMIN 的只读保护由 Usecase 依数据库事实裁决；
 */
@InputType({ description: '管理员修改用户角色输入' })
export class AdminChangeUserRoleInput {
  @Field(() => Int, { description: '目标账号 ID' })
  @IsInt({ message: '账号 ID 必须是整数' })
  @Min(1, { message: '账号 ID 必须是正整数' })
  accountId!: number;

  @Field(() => IdentityTypeEnum, { description: '目标角色（可写值域仅 ENGINEER / CUSTOMER）' })
  @IsEnum(IdentityTypeEnum, { message: '角色无效' })
  role!: IdentityTypeEnum;
}
