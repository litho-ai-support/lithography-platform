import type { QueueAiResult } from '@src/modules/common/ai-queue/ai-queue.types';

interface QueueAiActorInput {
  readonly actorAccountId?: number | null;
  readonly actorActiveRole?: string | null;
}

export interface QueueAiGenerateUsecaseInput extends QueueAiActorInput {
  readonly provider?: unknown;
  readonly model: unknown;
  readonly prompt: unknown;
  readonly metadata?: Readonly<Record<string, string>> | null;
  readonly dedupKey?: unknown;
  readonly traceId?: unknown;
}

export interface QueueAiEmbedUsecaseInput extends QueueAiActorInput {
  readonly model: unknown;
  readonly text: unknown;
  readonly metadata?: Readonly<Record<string, string>> | null;
  readonly dedupKey?: unknown;
  readonly traceId?: unknown;
}

export type QueueAiUsecaseResult = QueueAiResult;
