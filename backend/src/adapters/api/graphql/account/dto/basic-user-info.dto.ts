// src/adapters/api/graphql/account/dto/basic-user-info.dto.ts
import { Gender } from '@app-types/models/user-info.types';
import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * 用户基本信息 DTO（精简版）
 * 与 UserInfoDTO 区分：仅返回常用基础字段
 */
@ObjectType({ description: '用户基本信息（精简版）' })
export class BasicUserInfoDTO {
  @Field(() => ID, { description: '用户信息 ID' })
  id!: number;

  @Field(() => Number, { description: '关联的账户 ID' })
  accountId!: number;

  @Field(() => String, { description: '昵称' })
  nickname!: string;

  @Field(() => Gender, { description: '性别' })
  gender!: Gender;

  @Field(() => String, { description: '头像 URL', nullable: true })
  avatarUrl!: string | null;

  @Field(() => String, { description: '电话', nullable: true })
  phone!: string | null;
}
