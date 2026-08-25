// src/adapters/api/graphql/verification-record/dto/update-verification-record.input.ts

import { SubjectType, VerificationRecordStatus } from '@app-types/models/verification-record.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

/**
 * 更新验证记录输入参数
 */
@InputType({ description: '更新验证记录输入参数' })
export class UpdateVerificationRecordInput {
  @Field(() => Int, { description: '验证记录 ID' })
  @IsInt({ message: 'ID 必须是整数' })
  id!: number;

  @Field(() => VerificationRecordStatus, { description: '记录状态', nullable: true })
  @IsOptional()
  @IsEnum(VerificationRecordStatus, { message: '记录状态无效' })
  status?: VerificationRecordStatus;

  @Field(() => Date, { description: '过期时间', nullable: true })
  @IsOptional()
  expiresAt?: Date;

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

  // 以下字段仅供后端内部使用，不暴露给 GraphQL

  /** 消费者账号 ID（仅后端内部使用） */
  @IsOptional()
  @IsInt({ message: '消费者账号 ID 必须是整数' })
  consumedByAccountId?: number;

  /** 消费时间（仅后端内部使用） */
  @IsOptional()
  consumedAt?: Date;
}
