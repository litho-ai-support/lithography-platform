// src/adapters/api/graphql/account/dto/user-info.dto.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * 用户信息 DTO
 */
@ObjectType({ description: '用户信息' })
export class UserInfoDTO {
  @Field(() => ID, { description: '用户信息 ID' })
  id!: number;

  @Field(() => Number, { description: '关联的账户 ID' })
  accountId!: number;

  @Field(() => String, { description: '昵称' })
  nickname!: string;

  @Field(() => Gender, { description: '性别' })
  gender!: Gender;

  @Field(() => String, { description: '出生日期', nullable: true })
  birthDate!: string | null;

  @Field(() => String, { description: '头像 URL', nullable: true })
  avatarUrl!: string | null;

  @Field(() => String, { description: '邮箱', nullable: true })
  email!: string | null;

  @Field(() => String, { description: '个性签名', nullable: true })
  signature!: string | null;

  @Field(() => [IdentityTypeEnum], { description: '用户访问组' })
  accessGroup!: IdentityTypeEnum[];

  @Field(() => String, { description: '地址', nullable: true })
  address!: string | null;

  @Field(() => String, { description: '电话', nullable: true })
  phone!: string | null;

  @Field(() => [String], { description: '标签', nullable: true })
  tags!: string[] | null;

  @Field(() => String, { description: '地理位置信息', nullable: true }) // 简化为字符串
  geographic!: string | null;

  @Field(() => Number, { description: '通知数' })
  notifyCount!: number;

  @Field(() => Number, { description: '未读通知数' })
  unreadCount!: number;

  @Field(() => UserState, { description: '用户状态' })
  userState!: UserState;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;
}
