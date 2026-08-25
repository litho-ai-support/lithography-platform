// src/adapters/api/graphql/account/dto/update-account.input.ts
import { AccountStatus } from '@app-types/models/account.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { IsValidPassword } from '@adapters/api/graphql/common/password-validation.decorator';

/**
 * 更新账户输入参数
 */
@InputType()
export class UpdateAccountInput {
  @Field(() => Int, { description: '账户 ID' })
  @IsInt({ message: 'ID 必须是整数' })
  id!: number;

  @Field(() => String, { description: '登录名', nullable: true })
  @IsOptional()
  @IsString({ message: '登录名必须是字符串' })
  @MinLength(3, { message: '登录名至少 3 个字符' })
  loginName?: string;

  @Field(() => String, { description: '登录邮箱', nullable: true })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  loginEmail?: string;

  @Field(() => String, { description: '新密码', nullable: true })
  @IsOptional()
  @IsString({ message: '密码必须是字符串' })
  @IsValidPassword({ message: '密码不符合安全要求' })
  newPassword?: string;

  @Field(() => AccountStatus, { description: '账户状态', nullable: true })
  @IsOptional()
  @IsEnum(AccountStatus, { message: '账户状态无效' })
  status?: AccountStatus;

  @Field(() => String, { description: '身份类型提示', nullable: true })
  @IsOptional()
  identityHint?: string;
}
