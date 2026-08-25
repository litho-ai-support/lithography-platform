// src/adapters/api/graphql/pagination.type-factory.ts
// GraphQL 输出类型工厂：Paginated<T> 与 PageInfo 外壳

import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class PageInfoType {
  @Field()
  hasNext!: boolean;

  @Field({ nullable: true })
  nextCursor?: string;
}

export function paginatedTypeFactory<TItem>(itemClass: new () => TItem) {
  @ObjectType({ isAbstract: true })
  class PaginatedBase {
    @Field(() => [itemClass])
    items!: TItem[];

    @Field(() => Int, { nullable: true })
    total?: number;

    @Field(() => Int, { nullable: true })
    page?: number;

    @Field(() => Int, { nullable: true })
    pageSize?: number;

    @Field(() => PageInfoType, { nullable: true })
    pageInfo?: PageInfoType;
  }

  return PaginatedBase;
}
