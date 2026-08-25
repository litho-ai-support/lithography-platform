// src/adapters/api/graphql/verification-record/dto/find-verification-record.input.ts

import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { Field, HideField, InputType, Int } from '@nestjs/graphql';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * 至少一个过滤条件验证器
 * 防止全表扫描，确保至少提供一个查询条件
 */
@ValidatorConstraint({ name: 'AtLeastOneFilter', async: false })
class AtLeastOneFilter implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const o = args.object as FindVerificationRecordInput;
    return !!(
      o.id ||
      o.token ||
      o.type ||
      o.status ||
      o.targetAccountId ||
      o.subjectType ||
      o.subjectId ||
      o.issuedByAccountId ||
      o.consumedByAccountId
    );
  }

  defaultMessage(): string {
    return '至少提供一个查询条件';
  }
}

/**
 * 验证记录查询输入参数
 */
@InputType({ description: '验证记录查询参数' })
export class FindVerificationRecordInput {
  @Field(() => Int, { description: '验证记录 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: 'ID 必须是整数' })
  id?: number;

  @Field(() => String, { description: '验证 token', nullable: true })
  @IsOptional()
  @IsString({ message: 'token 必须是字符串' })
  token?: string;

  @Field(() => VerificationRecordType, { description: '记录类型', nullable: true })
  @IsOptional()
  @IsEnum(VerificationRecordType, { message: '记录类型无效' })
  type?: VerificationRecordType;

  @Field(() => VerificationRecordStatus, { description: '记录状态', nullable: true })
  @IsOptional()
  @IsEnum(VerificationRecordStatus, { message: '记录状态无效' })
  status?: VerificationRecordStatus;

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

  @Field(() => Int, { description: '签发者账号 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: '签发者账号 ID 必须是整数' })
  issuedByAccountId?: number;

  @Field(() => Int, { description: '消费者账号 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: '消费者账号 ID 必须是整数' })
  consumedByAccountId?: number;

  @Field(() => VerificationRecordType, { description: '期望的验证记录类型', nullable: true })
  @IsOptional()
  @IsEnum(VerificationRecordType, { message: '期望类型无效' })
  expectedType?: VerificationRecordType;

  @Field(() => Boolean, { description: '忽略目标账号限制（用于公开验证）', nullable: true })
  @IsOptional()
  ignoreTargetRestriction?: boolean;

  // 使用隐藏字段承载类级校验（不会出现在 GraphQL schema）
  @HideField()
  @Validate(AtLeastOneFilter)
  private readonly atLeastOneValidation!: true;
}
