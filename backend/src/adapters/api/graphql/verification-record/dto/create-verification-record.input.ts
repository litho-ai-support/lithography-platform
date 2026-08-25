// src/adapters/api/graphql/verification-record/dto/create-verification-record.input.ts

import {
  CreatableVerificationRecordType,
  SubjectType,
} from '@app-types/models/verification-record.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

/**
 * 创建验证记录输入参数
 */
@InputType({ description: '创建验证记录输入参数' })
export class CreateVerificationRecordInput {
  @Field(() => CreatableVerificationRecordType, { description: '记录类型' })
  @IsEnum(CreatableVerificationRecordType, { message: '记录类型无效' })
  type!: CreatableVerificationRecordType;

  @Field(() => String, { description: '令牌（可选，不提供则由后端生成）', nullable: true })
  @IsOptional()
  @IsString({ message: '令牌必须是字符串' })
  token?: string;

  @Field(() => Date, { description: '过期时间' })
  expiresAt!: Date;

  @Field(() => Date, { description: '生效时间', nullable: true })
  @IsOptional()
  notBefore?: Date;

  @Field(() => Int, { description: '目标账号 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: '目标账号 ID 必须是整数' })
  targetAccountId?: number;

  @Field(() => SubjectType, { description: '主体类型', nullable: true })
  @IsOptional()
  @IsEnum(SubjectType, { message: '主体类型无效' })
  subjectType?: SubjectType;

  @Field(() => Int, { description: '主体 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: '主体 ID 必须是整数' })
  subjectId?: number;

  @Field(() => GraphQLJSON, { description: '载荷数据', nullable: true })
  @IsOptional()
  payload?: Record<string, unknown>;

  @Field(() => Int, { description: 'Token 长度（仅在自动生成时有效，默认 32）', nullable: true })
  @IsOptional()
  @IsInt({ message: 'Token 长度必须是整数' })
  @Min(4, { message: 'Token 长度不能少于 4 位' })
  @Max(255, { message: 'Token 长度不能超过 255 位' })
  tokenLength?: number;

  @Field(() => Boolean, {
    description: '是否生成数字验证码（默认 false，生成随机字符串）',
    nullable: true,
  })
  @IsOptional()
  @IsBoolean({ message: '数字验证码选项必须是布尔值' })
  generateNumericCode?: boolean;

  @Field(() => Int, {
    description: '数字验证码长度（仅在 generateNumericCode 为 true 时有效，默认 6）',
    nullable: true,
  })
  @IsOptional()
  @IsInt({ message: '数字验证码长度必须是整数' })
  @Min(4, { message: '数字验证码长度不能少于 4 位' })
  @Max(12, { message: '数字验证码长度不能超过 12 位' })
  numericCodeLength?: number;

  @Field(() => Boolean, { description: '是否在返回体中回明文 token（默认 false）', nullable: true })
  @IsOptional()
  @IsBoolean({ message: '返回 token 选项必须是布尔值' })
  returnToken?: boolean;
}
