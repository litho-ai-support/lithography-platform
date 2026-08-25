// src/adapters/api/graphql/verification-record/dto/revoke-verification-record.input.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsPositive } from 'class-validator';

/**
 * 撤销验证记录输入参数
 */
@InputType({ description: '撤销验证记录输入参数' })
export class RevokeVerificationRecordInput {
  @Field(() => Int, { description: '验证记录 ID' })
  @IsInt({ message: '记录 ID 必须是整数' })
  @IsPositive({ message: '记录 ID 必须是正整数' })
  recordId!: number;
}
