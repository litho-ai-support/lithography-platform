// src/adapters/api/graphql/repair-request/dto/engineer-repair-request-filter.input.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 工程师列表可选筛选输入
 *
 * 仅做结构校验（拦脏数据）：
 * - 客户昵称关键词的空白语义（trim 后为空视为未筛选）由 usecase 判定；
 *   LIKE 通配符转义在账号域 QueryService 内参数化完成
 * - 状态筛选不在此对象内：由 scope 四态（ALL/AVAILABLE/MINE/TAKEN_BY_OTHER）统一表达
 */
@InputType({ description: '工程师维修申请列表筛选条件（均可选）' })
export class EngineerRepairRequestFilterInput {
  @Field(() => Int, { nullable: true, description: '设备型号 ID（等值筛选）' })
  @IsOptional()
  @IsInt({ message: '设备型号 ID 必须是整数' })
  @Min(1, { message: '设备型号 ID 必须大于 0' })
  equipmentModelId?: number;

  @Field(() => String, { nullable: true, description: '客户昵称关键词（模糊匹配）' })
  @IsOptional()
  @IsString({ message: '客户昵称关键词必须是字符串' })
  @MaxLength(100, { message: '客户昵称关键词不能超过 100 个字符' })
  customerNickname?: string;
}
