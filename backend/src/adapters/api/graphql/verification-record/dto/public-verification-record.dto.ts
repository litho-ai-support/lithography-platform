// src/adapters/api/graphql/verification-record/dto/public-verification-record.dto.ts

import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * 公开验证记录数据传输对象
 * 仅包含公开验证所需的必要字段，不包含敏感信息
 */
@ObjectType({ description: '公开验证记录' })
export class PublicVerificationRecordDTO {
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

  @Field(() => SubjectType, { description: '主体类型', nullable: true })
  subjectType!: SubjectType | null;

  @Field(() => Int, { description: '主体 ID', nullable: true })
  subjectId!: number | null;

  @Field(() => GraphQLJSON, { description: '公开载荷数据', nullable: true })
  publicPayload!: Record<string, unknown> | null;
}
