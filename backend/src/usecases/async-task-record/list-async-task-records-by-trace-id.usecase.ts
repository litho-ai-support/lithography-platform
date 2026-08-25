import { Injectable } from '@nestjs/common';
import {
  normalizeLimit,
  normalizeOptionalText,
  normalizeRequiredText,
  normalizeTextList,
} from '@src/core/common/input-normalize/input-normalize.policy';
import type { ListPolicy } from '@src/core/common/input-normalize/input-normalize.types';
import type { AsyncTaskRecordView } from '@src/modules/async-task-record/async-task-record.types';
import { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';

export interface ListAsyncTaskRecordsByTraceIdInput {
  readonly traceId: string;
  readonly queueName?: string;
  readonly bizTypes?: ReadonlyArray<string>;
  readonly limit?: number;
}

export interface ListAsyncTaskRecordsByTraceIdResult {
  readonly items: ReadonlyArray<AsyncTaskRecordView>;
}

@Injectable()
export class ListAsyncTaskRecordsByTraceIdUsecase {
  private static readonly OPTIONAL_FILTER_LIST_POLICY: ListPolicy = {
    filter_empty: true,
    reject_invalid_item: true,
    dedupe: false,
    empty_result: 'reject',
  };

  constructor(private readonly asyncTaskRecordQueryService: AsyncTaskRecordQueryService) {}

  async execute(
    input: ListAsyncTaskRecordsByTraceIdInput,
  ): Promise<ListAsyncTaskRecordsByTraceIdResult> {
    const traceId = normalizeRequiredText(input.traceId, { fieldName: 'traceId' });
    const queueName = normalizeOptionalText(input.queueName, 'reject', { fieldName: 'queueName' });
    const bizTypes =
      input.bizTypes === undefined
        ? undefined
        : normalizeTextList(
            input.bizTypes,
            ListAsyncTaskRecordsByTraceIdUsecase.OPTIONAL_FILTER_LIST_POLICY,
            { fieldName: 'bizTypes' },
          );
    const items = await this.asyncTaskRecordQueryService.listByTraceId({
      where: {
        traceId,
        queueName: queueName ?? undefined,
        bizTypes: bizTypes ?? undefined,
        limit: normalizeLimit(input.limit, { fallback: 50, min: 1, max: 500 }),
      },
    });
    return { items };
  }
}
