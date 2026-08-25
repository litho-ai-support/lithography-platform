// src/adapters/api/graphql/ai/dto/queue-ai-embed.input.ts
import { trimTextPure } from '@core/common/text/text.helper';
import { Field, InputType } from '@nestjs/graphql';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';
import { isStringRecord } from './string-record.validator';

@InputType()
export class QueueAiEmbedInput {
  @Field(() => String, { description: '模型名称' })
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '模型名称必须是字符串' })
  @MaxLength(128, { message: '模型名称长度不能超过 128 个字符' })
  model!: string;

  @Field(() => String, { description: '向量化文本' })
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '向量化文本必须是字符串' })
  @MaxLength(12000, { message: '向量化文本长度不能超过 12000 个字符' })
  text!: string;

  @Field(() => GraphQLJSON, { nullable: true, description: '扩展元数据' })
  @IsOptional()
  @ValidateIf((input: QueueAiEmbedInput) => input.metadata !== undefined)
  @isStringRecord({ message: '扩展元数据必须是字符串键值对象' })
  metadata?: Readonly<Record<string, string>>;

  @Field(() => String, { nullable: true, description: '幂等键' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '幂等键必须是字符串' })
  @MaxLength(191, { message: '幂等键长度不能超过 191 个字符' })
  dedupKey?: string;

  @Field(() => String, { nullable: true, description: '链路追踪 ID' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '链路追踪 ID 必须是字符串' })
  @MaxLength(128, { message: '链路追踪 ID 长度不能超过 128 个字符' })
  traceId?: string;
}
