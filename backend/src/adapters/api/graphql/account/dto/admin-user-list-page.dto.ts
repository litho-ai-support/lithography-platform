// src/adapters/api/graphql/account/dto/admin-user-list-page.dto.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';
import { AdminUserDTO } from '@src/adapters/api/graphql/account/dto/admin-user.dto';

/**
 * 管理员用户列表分页结果 DTO（P0-8）。
 *
 * 与 Usecase 契约 `AdminUserListPage` 严格对齐：只含 `items` / `total` / `page` /
 * 不沿用 `paginatedTypeFactory` 的可选形态弱化契约；也不用工厂隐藏字段来源）。
 * 三源收敛失败整次查询失败关闭，不存在部分列表语义）。
 */
@ObjectType({ description: '管理员用户列表分页结果' })
export class AdminUserListPageDTO {
  @Field(() => [AdminUserDTO], { description: '当前页用户' })
  items!: AdminUserDTO[];

  @Field(() => Int, { description: '同一筛选条件下的总条数' })
  total!: number;

  @Field(() => Int, { description: '当前页码（从 1 开始）' })
  page!: number;

  @Field(() => Int, { description: '每页数量' })
  pageSize!: number;
}
