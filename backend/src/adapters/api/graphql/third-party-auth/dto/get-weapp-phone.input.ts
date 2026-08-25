// src/adapters/api/graphql/third-party-auth/dto/get-weapp-phone.input.ts
import { AudienceTypeEnum } from '@app-types/models/account.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsInt } from 'class-validator';

/**
 * 获取微信小程序手机号输入参数
 */
@InputType()
export class GetWeappPhoneInput {
  @Field({ description: '微信小程序获取手机号的 code' })
  @IsString()
  @IsNotEmpty()
  phoneCode!: string;

  @Field(() => AudienceTypeEnum, { description: '客户端类型' })
  @IsEnum(AudienceTypeEnum, { message: '客户端类型无效' })
  audience!: AudienceTypeEnum;

  @Field(() => Int, { nullable: true, description: '账户 ID（已登录用户）' })
  @IsOptional()
  @IsInt()
  accountId?: number;

  @Field({ nullable: true, description: '微信 openid（未登录用户）' })
  @IsOptional()
  @IsString()
  openid?: string;
}
