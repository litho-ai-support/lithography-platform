// src/adapters/api/graphql/account/dto/change-my-password.input.ts

import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 当前用户自助修改密码输入（P3）。
 *
 * - 仅含 `currentPassword` 与 `newPassword` 两个字段，**不含**账号 ID（目标账号只能
 *   来自已认证 Session）；前端确认密码只做表单一致性检查，不是持久化字段；
 * - `newPassword` 只保留协议级验证：`IsString` + `IsNotEmpty`（与 `RegisterInput` / 管理员重置同口径）。
 *   不采用 `IsValidPassword` 装饰器——装饰器校验失败走 HttpException 路径，生产环境的过滤器会把
 *   该路径整体塌缩为 `INTERNAL_SERVER_ERROR`，弱密码的错误分类随之丢失；移除后弱密码由 Usecase
 *   层 DomainError（`INPUT_NORMALIZE_ERROR.INVALID_TEXT`）**稳定映射为 `BAD_USER_INPUT`**（生产与
 *   开发一致）。它也与 `UNAUTHENTICATED` 不同类：密码输错属于客户端输入错误，前端收到
 *   `BAD_USER_INPUT` 只提示重试，不会误判会话失效而清理 Session 跳转登录页；
 * - 所有密码策略断言集中在 Usecase 层通过 `PasswordPolicyService.validatePassword()` 裁决（单一策略路径）；
 * - `currentPassword` 只保留 `IsString` + `IsNotEmpty`，不做 `IsValidPassword`：存量账号的密码可能先于
 *   现行策略设立，策略校验会把本来正确的当前密码误判为非法；非空由 normalize 层双重把关；
 * - 两个密码字段均不得出现在日志、错误文案或响应中。
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
  newPassword!: string;
}
