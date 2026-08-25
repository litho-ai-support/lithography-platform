// src/adapters/api/graphql/account/dto/get-user-info.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional } from 'class-validator';

/**
 * 获取用户基本信息输入参数
 */
@InputType()
export class GetUserInfoInput {
  @Field(() => Int, { nullable: true, description: '账户 ID（不传则默认当前登录用户）' })
  @IsOptional()
  @IsInt()
  accountId?: number;
}
