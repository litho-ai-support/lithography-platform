// src/adapters/api/graphql/account/dto/admin-reset-user-password.input.ts

import { IsValidPassword } from '@adapters/api/graphql/common/password-validation.decorator';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 *
 * - `newPassword` 是**新密码明文**：协议级 `IsValidPassword`（与 `RegisterInput`
 *   同源装饰器）只做入口预检，Usecase 仍会再次执行 `PasswordPolicyService`
 *   （单一密码策略路径）；该值不得进入日志、错误文案或响应；
 * - 刻意**不含**旧密码、验证 token 或任何 verification 流程字段：管理员重置与
 *   公开 `resetPassword`（verification token 流程）是两条互不复用的链路
 *   ACTIVE / INACTIVE 普通账号可重置，拒绝发生在哈希生成与任何写入之前。
 */
@InputType({ description: '管理员重置普通用户密码输入' })
export class AdminResetUserPasswordInput {
  @Field(() => Int, { description: '目标账号 ID' })
  @IsInt({ message: '账号 ID 必须是整数' })
  @Min(1, { message: '账号 ID 必须是正整数' })
  accountId!: number;

  @Field(() => String, { description: '新密码明文' })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @IsValidPassword({ message: '密码不符合安全要求' })
  newPassword!: string;
}
