// src/adapters/api/graphql/registration/dto/register-result.dto.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 用户注册结果
 */
@ObjectType({ description: '用户注册结果' })
export class RegisterResult {
  @Field(() => Boolean, { description: '注册是否成功' })
  success!: boolean;

  @Field(() => String, { description: '注册结果消息' })
  message!: string;

  @Field(() => Int, { description: '创建的账户 ID', nullable: true })
  accountId?: number;
}
