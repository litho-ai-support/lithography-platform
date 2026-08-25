// src/modules/common/ai-queue/ai-queue.types.ts
import type { AiProvider } from '@app-types/common/ai-provider.types';

export interface QueueAiGenerateInput {
  readonly provider?: AiProvider;
  readonly model: string;
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly dedupKey?: string;
  readonly traceId?: string;
}

export interface QueueAiEmbedInput {
  readonly model: string;
  readonly text: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly dedupKey?: string;
  readonly traceId?: string;
}

export interface QueueAiResult {
  readonly jobId: string;
  readonly traceId: string;
}
