// src/adapters/api/graphql/account/dto/account.args.ts

// 负责单个账户的 input 和 output 设定
// 由于是聚合根，所以不只是对应 account entities
import { LoginTypeEnum } from '@app-types/models/account.types';
import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * 账户登录参数
 */
@ArgsType()
export class AccountLoginArgs {
  @Field(() => String, { description: '登录名或邮箱' })
  @IsString({ message: '登录名必须是字符串' })
  @IsNotEmpty({ message: '登录名不能为空' })
  loginName!: string;

  @Field(() => String, { description: '登录密码' })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  loginPassword!: string;

  @Field(() => String, { description: '登录类型', nullable: true })
  @IsOptional()
  @IsEnum(LoginTypeEnum, { message: '登录类型无效' })
  type?: LoginTypeEnum;
}

/**
 * 单个账户查询参数
 */
@ArgsType()
export class AccountArgs {
  @Field(() => Int, { description: '账户 ID' })
  @IsNotEmpty({ message: '账户 ID 不能为空' })
  id!: number;
}
