// src/adapters/api/graphql/equipment-model/dto/equipment-model.dto.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 设备型号 GraphQL 输出对象
 */
@ObjectType({ description: '设备型号' })
export class EquipmentModelDTO {
  @Field(() => Int, { description: '设备型号 ID' })
  id!: number;

  @Field(() => String, { description: '设备型号编码' })
  modelCode!: string;

  @Field(() => String, { description: '设备型号名称' })
  modelName!: string;
}
