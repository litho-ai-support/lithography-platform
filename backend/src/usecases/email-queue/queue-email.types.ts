import type { QueueEmailResult } from '@src/modules/common/email-queue/email-queue.types';

export interface QueueEmailUsecaseInput {
  readonly to: unknown;
  readonly subject: unknown;
  readonly text?: unknown;
  readonly html?: unknown;
  readonly templateId?: unknown;
  readonly meta?: Readonly<Record<string, string>> | null;
  readonly dedupKey?: unknown;
  readonly traceId?: unknown;
}

export type QueueEmailUsecaseResult = QueueEmailResult;
