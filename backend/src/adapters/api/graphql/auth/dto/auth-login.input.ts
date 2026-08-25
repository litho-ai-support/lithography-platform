// src/adapters/api/graphql/auth/dto/auth-login.input.ts

import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * 用户登录输入参数
 */
@InputType()
export class AuthLoginInput {
  @Field(() => String, { description: '登录名或邮箱' })
  @IsString({ message: '登录名必须是字符串' })
  @IsNotEmpty({ message: '登录名不能为空' })
  loginName!: string;

  @Field(() => String, { description: '登录密码' })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  loginPassword!: string;

  @Field(() => LoginTypeEnum, { description: '登录类型' })
  @IsEnum(LoginTypeEnum, { message: '登录类型无效' })
  type!: LoginTypeEnum;

  @Field(() => String, { description: '客户端 IP 地址', nullable: true })
  @IsOptional()
  @IsString({ message: 'IP 地址必须是字符串' })
  ip?: string;

  @Field(() => AudienceTypeEnum, { description: '客户端类型' })
  @IsEnum(AudienceTypeEnum, { message: '客户端类型无效' })
  audience!: AudienceTypeEnum;
}
