import type {
  EmbedAiContentInput,
  GenerateAiContentInput,
} from '@src/modules/common/ai-worker/ai-worker.types';

export interface ConsumeAiGenerateJobProcessInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly payload: GenerateAiContentInput;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
}

export interface ConsumeAiGenerateJobCompleteInput {
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

export interface ConsumeAiGenerateJobFailInput extends ConsumeAiGenerateJobCompleteInput {
  readonly bizType?: 'ai_generation' | 'ai_worker';
  readonly bizKey?: string;
  readonly reason?: string;
  readonly occurredAt?: Date;
  readonly error?: unknown;
}

export interface ConsumeAiEmbedJobProcessInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly payload: EmbedAiContentInput;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
}

export interface ConsumeAiEmbedJobCompleteInput {
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

export interface ConsumeAiEmbedJobFailInput extends ConsumeAiEmbedJobCompleteInput {
  readonly bizType?: 'ai_embedding' | 'ai_worker';
  readonly bizKey?: string;
  readonly reason?: string;
  readonly occurredAt?: Date;
  readonly error?: unknown;
}
