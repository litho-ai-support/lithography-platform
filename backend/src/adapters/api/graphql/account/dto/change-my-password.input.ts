// src/adapters/api/graphql/account/dto/change-my-password.input.ts

import { IsValidPassword } from '@adapters/api/graphql/common/password-validation.decorator';
import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 当前用户自助修改密码输入（P3）。
 *
 * - 仅含 `currentPassword` 与 `newPassword` 两个字段，**不含**账号 ID（目标账号只能
 *   来自已认证 Session）；前端确认密码只做表单一致性检查，不是持久化字段；
 * - `newPassword` 走协议级 `IsValidPassword`（与 `RegisterInput` / 管理员重置同源装饰器）
 *   只做入口预检，Usecase 仍会再次执行 `PasswordPolicyService`（单一密码策略路径）；
 * - `currentPassword` 刻意**不做** `IsValidPassword`：存量账号的密码可能先于现行策略设立，
 *   策略校验会把本来正确的当前密码误判为非法；非空由 `@IsNotEmpty` 与 Usecase 的
 *   normalize 层双重把关，两个值均不得进入日志、错误文案或响应。
 */
@InputType({ description: '当前用户修改密码输入' })
export class ChangeMyPasswordInput {
  @Field(() => String, { description: '当前密码明文' })
  @IsString({ message: '当前密码必须是字符串' })
  @IsNotEmpty({ message: '当前密码不能为空' })
  currentPassword!: string;

  @Field(() => String, { description: '新密码明文' })
  @IsString({ message: '新密码必须是字符串' })
  @IsNotEmpty({ message: '新密码不能为空' })
  @IsValidPassword({ message: '新密码不符合安全要求' })
  newPassword!: string;
}
