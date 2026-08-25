// src/adapters/api/graphql/verification-record/dto/consume-verification-record.input.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * 消费验证记录输入参数
 */
@InputType({ description: '消费验证记录输入参数' })
export class ConsumeVerificationRecordInput {
  @Field(() => String, { description: '验证 token' })
  @IsNotEmpty({ message: 'token 不能为空' })
  @IsString({ message: 'token 必须是字符串' })
  token!: string;

  @Field(() => VerificationRecordType, { description: '期望的验证记录类型', nullable: true })
  @IsOptional()
  @IsEnum(VerificationRecordType, { message: '验证记录类型无效' })
  expectedType?: VerificationRecordType;

  // 以下字段仅供后端内部使用，不暴露给 GraphQL

  /** 消费者账号 ID（仅后端内部使用） */
  @IsOptional()
  @IsInt({ message: '消费者账号 ID 必须是整数' })
  consumedByAccountId?: number;
}
