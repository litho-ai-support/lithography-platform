import type {
  ConsumeAiWorkflowJobCompleteInput,
  ConsumeAiWorkflowJobFailInput,
  ConsumeAiWorkflowJobProcessInput,
  ConsumeAiWorkflowJobProcessResult,
} from '@src/usecases/ai-worker/consume-ai-workflow-job.types';
import type { Job } from 'bullmq';

export const AI_WORKFLOW_QUEUE_NAME = 'ai-workflow';
export const AI_WORKFLOW_JOB_NAME = 'workflow';

export interface AiWorkflowPayload {
  readonly workflowId: string;
  readonly traceId: string;
}

export type AiWorkflowResult = ConsumeAiWorkflowJobProcessResult;
export type AiWorkflowJob = Job<AiWorkflowPayload, AiWorkflowResult, typeof AI_WORKFLOW_JOB_NAME>;
export type AiWorkflowFailedJob = Job<Record<string, unknown>, unknown, string>;

export function mapAiWorkflowJobToProcessInput(input: {
  readonly job: AiWorkflowJob;
}): ConsumeAiWorkflowJobProcessInput {
  const jobId = resolveJobId(input.job);
  return {
    queueName: AI_WORKFLOW_QUEUE_NAME,
    jobName: AI_WORKFLOW_JOB_NAME,
    jobId,
    workflowId: resolveWorkflowId(input.job, 'strict'),
    traceId: resolveTraceId(input.job, 'strict'),
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts(input.job),
    enqueuedAt: resolveDate(input.job.timestamp),
    startedAt: resolveDate(input.job.processedOn),
  };
}

export function mapAiWorkflowJobToCompleteInput(input: {
  readonly job: AiWorkflowJob;
}): ConsumeAiWorkflowJobCompleteInput {
  const jobId = resolveJobId(input.job);
  return {
    queueName: AI_WORKFLOW_QUEUE_NAME,
    jobName: AI_WORKFLOW_JOB_NAME,
    jobId,
    workflowId: resolveWorkflowId(input.job, 'strict'),
    traceId: resolveTraceId(input.job, 'strict'),
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts(input.job),
    enqueuedAt: resolveDate(input.job.timestamp),
    startedAt: resolveDate(input.job.processedOn),
    finishedAt: resolveDate(input.job.finishedOn),
  };
}

export function mapAiWorkflowJobToFailInput(input: {
  readonly job: AiWorkflowJob;
  readonly error: Error;
}): ConsumeAiWorkflowJobFailInput {
  const occurredAt = resolveDate(input.job.finishedOn);
  const jobId = resolveJobId(input.job);
  return {
    queueName: AI_WORKFLOW_QUEUE_NAME,
    jobName: AI_WORKFLOW_JOB_NAME,
    jobId,
    workflowId: resolveWorkflowId(input.job, 'degraded'),
    traceId: resolveTraceId(input.job, 'degraded'),
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts(input.job),
    enqueuedAt: resolveDate(input.job.timestamp),
    startedAt: resolveDate(input.job.processedOn),
    finishedAt: occurredAt,
    occurredAt,
    reason: resolveWorkerFailedReason(input.error.message),
    error: input.error,
  };
}

export function mapMissingAiWorkflowJobToFailInput(input: {
  readonly error: Error;
  readonly occurredAt?: Date;
}): ConsumeAiWorkflowJobFailInput {
  const occurredAt = input.occurredAt ?? new Date();
  const jobId = `missing-job:${AI_WORKFLOW_JOB_NAME}:${occurredAt.getTime()}`;
  return {
    queueName: AI_WORKFLOW_QUEUE_NAME,
    jobName: AI_WORKFLOW_JOB_NAME,
    jobId,
    workflowId: `degraded-workflow:${AI_WORKFLOW_JOB_NAME}:${jobId}`,
    traceId: jobId,
    attemptsMade: 0,
    enqueuedAt: occurredAt,
    finishedAt: occurredAt,
    occurredAt,
    reason: `worker_event_job_missing:${input.error.message.slice(0, 96)}`,
    error: input.error,
  };
}

export function mapUnknownAiWorkflowJobToFailInput(input: {
  readonly job: AiWorkflowFailedJob;
  readonly error: Error;
}): ConsumeAiWorkflowJobFailInput {
  const occurredAt = resolveDate(input.job.finishedOn) ?? new Date();
  const jobName = input.job.name.trim() || 'unknown';
  const jobId = resolveJobId(input.job);
  return {
    queueName: AI_WORKFLOW_QUEUE_NAME,
    jobName,
    jobId,
    workflowId: resolveWorkflowId(input.job, 'degraded'),
    traceId: resolveTraceId(input.job, 'degraded'),
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts(input.job),
    enqueuedAt: resolveDate(input.job.timestamp),
    startedAt: resolveDate(input.job.processedOn),
    finishedAt: occurredAt,
    occurredAt,
    reason: `unsupported_ai_workflow_job:${jobName}:${input.error.message.slice(0, 96)}`,
    error: input.error,
  };
}

function resolveDate(timestamp?: number): Date | undefined {
  return typeof timestamp === 'number' && !Number.isNaN(timestamp)
    ? new Date(timestamp)
    : undefined;
}

function resolveMaxAttempts(job: AiWorkflowJob | AiWorkflowFailedJob): number | undefined {
  const attempts = job.opts.attempts;
  return typeof attempts === 'number' && !Number.isNaN(attempts) ? attempts : undefined;
}

function resolveJobId(job: AiWorkflowJob | AiWorkflowFailedJob): string {
  if (typeof job.id === 'number') return String(job.id);
  return job.id ?? `${job.name}:${job.timestamp}`;
}

function resolveTraceId(
  job: AiWorkflowJob | AiWorkflowFailedJob,
  mode: 'strict' | 'degraded',
): string {
  const payloadTraceId = readPayloadText(job.data, 'traceId');
  if (payloadTraceId) return payloadTraceId;
  if (mode === 'strict') throw new Error(`missing_payload_trace_id:${job.name}`);
  return `degraded-trace:${job.name}:${resolveJobId(job)}`;
}

function resolveWorkflowId(
  job: AiWorkflowJob | AiWorkflowFailedJob,
  mode: 'strict' | 'degraded',
): string {
  const workflowId = readPayloadText(job.data, 'workflowId');
  if (workflowId) return workflowId;
  if (mode === 'strict') throw new Error(`missing_payload_workflow_id:${job.name}`);
  return `degraded-workflow:${job.name}:${resolveJobId(job)}`;
}

function readPayloadText(payload: unknown, field: string): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const value = (payload as Record<string, unknown>)[field];
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
}

function resolveWorkerFailedReason(message: string): string {
  const normalizedMessage = message.trim() || 'worker_unknown_error';
  if (
    normalizedMessage.startsWith('worker_failed:') ||
    normalizedMessage.startsWith('missing_payload_trace_id') ||
    normalizedMessage.startsWith('missing_payload_workflow_id')
  ) {
    return normalizedMessage.slice(0, 128);
  }
  const prefix = 'worker_failed:';
  return `${prefix}${normalizedMessage.slice(0, Math.max(128 - prefix.length, 1))}`;
}
