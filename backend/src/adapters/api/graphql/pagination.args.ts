// src/adapters/api/graphql/pagination.args.ts
// GraphQL 入参 DTO，仅做适配，不进行副作用注册
// GraphQL 入参 DTO：使用已注册的枚举类型

import { Field, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { GqlPaginationMode, GqlSortDirection } from './pagination.enums';

@InputType()
export class SortInput {
  @Field()
  @IsString({ message: '排序字段必须是字符串' })
  field!: string;

  @Field(() => GqlSortDirection)
  @IsEnum(GqlSortDirection, { message: '排序方向无效' })
  direction!: GqlSortDirection; // 显式 GraphQL Enum
}

@InputType()
export class PaginationArgs {
  @Field(() => GqlPaginationMode)
  @IsEnum(GqlPaginationMode, { message: '分页模式无效' })
  mode!: GqlPaginationMode;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码必须大于等于 1' })
  page?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: '每页数量必须是整数' })
  @Min(1, { message: '每页数量必须大于等于 1' })
  @Max(100, { message: '每页数量不能超过 100' })
  pageSize?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'limit 必须是整数' })
  @Min(1, { message: 'limit 必须大于等于 1' })
  @Max(100, { message: 'limit 不能超过 100' })
  limit?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'after 必须是字符串' })
  after?: string;

  @Field(() => [SortInput], { nullable: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SortInput)
  sorts?: SortInput[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean({ message: 'withTotal 必须是布尔值' })
  withTotal?: boolean;
}
