// src/adapters/api/graphql/account/dto/delete-account.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * 删除账户输入参数
 */
@InputType()
export class DeleteAccountInput {
  @Field(() => Int, { description: '账户 ID' })
  @IsInt({ message: 'ID 必须是整数' })
  id!: number;

  @Field(() => String, { description: '删除原因', nullable: true })
  @IsOptional()
  @IsString({ message: '删除原因必须是字符串' })
  reason?: string;
}
