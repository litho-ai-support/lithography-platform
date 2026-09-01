// src/adapters/api/graphql/repair-request/dto/repair-request-read.dto.ts
// 维修申请公共读模型 GraphQL 输出对象（负责人 20260901 裁定契约）
// 处理状态使用共享类型层正式枚举（裁定 4）；回复返回工程师安全昵称（裁定 3）

import { EngineerResolutionStatus } from '@app-types/models/repair-request.types';
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

  @Field(() => EngineerResolutionStatus, {
    nullable: true,
    description: '最新回复处理状态；尚无回复为空',
  })
  latestResolutionStatus?: EngineerResolutionStatus | null;
}

/**
 * 工程师回复输出对象（随详情返回，时间正序）
 * engineerNickname 为后端实时关联的安全昵称，缺失回落「工程师」；
 * 不返回工程师账号 ID（裁定 3）
 */
@ObjectType({ description: '工程师回复（按时间正序）' })
export class EngineerResponseDTO {
  @Field(() => Int, { description: '回复 ID' })
  id!: number;

  @Field(() => String, { description: '回复工程师当前昵称（缺失时回落「工程师」）' })
  engineerNickname!: string;

  @Field(() => EngineerResolutionStatus, { description: '处理状态' })
  resolutionStatus!: EngineerResolutionStatus;

  @Field(() => String, { description: '面向客户的处理回复' })
  responseText!: string;

  @Field(() => Date, { description: '回复时间' })
  createdAt!: Date;
}

/**
 * 维修申请详情输出对象（客户与工程师入口共用结构，读权限由后端按身份判定）
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

  @Field(() => EngineerResolutionStatus, {
    nullable: true,
    description: '最新回复处理状态；尚无回复为空',
  })
  latestResolutionStatus?: EngineerResolutionStatus | null;

  @Field(() => [EngineerResponseDTO], { description: '工程师回复（时间正序）' })
  responses!: EngineerResponseDTO[];
}

/**
 * 维修申请列表分页输出（OFFSET：items/total/page/pageSize）
 */
@ObjectType({ description: '维修申请分页结果' })
export class RepairRequestPaginatedDTO extends paginatedTypeFactory(RepairRequestListItemDTO) {}
