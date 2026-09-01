// src/adapters/api/graphql/repair-request/dto/repair-request-read.dto.ts
// 维修申请公共读模型 GraphQL 输出对象（对接方案第一/二节契约）
// 注意：本文件不导入 lithography.types 的枚举/常量，状态字段一律字符串表达

import { Field, Int, ObjectType } from '@nestjs/graphql';
import { paginatedTypeFactory } from '@src/adapters/api/graphql/pagination.type-factory';
import { EquipmentModelDTO } from '../../equipment-model/dto/equipment-model.dto';

/**
 * 维修申请列表项输出对象
 * 客户列表、工程师待接单列表、工程师已接单列表复用同一结构；
 * 不返回归属类账号 ID
 */
@ObjectType({ description: '维修申请列表项（三个列表复用同一结构）' })
export class RepairRequestListItemDTO {
  @Field(() => Int, { description: '维修申请 ID' })
  id!: number;

  @Field(() => String, { description: '申请编号' })
  requestNo!: string;

  @Field(() => EquipmentModelDTO, { description: '设备型号' })
  equipmentModel!: EquipmentModelDTO;

  @Field(() => String, { description: '设备错误码' })
  errorCode!: string;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Boolean, { description: '是否已接单' })
  isAccepted!: boolean;

  @Field(() => Date, { nullable: true, description: '接单时间（未接单为空）' })
  acceptedAt?: Date | null;

  @Field(() => String, {
    nullable: true,
    description: '最新回复处理状态：PENDING / RESOLVED；尚无回复为空',
  })
  latestResolutionStatus?: string | null;
}

/**
 * 工程师回复输出对象（随详情返回，时间正序）
 * engineerAccountId 为展示专用字段：只读展示「工程师 #id」，不回传、不参与归属判断
 */
@ObjectType({ description: '工程师回复（展示专用，按时间正序）' })
export class EngineerResponseDTO {
  @Field(() => Int, { description: '回复 ID' })
  id!: number;

  @Field(() => Int, { description: '回复工程师账号 ID（展示专用，不参与归属判断）' })
  engineerAccountId!: number;

  @Field(() => String, { description: '处理状态：PENDING / RESOLVED' })
  resolutionStatus!: string;

  @Field(() => String, { description: '面向客户的处理回复' })
  responseText!: string;

  @Field(() => Date, { description: '回复时间' })
  createdAt!: Date;
}

/**
 * 维修申请详情输出对象（客户与工程师共用结构，读权限由后端按身份判定）
 */
@ObjectType({ description: '维修申请详情（含回复时间线）' })
export class RepairRequestDetailDTO {
  @Field(() => Int, { description: '维修申请 ID' })
  id!: number;

  @Field(() => String, { description: '申请编号' })
  requestNo!: string;

  @Field(() => EquipmentModelDTO, { description: '设备型号' })
  equipmentModel!: EquipmentModelDTO;

  @Field(() => String, { description: '设备错误码' })
  errorCode!: string;

  @Field(() => String, { description: '故障描述' })
  faultDescription!: string;

  @Field(() => String, { description: '维修申请 Markdown 内容' })
  contentMd!: string;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Boolean, { description: '是否已接单' })
  isAccepted!: boolean;

  @Field(() => Date, { nullable: true, description: '接单时间（未接单为空）' })
  acceptedAt?: Date | null;

  @Field(() => String, {
    nullable: true,
    description: '最新回复处理状态：PENDING / RESOLVED；尚无回复为空',
  })
  latestResolutionStatus?: string | null;

  @Field(() => [EngineerResponseDTO], { description: '工程师回复（时间正序）' })
  responses!: EngineerResponseDTO[];
}

/**
 * 维修申请列表分页输出（OFFSET：items/total/page/pageSize）
 */
@ObjectType({ description: '维修申请分页结果' })
export class RepairRequestPaginatedDTO extends paginatedTypeFactory(RepairRequestListItemDTO) {}
