// src/adapters/api/graphql/account/enums/login-history.types.ts

import { Field, ObjectType } from '@nestjs/graphql';

/**
 * 登录历史记录项 GraphQL 类型
 */
@ObjectType('LoginHistoryItem', { isAbstract: true })
export class LoginHistoryItemGql {
  @Field(() => String, { description: '登录 IP 地址' })
  ip!: string;

  @Field(() => String, { description: '登录时间（ISO 格式）' })
  timestamp!: string;

  @Field(() => String, { nullable: true, description: '客户端类型' })
  audience?: string;
}
