// src/adapters/api/graphql/account/dto/admin-update-user-profile.input.ts

import { trimTextPure } from '@core/common/text/text.helper';
import { Field, InputType, Int } from '@nestjs/graphql';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 *
 * - `accountId` 为目标账号 ID；正整数收敛由 Usecase 的
 *   `normalizeAdminUserTargetAccountId()` 统一裁决，本层只做协议级整数校验；
 * - 资料字段只接受昵称、公司名称、电话、联系邮箱四个白名单成员；
 *   刻意**不含**登录名、登录邮箱、角色、状态与密码——那些是各自专用
 *   mutation（`adminChangeUserRole` / `adminSetUserStatus` /
 * - 昵称可省略但不可为空：不传 = 不修改，string = 修改，显式 `null` / 空字符串 /
 *   纯空白均拒绝；
 * - 其余三个可选字段保持三态：不传 = 不修改该列，传 `null` = 明确清空；
 */
@InputType({ description: '管理员编辑普通用户资料输入' })
export class AdminUpdateUserProfileInput {
  @Field(() => Int, { description: '目标账号 ID' })
  @IsInt({ message: '账号 ID 必须是整数' })
  @Min(1, { message: '账号 ID 必须是正整数' })
  accountId!: number;

  @Field(() => String, {
    description: '昵称（允许重复；不传 = 不修改，null / 空字符串 / 纯空白均拒绝）',
    nullable: true,
  })
  @ValidateIf((input: AdminUpdateUserProfileInput) => input.nickname !== undefined)
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '昵称必须是字符串' })
  @IsNotEmpty({ message: '昵称不能为空' })
  nickname?: string;

  @Field(() => String, { description: '公司名称（不传 = 不修改，null = 清空）', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '公司名称必须是字符串' })
  companyName?: string | null;

  @Field(() => String, { description: '电话（不传 = 不修改，null = 清空）', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '电话必须是字符串' })
  phone?: string | null;

  @Field(() => String, {
    description: '联系邮箱（非登录凭据；不传 = 不修改，null = 清空）',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '联系邮箱必须是字符串' })
  @MaxLength(254, { message: '联系邮箱长度不能超过 254 个字符' })
  @IsEmail({}, { message: '联系邮箱格式不正确' })
  contactEmail?: string | null;
}
