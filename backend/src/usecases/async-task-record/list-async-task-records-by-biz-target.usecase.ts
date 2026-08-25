import { Injectable } from '@nestjs/common';
import {
  normalizeLimit,
  normalizeOptionalText,
  normalizeRequiredText,
} from '@src/core/common/input-normalize/input-normalize.policy';
import type {
  AsyncTaskRecordStatus,
  AsyncTaskRecordView,
} from '@src/modules/async-task-record/async-task-record.types';
import { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';

export interface ListAsyncTaskRecordsByBizTargetInput {
  readonly queueName?: string;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly statuses?: ReadonlyArray<AsyncTaskRecordStatus>;
  readonly limit?: number;
}

export interface ListAsyncTaskRecordsByBizTargetResult {
  readonly items: ReadonlyArray<AsyncTaskRecordView>;
}

@Injectable()
export class ListAsyncTaskRecordsByBizTargetUsecase {
  constructor(private readonly asyncTaskRecordQueryService: AsyncTaskRecordQueryService) {}

  async execute(
    input: ListAsyncTaskRecordsByBizTargetInput,
  ): Promise<ListAsyncTaskRecordsByBizTargetResult> {
    const bizType = normalizeRequiredText(input.bizType, { fieldName: 'bizType' });
    const bizKey = normalizeRequiredText(input.bizKey, { fieldName: 'bizKey' });
    const queueName = normalizeOptionalText(input.queueName, 'reject', { fieldName: 'queueName' });
    const bizSubKey = normalizeOptionalText(input.bizSubKey, 'to_null', { fieldName: 'bizSubKey' });
    const items = await this.asyncTaskRecordQueryService.listByBizTarget({
      where: {
        queueName: queueName ?? undefined,
        bizType,
        bizKey,
        bizSubKey: bizSubKey === undefined ? undefined : bizSubKey,
        statuses: input.statuses,
        limit: normalizeLimit(input.limit, { fallback: 50, min: 1, max: 500 }),
      },
    });
    return { items };
  }
}
