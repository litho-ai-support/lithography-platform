import type { AsyncTaskRecordView } from '@src/modules/async-task-record/async-task-record.types';

export interface GetAsyncTaskRecordByQueueJobInput {
  readonly queueName: string;
  readonly jobId: string;
}

export type GetAsyncTaskRecordByQueueJobResult = AsyncTaskRecordView | null;
