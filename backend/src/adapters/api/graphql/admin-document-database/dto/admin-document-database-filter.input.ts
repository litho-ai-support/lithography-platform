// src/adapters/api/graphql/admin-document-database/dto/admin-document-database-filter.input.ts
// 管理员文档数据库（PR3 只读聚合）筛选入参；全部可选。
//
// R6：字段类型如实表达 GraphQL runtime 的 nullable（显式 null 合法传入）。
// @IsOptional() 对 null / undefined 均跳过校验；适配层映射边界统一 `?? undefined`
// 规整，不允许 null 进入 ORM 条件（否则生成 IS NULL 静默漏数或内部错误）。

import { Field, InputType, Int } from '@nestjs/graphql';
import { AiConversationStatus } from '@app-types/models/ai-conversation.types';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** 展示关键字长度上限（昵称 50 / 公司名 100，取并集上限；与 usecase 层校验对齐） */
const KEYWORD_MAX_LENGTH = 100;
/** 编号/故障码筛选长度上限（与表列长一致） */
const REQUEST_NO_MAX_LENGTH = 64;
const ERROR_CODE_MAX_LENGTH = 100;
const REPORT_TYPE_MAX_LENGTH = 100;

@InputType({ description: '管理员维修申请列表筛选条件' })
export class AdminRepairRequestFilterInput {
  @Field(() => String, { nullable: true, description: '申请编号模糊搜索' })
  @IsOptional()
  @IsString({ message: '申请编号搜索词必须是字符串' })
  @MaxLength(REQUEST_NO_MAX_LENGTH, {
    message: `申请编号搜索词不能超过 ${REQUEST_NO_MAX_LENGTH} 个字符`,
  })
  requestNo?: string | null;

  @Field(() => String, {
    nullable: true,
    description: '客户关键字（昵称/公司名称模糊匹配，服务端解析为账号集合）',
  })
  @IsOptional()
  @IsString({ message: '客户关键字必须是字符串' })
  @MaxLength(KEYWORD_MAX_LENGTH, { message: `客户关键字不能超过 ${KEYWORD_MAX_LENGTH} 个字符` })
  customerKeyword?: string | null;

  @Field(() => Int, { nullable: true, description: '设备型号 ID 等值筛选' })
  @IsOptional()
  @IsInt({ message: '设备型号 ID 必须是整数' })
  @Min(1, { message: '设备型号 ID 必须大于 0' })
  equipmentModelId?: number | null;

  @Field(() => String, { nullable: true, description: '故障码等值筛选' })
  @IsOptional()
  @IsString({ message: '故障码必须是字符串' })
  @MaxLength(ERROR_CODE_MAX_LENGTH, { message: `故障码不能超过 ${ERROR_CODE_MAX_LENGTH} 个字符` })
  errorCode?: string | null;

  @Field(() => Boolean, { nullable: true, description: '接单状态筛选' })
  @IsOptional()
  @IsBoolean({ message: '接单状态必须是布尔值' })
  isAccepted?: boolean | null;

  @Field(() => Date, { nullable: true, description: '创建时间范围起点（含）' })
  @IsOptional()
  createdAtFrom?: Date | null;

  @Field(() => Date, { nullable: true, description: '创建时间范围终点（含）' })
  @IsOptional()
  createdAtTo?: Date | null;
}

@InputType({ description: '管理员 AI 会话列表筛选条件' })
export class AdminAiConversationFilterInput {
  @Field(() => String, { nullable: true, description: '关联申请编号模糊搜索' })
  @IsOptional()
  @IsString({ message: '申请编号搜索词必须是字符串' })
  @MaxLength(REQUEST_NO_MAX_LENGTH, {
    message: `申请编号搜索词不能超过 ${REQUEST_NO_MAX_LENGTH} 个字符`,
  })
  requestNo?: string | null;

  @Field(() => String, {
    nullable: true,
    description: '工程师关键字（昵称/公司名称模糊匹配，服务端解析为账号集合）',
  })
  @IsOptional()
  @IsString({ message: '工程师关键字必须是字符串' })
  @MaxLength(KEYWORD_MAX_LENGTH, { message: `工程师关键字不能超过 ${KEYWORD_MAX_LENGTH} 个字符` })
  engineerKeyword?: string | null;

  @Field(() => AiConversationStatus, { nullable: true, description: '会话状态筛选' })
  @IsOptional()
  @IsEnum(AiConversationStatus, { message: '会话状态无效' })
  status?: AiConversationStatus | null;

  @Field(() => Date, { nullable: true, description: '创建时间范围起点（含）' })
  @IsOptional()
  createdAtFrom?: Date | null;

  @Field(() => Date, { nullable: true, description: '创建时间范围终点（含）' })
  @IsOptional()
  createdAtTo?: Date | null;
}

@InputType({ description: '管理员 AI 报告列表筛选条件' })
export class AdminAiReportFilterInput {
  @Field(() => String, { nullable: true, description: '关联申请编号模糊搜索' })
  @IsOptional()
  @IsString({ message: '申请编号搜索词必须是字符串' })
  @MaxLength(REQUEST_NO_MAX_LENGTH, {
    message: `申请编号搜索词不能超过 ${REQUEST_NO_MAX_LENGTH} 个字符`,
  })
  requestNo?: string | null;

  @Field(() => String, {
    nullable: true,
    description: '工程师关键字（昵称/公司名称模糊匹配，服务端解析为账号集合）',
  })
  @IsOptional()
  @IsString({ message: '工程师关键字必须是字符串' })
  @MaxLength(KEYWORD_MAX_LENGTH, { message: `工程师关键字不能超过 ${KEYWORD_MAX_LENGTH} 个字符` })
  engineerKeyword?: string | null;

  @Field(() => String, { nullable: true, description: '报告类型等值筛选' })
  @IsOptional()
  @IsString({ message: '报告类型必须是字符串' })
  @MaxLength(REPORT_TYPE_MAX_LENGTH, {
    message: `报告类型不能超过 ${REPORT_TYPE_MAX_LENGTH} 个字符`,
  })
  reportType?: string | null;

  @Field(() => Date, { nullable: true, description: '创建时间范围起点（含）' })
  @IsOptional()
  createdAtFrom?: Date | null;

  @Field(() => Date, { nullable: true, description: '创建时间范围终点（含）' })
  @IsOptional()
  createdAtTo?: Date | null;
}
