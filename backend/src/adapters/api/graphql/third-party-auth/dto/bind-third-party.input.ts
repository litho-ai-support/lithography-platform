// src/adapters/api/graphql/third-party-auth/dto/bind-third-party.input.ts
import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 绑定第三方登录输入类型
 */
@InputType()
export class BindThirdPartyInput {
  @Field(() => ThirdPartyProviderEnum, { description: '第三方平台类型' })
  @IsEnum(ThirdPartyProviderEnum)
  provider!: ThirdPartyProviderEnum;

  @Field({ description: '平台返回的用户唯一标识' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  providerUserId!: string;

  @Field(() => String, {
    nullable: true,
    description: '联合 ID，如微信的 unionid (仅特定平台提供)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  unionId?: string | null;

  @Field(() => String, { nullable: true, description: '访问令牌（仅调试用途）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  accessToken?: string | null;
}
