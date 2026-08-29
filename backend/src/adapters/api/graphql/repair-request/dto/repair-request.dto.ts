// src/adapters/api/graphql/repair-request/dto/repair-request.dto.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 维修申请 GraphQL 输出对象
 */
@ObjectType({ description: '维修申请' })
export class RepairRequestDTO {
  @Field(() => Int, { description: '维修申请 ID' })
  id!: number;

  @Field(() => String, { description: '申请编号' })
  requestNo!: string;

  @Field(() => Int, { description: '设备型号 ID' })
  equipmentModelId!: number;

  @Field(() => String, { description: '设备错误码' })
  errorCode!: string;

  @Field(() => String, { description: '故障描述' })
  faultDescription!: string;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Boolean, { description: '是否已接单' })
  isAccepted!: boolean;
}
