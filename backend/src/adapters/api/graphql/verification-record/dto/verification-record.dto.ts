// src/adapters/api/graphql/verification-record/dto/verification-record.dto.ts

import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * 验证记录数据传输对象
 * 与 VerificationRecordEntity 保持结构一致，用于 GraphQL 查询返回
 */
@ObjectType({ description: '验证记录' })
export class VerificationRecordDTO {
  @Field(() => Int, { description: '验证记录 ID' })
  id!: number;

  @Field(() => VerificationRecordType, { description: '记录类型' })
  type!: VerificationRecordType;

  @Field(() => VerificationRecordStatus, { description: '记录状态' })
  status!: VerificationRecordStatus;

  @Field(() => Date, { description: '过期时间' })
  expiresAt!: Date;

  @Field(() => Date, { description: '生效时间', nullable: true })
  notBefore!: Date | null;

  @Field(() => Int, { description: '目标账号 ID', nullable: true })
  targetAccountId!: number | null;

  @Field(() => SubjectType, { description: '主体类型', nullable: true })
  subjectType!: SubjectType | null;

  @Field(() => Int, { description: '主体 ID', nullable: true })
  subjectId!: number | null;

  @Field(() => GraphQLJSON, { description: '载荷数据', nullable: true })
  payload!: Record<string, unknown> | null;

  @Field(() => Int, { description: '签发者账号 ID', nullable: true })
  issuedByAccountId!: number | null;

  @Field(() => Int, { description: '消费者账号 ID', nullable: true })
  consumedByAccountId!: number | null;

  @Field(() => Date, { description: '消费时间', nullable: true })
  consumedAt!: Date | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;
}
