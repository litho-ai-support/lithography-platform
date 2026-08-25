// src/adapters/worker/email/email-send.mapper.ts
import type {
  ConsumeEmailJobCompleteInput,
  ConsumeEmailJobFailInput,
  ConsumeEmailJobProcessInput,
} from '@src/usecases/email-worker/consume-email-job.types';
import type { Job } from 'bullmq';

export const EMAIL_QUEUE_NAME = 'email';
export const EMAIL_SEND_JOB_NAME = 'send';

export interface EmailSendPayload {
  readonly to: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly templateId?: string;
  readonly meta?: Readonly<Record<string, string>>;
  readonly traceId?: string;
}

export interface EmailSendResult {
  readonly accepted: boolean;
  readonly providerMessageId: string;
}

export type EmailSendJob = Job<EmailSendPayload, EmailSendResult, typeof EMAIL_SEND_JOB_NAME>;

export function mapEmailSendJobToProcessInput(input: {
  readonly job: EmailSendJob;
}): ConsumeEmailJobProcessInput {
  const jobId = resolveJobId({ job: input.job });
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'strict',
  });
  return {
    queueName: EMAIL_QUEUE_NAME,
    jobName: EMAIL_SEND_JOB_NAME,
    jobId,
    traceId,
    payload: input.job.data,
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
  };
}

export function mapEmailSendJobToCompleteInput(input: {
  readonly job: EmailSendJob;
}): ConsumeEmailJobCompleteInput {
  const jobId = resolveJobId({ job: input.job });
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'strict',
  });
  return {
    queueName: EMAIL_QUEUE_NAME,
    jobName: EMAIL_SEND_JOB_NAME,
    jobId,
    traceId,
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
    finishedAt: resolveDate({ timestamp: input.job.finishedOn }),
  };
}

export function mapEmailSendJobToFailInput(input: {
  readonly job: EmailSendJob;
  readonly error: Error;
}): ConsumeEmailJobFailInput {
  const occurredAt = resolveDate({ timestamp: input.job.finishedOn });
  const jobId = resolveJobId({ job: input.job });
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'degraded',
  });
  return {
    queueName: EMAIL_QUEUE_NAME,
    jobName: EMAIL_SEND_JOB_NAME,
    jobId,
    traceId,
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
    finishedAt: occurredAt,
    occurredAt,
    reason: input.error.message.slice(0, 128),
  };
}

export function mapMissingEmailSendJobToFailInput(input: {
  readonly error: Error;
  readonly occurredAt?: Date;
}): ConsumeEmailJobFailInput {
  const occurredAt = input.occurredAt ?? new Date();
  const jobId = resolveMissingJobId({
    occurredAt,
    jobName: EMAIL_SEND_JOB_NAME,
  });
  return {
    queueName: EMAIL_QUEUE_NAME,
    jobName: EMAIL_SEND_JOB_NAME,
    jobId,
    traceId: jobId,
    attemptsMade: 0,
    enqueuedAt: occurredAt,
    finishedAt: occurredAt,
    occurredAt,
    reason: `worker_event_job_missing:${input.error.message.slice(0, 96)}`,
  };
}

function resolveDate(input: { readonly timestamp?: number }): Date | undefined {
  if (typeof input.timestamp !== 'number' || Number.isNaN(input.timestamp)) {
    return undefined;
  }
  return new Date(input.timestamp);
}

function resolveMaxAttempts(input: { readonly job: EmailSendJob }): number | undefined {
  const attempts = input.job.opts.attempts;
  if (typeof attempts !== 'number' || Number.isNaN(attempts)) {
    return undefined;
  }
  return attempts;
}

function resolveJobId(input: { readonly job: EmailSendJob }): string {
  if (typeof input.job.id === 'number') {
    return String(input.job.id);
  }
  return input.job.id ?? `${EMAIL_SEND_JOB_NAME}:${input.job.timestamp}`;
}

function resolveTraceId(input: {
  readonly job: EmailSendJob;
  readonly mode: 'strict' | 'degraded';
}): string {
  const payloadTraceId = input.job.data.traceId?.trim();
  if (payloadTraceId) {
    return payloadTraceId;
  }
  if (input.mode === 'strict') {
    throw new Error(`missing_payload_trace_id:${input.job.name}`);
  }
  const jobId = resolveJobId({ job: input.job });
  return `degraded-trace:${input.job.name}:${jobId}`;
}

function resolveMissingJobId(input: {
  readonly occurredAt: Date;
  readonly jobName: string;
}): string {
  return `missing-job:${input.jobName}:${input.occurredAt.getTime()}`;
}
