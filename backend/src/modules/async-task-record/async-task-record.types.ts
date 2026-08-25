// src/modules/async-task-record/async-task-record.types.ts

import { RECORD_SOURCES, type RecordSource } from '@app-types/common/record-source.types';

export const ASYNC_TASK_RECORD_SOURCES = RECORD_SOURCES;

export type AsyncTaskRecordSource = RecordSource;

export const ASYNC_TASK_RECORD_STATUSES = [
  'queued',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type AsyncTaskRecordStatus = (typeof ASYNC_TASK_RECORD_STATUSES)[number];
export type AsyncTaskRecordTerminalStatus = Extract<
  AsyncTaskRecordStatus,
  'succeeded' | 'failed' | 'cancelled'
>;

export interface AsyncTaskRecordView {
  readonly id: number;
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly actorAccountId: number | null;
  readonly actorActiveRole: string | null;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey: string | null;
  readonly source: AsyncTaskRecordSource;
  readonly reason: string | null;
  readonly occurredAt: Date | null;
  readonly dedupKey: string | null;
  readonly status: AsyncTaskRecordStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number | null;
  readonly enqueuedAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FindAsyncTaskRecordByQueueJobInput {
  readonly queueName: string;
  readonly jobId: string;
}

export interface ListAsyncTaskRecordsByTraceInput {
  readonly traceId: string;
  readonly queueName?: string;
  readonly bizTypes?: ReadonlyArray<string>;
  readonly limit: number;
}

export interface ListAsyncTaskRecordsByBizTargetInput {
  readonly queueName?: string;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly statuses?: ReadonlyArray<AsyncTaskRecordStatus>;
  readonly limit: number;
}

export interface RecordAsyncTaskEnqueuedInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly actorAccountId?: number | null;
  readonly actorActiveRole?: string | null;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly source: AsyncTaskRecordSource;
  readonly reason?: string | null;
  readonly occurredAt?: Date | null;
  readonly dedupKey?: string | null;
  readonly maxAttempts?: number | null;
  readonly enqueuedAt?: Date;
}

export interface RecordAsyncTaskEnqueueFailedInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId?: string;
  readonly traceId: string;
  readonly actorAccountId?: number | null;
  readonly actorActiveRole?: string | null;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly source: AsyncTaskRecordSource;
  readonly reason?: string | null;
  readonly occurredAt?: Date | null;
  readonly dedupKey?: string | null;
  readonly maxAttempts?: number | null;
}

export interface RecordAsyncTaskStartedInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly actorAccountId?: number | null;
  readonly actorActiveRole?: string | null;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly source: AsyncTaskRecordSource;
  readonly overwriteExistingSource?: boolean;
  readonly reason?: string | null;
  readonly dedupKey?: string | null;
  readonly maxAttempts?: number | null;
  readonly overwriteExistingMaxAttempts?: boolean;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
  readonly occurredAt?: Date | null;
  readonly attemptCount?: number;
}

export interface RecordAsyncTaskFinishedInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly actorAccountId?: number | null;
  readonly actorActiveRole?: string | null;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly source: AsyncTaskRecordSource;
  readonly overwriteExistingSource?: boolean;
  readonly status: AsyncTaskRecordTerminalStatus;
  readonly reason?: string | null;
  readonly dedupKey?: string | null;
  readonly maxAttempts?: number | null;
  readonly overwriteExistingMaxAttempts?: boolean;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date | null;
  readonly finishedAt?: Date;
  readonly occurredAt?: Date | null;
  readonly attemptCount?: number;
}

export interface CreateAsyncTaskRecordInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly actorAccountId?: number | null;
  readonly actorActiveRole?: string | null;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly source: AsyncTaskRecordSource;
  readonly reason?: string | null;
  readonly occurredAt?: Date | null;
  readonly dedupKey?: string | null;
  readonly status: AsyncTaskRecordStatus;
  readonly attemptCount?: number;
  readonly maxAttempts?: number | null;
  readonly enqueuedAt: Date;
  readonly startedAt?: Date | null;
  readonly finishedAt?: Date | null;
}

export interface UpdateAsyncTaskRecordStatusInput {
  readonly status?: AsyncTaskRecordStatus;
  readonly source?: AsyncTaskRecordSource;
  readonly attemptCount?: number;
  readonly maxAttempts?: number | null;
  readonly startedAt?: Date | null;
  readonly finishedAt?: Date | null;
  readonly reason?: string | null;
  readonly occurredAt?: Date | null;
}
