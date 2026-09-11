// src/adapters/api/graphql/account/dto/admin-create-user.input.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { IsValidPassword } from '@adapters/api/graphql/common/password-validation.decorator';
import {
  LOGIN_NAME_MAX_LENGTH,
  LOGIN_NAME_MIN_LENGTH,
  LOGIN_NAME_PATTERN,
} from '@core/account/policy/login-name.policy';
import { trimTextPure } from '@core/common/text/text.helper';
import { Field, InputType } from '@nestjs/graphql';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 *
 * 协议级 class-validator 只负责 shape 与最基础格式；值收敛（trim、NFKC、凭据
 * 「至少一个」组合约束、角色/状态白名单、密码策略）由
 * `AdminCreateUserUsecase` 及其 normalize 层统一裁决，本 Input 不预设字段已合法。
 *
 * - `loginName` / `loginEmail` 可选但**至少一个**；登录名口径单一真源在
 *   `@core/account/policy/login-name.policy`（4~30 个字符、只允许英文字母/数字/
 *   normalize 同源引用；
 * - `initialPassword` 走协议级 `IsValidPassword`（与 `RegisterInput` 同源装饰器），
 * - `role` 只允许 `ENGINEER` / `CUSTOMER`：`SUPER_ADMIN` 等值在本层通过枚举校验后，
 *   仍会被 Usecase 的可写角色白名单拒绝（失败关闭方向）；
 * - `contactEmail` 是联系邮箱，不得被 Usecase 写入登录凭据列。
 */
@InputType({ description: '管理员创建用户输入' })
export class AdminCreateUserInput {
  @Field(() => String, { description: '登录名（与登录邮箱至少提供一个）', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '登录名必须是字符串' })
  @MinLength(LOGIN_NAME_MIN_LENGTH, { message: '登录名至少 4 个字符' })
  @MaxLength(LOGIN_NAME_MAX_LENGTH, { message: '登录名最多 30 个字符' })
  @Matches(LOGIN_NAME_PATTERN, {
    message: '登录名只能包含英文字母、数字、下划线和短横线',
  })
  loginName?: string | null;

  @Field(() => String, { description: '登录邮箱（与登录名至少提供一个）', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '登录邮箱必须是字符串' })
  @MaxLength(254, { message: '登录邮箱长度不能超过 254 个字符' })
  @IsEmail({}, { message: '登录邮箱格式不正确' })
  loginEmail?: string | null;

  @Field(() => String, { description: '初始密码明文' })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @IsValidPassword({ message: '密码不符合安全要求' })
  initialPassword!: string;

  @Field(() => IdentityTypeEnum, { description: '角色（只允许 ENGINEER 或 CUSTOMER）' })
  @IsEnum(IdentityTypeEnum, { message: '角色无效' })
  role!: IdentityTypeEnum;

  @Field(() => String, { description: '昵称（允许重复）' })
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '昵称必须是字符串' })
  @IsNotEmpty({ message: '昵称不能为空' })
  nickname!: string;

  @Field(() => String, { description: '公司名称', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '公司名称必须是字符串' })
  companyName?: string | null;

  @Field(() => String, { description: '电话', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '电话必须是字符串' })
  phone?: string | null;

  @Field(() => String, { description: '联系邮箱（非登录凭据）', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '联系邮箱必须是字符串' })
  @MaxLength(254, { message: '联系邮箱长度不能超过 254 个字符' })
  @IsEmail({}, { message: '联系邮箱格式不正确' })
  contactEmail?: string | null;
}
