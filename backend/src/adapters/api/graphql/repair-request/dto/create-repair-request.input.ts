// src/adapters/api/graphql/repair-request/dto/create-repair-request.input.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

/** 故障描述长度上限（防御异常长输入直达 ORM；text 列约 65535 字节，5000 字符 × 4 字节仍安全） */
const FAULT_DESCRIPTION_MAX_LENGTH = 5000;

/**
 * 创建维修申请输入参数
 *
 * 仅做结构校验（拦脏数据）：
 * - 空白语义、长度语义由 usecase 判定
 * - customerAccountId 不在输入中（仅取自会话），requestNo / contentMd 由后端生成
 */
@InputType({ description: '创建维修申请输入参数' })
export class CreateRepairRequestInput {
  @Field(() => Int, { description: '设备型号 ID' })
  @IsInt({ message: '设备型号 ID 必须是整数' })
  @Min(1, { message: '设备型号 ID 必须大于 0' })
  equipmentModelId!: number;

  @Field(() => String, { description: '设备错误码' })
  @IsString({ message: '错误码必须是字符串' })
  @MaxLength(100, { message: '错误码不能超过 100 个字符' })
  errorCode!: string;

  @Field(() => String, { description: '故障描述' })
  @IsString({ message: '故障描述必须是字符串' })
  @MaxLength(FAULT_DESCRIPTION_MAX_LENGTH, {
    message: `故障描述不能超过 ${FAULT_DESCRIPTION_MAX_LENGTH} 个字符`,
  })
  faultDescription!: string;
}
