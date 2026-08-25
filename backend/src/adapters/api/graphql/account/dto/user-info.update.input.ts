// 文件位置：src/adapters/api/graphql/account/dto/user-info.update.input.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { Field, InputType, ObjectType } from '@nestjs/graphql';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import GraphQLJSON from 'graphql-type-json';
import { UserInfoDTO } from './user-info.dto';

@InputType()
export class UpdateUserInfoInput {
  @Field(() => Number, { nullable: true, description: '目标账户 ID（不传则默认当前登录用户）' })
  @IsOptional()
  @IsInt()
  accountId?: number;

  @Field(() => IdentityTypeEnum, { nullable: true, description: '登录提示身份' })
  @IsOptional()
  @IsEnum(IdentityTypeEnum)
  identityHint?: IdentityTypeEnum;

  @Field(() => String, { nullable: true, description: '昵称' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @Field(() => Gender, { nullable: true, description: '性别' })
  @IsOptional()
  gender?: Gender;

  @Field(() => UserState, { nullable: true, description: '账户状态（仅管理员或工作人员可修改）' })
  @IsOptional()
  @IsEnum(UserState)
  userState?: UserState;

  @Field(() => String, { nullable: true, description: '出生日期（YYYY-MM-DD）' })
  @IsOptional()
  birthDate?: string | null;

  @Field(() => String, { nullable: true, description: '头像 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatarUrl?: string | null;

  @Field(() => String, { nullable: true, description: '邮箱' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  email?: string | null;

  @Field(() => String, { nullable: true, description: '个性签名' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  signature?: string | null;

  @Field(() => String, { nullable: true, description: '地址' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @Field(() => String, { nullable: true, description: '电话' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @Field(() => [String], { nullable: true, description: '标签' })
  @IsOptional()
  tags?: string[] | null;

  @Field(() => GraphQLJSON, { nullable: true, description: '地理位置信息 { province, city }' })
  @IsOptional()
  geographic?: { province?: string | null; city?: string | null } | null;
}

@ObjectType()
export class UpdateUserInfoResult {
  @Field(() => Boolean, { description: '是否发生更新（幂等）' })
  isUpdated!: boolean;

  @Field(() => UserInfoDTO, { description: '更新后的用户信息视图' })
  userInfo!: UserInfoDTO;
}

@InputType()
export class UpdateAccessGroupInput {
  @Field(() => Number, { description: '目标账户 ID' })
  @IsInt()
  @Min(1)
  accountId!: number;

  @Field(() => [IdentityTypeEnum], { description: '访问组' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(IdentityTypeEnum, { each: true })
  accessGroup!: IdentityTypeEnum[];

  @Field(() => IdentityTypeEnum, { nullable: true, description: '身份提示' })
  @IsOptional()
  @IsEnum(IdentityTypeEnum)
  identityHint?: IdentityTypeEnum;
}

@ObjectType()
export class UpdateAccessGroupResult {
  @Field(() => Number, { description: '账户 ID' })
  accountId!: number;

  @Field(() => [IdentityTypeEnum], { description: '访问组' })
  accessGroup!: IdentityTypeEnum[];

  @Field(() => IdentityTypeEnum, { description: '身份提示' })
  identityHint!: IdentityTypeEnum;

  @Field(() => Boolean, { description: '是否发生更新（幂等）' })
  isUpdated!: boolean;
}
