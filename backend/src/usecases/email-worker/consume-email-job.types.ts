import type { SendEmailInput } from '@src/modules/common/email-worker/email-worker.types';

export interface ConsumeEmailJobProcessInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly payload: SendEmailInput;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
}

export interface ConsumeEmailJobCompleteInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
}

export interface ConsumeEmailJobFailInput extends ConsumeEmailJobCompleteInput {
  readonly reason?: string;
  readonly occurredAt?: Date;
}
