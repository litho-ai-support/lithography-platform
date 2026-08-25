// src/adapters/api/graphql/ai/dto/queue-ai-generate.input.ts
import type { AiProvider } from '@app-types/common/ai-provider.types';
import { trimTextPure } from '@core/common/text/text.helper';
import { Field, InputType } from '@nestjs/graphql';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';
import { isStringRecord } from './string-record.validator';

@InputType()
export class QueueAiGenerateInput {
  @Field(() => String, { nullable: true, description: 'AI 提供方' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: 'AI 提供方必须是字符串' })
  @MaxLength(32, { message: 'AI 提供方长度不能超过 32 个字符' })
  provider?: AiProvider;

  @Field(() => String, { description: '模型名称' })
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '模型名称必须是字符串' })
  @MaxLength(128, { message: '模型名称长度不能超过 128 个字符' })
  model!: string;

  @Field(() => String, { description: '生成提示词' })
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '生成提示词必须是字符串' })
  @MaxLength(12000, { message: '生成提示词长度不能超过 12000 个字符' })
  prompt!: string;

  @Field(() => GraphQLJSON, { nullable: true, description: '扩展元数据' })
  @IsOptional()
  @ValidateIf((input: QueueAiGenerateInput) => input.metadata !== undefined)
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
