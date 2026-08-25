// src/adapters/api/graphql/third-party-auth/dto/third-party-session.type.ts
// src/adapters/api/graphql/third-party-auth/graphql/types/third-party-session.type.ts
import { Field, ObjectType } from '@nestjs/graphql';

/**
 * 第三方用户基本信息 GraphQL 类型
 */
@ObjectType({ description: '第三方用户基本信息' })
export class ThirdPartyProfileType {
  @Field({ nullable: true, description: '用户昵称' })
  nickname?: string | null;

  @Field({ nullable: true, description: '用户邮箱' })
  email?: string | null;

  @Field({ nullable: true, description: '用户头像 URL' })
  avatarUrl?: string | null;
}

/**
 * 第三方会话信息 GraphQL 类型
 */
@ObjectType({ description: '第三方会话信息' })
export class ThirdPartySessionType {
  @Field({ description: '第三方平台用户唯一标识' })
  providerUserId!: string;

  @Field({
    nullable: true,
    description: '联合 ID，用于跨应用识别同一用户 (仅特定平台返回，如微信 unionid)',
  })
  unionId!: string | null;

  @Field(() => ThirdPartyProfileType, {
    nullable: true,
    description: '用户基本信息 (仅特定平台返回，如 OAuth 用户信息接口)',
  })
  profile?: ThirdPartyProfileType;

  @Field({ nullable: true, description: '微信小程序会话密钥原始值 (仅 WeApp 平台返回)' })
  sessionKeyRaw?: string;

  @Field({
    nullable: true,
    description: 'OIDC ID Token 的 header.payload 部分 (仅 OIDC 平台返回，用于审计)',
  })
  idTokenHeaderPayload?: string;
}
