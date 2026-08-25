// src/adapters/api/graphql/email/dto/queue-email.input.ts
import { trimTextPure } from '@core/common/text/text.helper';
import { Field, InputType } from '@nestjs/graphql';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsObject, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class QueueEmailInput {
  @Field(() => String, { description: '收件邮箱地址' })
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '收件邮箱必须是字符串' })
  @MaxLength(254, { message: '收件邮箱长度不能超过 254 个字符' })
  to!: string;

  @Field(() => String, { description: '邮件主题' })
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '邮件主题必须是字符串' })
  @MaxLength(200, { message: '邮件主题长度不能超过 200 个字符' })
  subject!: string;

  @Field(() => String, { nullable: true, description: '纯文本内容' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '纯文本内容必须是字符串' })
  text?: string;

  @Field(() => String, { nullable: true, description: 'HTML 内容' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: 'HTML 内容必须是字符串' })
  html?: string;

  @Field(() => String, { nullable: true, description: '模板 ID' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '模板 ID 必须是字符串' })
  templateId?: string;

  @Field(() => GraphQLJSON, { nullable: true, description: '扩展元数据' })
  @IsOptional()
  @ValidateIf((input: QueueEmailInput) => input.meta !== undefined)
  @IsObject({ message: '扩展元数据必须是对象' })
  meta?: Readonly<Record<string, string>>;

  @Field(() => String, { nullable: true, description: '幂等键' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '幂等键必须是字符串' })
  dedupKey?: string;

  @Field(() => String, { nullable: true, description: '链路追踪 ID' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString({ message: '链路追踪 ID 必须是字符串' })
  traceId?: string;
}
