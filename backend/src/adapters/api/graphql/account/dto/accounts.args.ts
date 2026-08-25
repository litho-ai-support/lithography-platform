// src/adapters/api/graphql/account/dto/accounts.args.ts
import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * 账户列表查询参数
 * 支持筛选、分页、排序功能
 */
@ArgsType()
export class AccountsArgs {
  // === 筛选条件 ===
  @Field(() => String, { description: '按登录名搜索（模糊匹配）', nullable: true })
  @IsOptional()
  @IsString()
  loginName?: string;

  @Field(() => String, { description: '按邮箱搜索（模糊匹配）', nullable: true })
  @IsOptional()
  @IsString()
  loginEmail?: string;

  @Field(() => AccountStatus, { description: '按状态筛选', nullable: true })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @Field(() => [IdentityTypeEnum], { description: '按身份类型筛选', nullable: true })
  @IsOptional()
  @IsEnum(IdentityTypeEnum, { each: true })
  identityTypes?: IdentityTypeEnum[];

  @Field(() => Date, { description: '创建时间起始', nullable: true })
  @IsOptional()
  createdAfter?: Date;

  @Field(() => Date, { description: '创建时间结束', nullable: true })
  @IsOptional()
  createdBefore?: Date;

  // === 分页参数 ===
  @Field(() => Int, { description: '页码（从 1 开始）', defaultValue: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @Field(() => Int, { description: '每页数量', defaultValue: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  // === 排序参数 ===
  @Field(() => String, { description: '排序字段', defaultValue: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy: string = 'createdAt';

  @Field(() => String, { description: '排序方向', defaultValue: 'DESC' })
  @IsOptional()
  // @IsEnum(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}
