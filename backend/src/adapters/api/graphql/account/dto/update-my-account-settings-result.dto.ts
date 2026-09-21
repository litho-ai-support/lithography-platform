// src/adapters/api/graphql/account/dto/update-my-account-settings-result.dto.ts

import { Field, ObjectType } from '@nestjs/graphql';
import type { UpdateMyAccountSettingsOutcome } from '@src/usecases/account/my-account-settings.types';
import { MyAccountSettingsDTO, toMyAccountSettingsDTO } from './my-account-settings.dto';

/**
 * 当前用户账号设置更新结果 DTO（P2）。
 *
 * 由 Usecase 契约 `UpdateMyAccountSettingsOutcome` 薄映射而来：`isUpdated` 表达本次
 * 是否发生任何落库（同值 / 未提供字段不写库，返回 `isUpdated: false` 与当前 View）；
 * `settings` 复用只读 Query 的 `MyAccountSettingsDTO`——更新后的 View 与读取 View
 * 是同一个稳定公开读模型，不另建第二份字段集。
 */
@ObjectType({ description: '当前用户账号设置更新结果' })
export class UpdateMyAccountSettingsResultDTO {
  @Field(() => Boolean, { description: '是否发生了任何写入' })
  isUpdated!: boolean;

  @Field(() => MyAccountSettingsDTO, { description: '更新后的账号设置' })
  settings!: MyAccountSettingsDTO;
}

/**
 * Usecase Outcome → DTO 薄映射（字段直通，settings 复用既有 View 映射；不做任何业务判断）。
 */
export function toUpdateMyAccountSettingsResultDTO(
  result: UpdateMyAccountSettingsOutcome,
): UpdateMyAccountSettingsResultDTO {
  return {
    isUpdated: result.isUpdated,
    settings: toMyAccountSettingsDTO(result.settings),
  };
}
