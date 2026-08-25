// src/adapters/api/graphql/verification-record/dto/verification-record.result.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';
import { VerificationRecordDTO } from './verification-record.dto';

/**
 * 创建验证记录结果
 */
@ObjectType({ description: '创建验证记录结果' })
export class CreateVerificationRecordResult {
  @Field(() => Boolean, { description: '操作是否成功' })
  success!: boolean;

  @Field(() => VerificationRecordDTO, { nullable: true, description: '创建的验证记录数据' })
  data?: VerificationRecordDTO | null;

  @Field(() => String, { nullable: true, description: '生成的明文 token（仅创建时返回）' })
  token?: string | null;

  @Field(() => String, { nullable: true, description: '错误信息' })
  message?: string | null;
}

/**
 * 更新验证记录结果
 */
@ObjectType({ description: '更新验证记录结果' })
export class UpdateVerificationRecordResult {
  @Field(() => Boolean, { description: '操作是否成功' })
  success!: boolean;

  @Field(() => VerificationRecordDTO, { nullable: true, description: '更新后的验证记录数据' })
  data?: VerificationRecordDTO | null;

  @Field(() => String, { nullable: true, description: '错误信息' })
  message?: string | null;
}

/**
 * 验证记录列表结果
 */
@ObjectType({ description: '验证记录列表' })
export class VerificationRecordListResult {
  @Field(() => [VerificationRecordDTO], { description: '验证记录列表' })
  items!: VerificationRecordDTO[];

  @Field(() => Int, { description: '总数量' })
  total!: number;
}
