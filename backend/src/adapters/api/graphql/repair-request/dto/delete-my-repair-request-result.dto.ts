// src/adapters/api/graphql/repair-request/dto/delete-my-repair-request-result.dto.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 客户删除维修申请结果输出对象
 * 成功与幂等成功（重复删除，负责人 20260901 裁定 5）返回同一结构；
 * 仅含申请标识，不含任何账号 ID
 */
@ObjectType({ description: '客户删除维修申请结果' })
export class DeleteMyRepairRequestResultDTO {
  @Field(() => Int, { description: '已删除的维修申请 ID' })
  id!: number;

  @Field(() => String, { description: '申请编号' })
  requestNo!: string;
}
