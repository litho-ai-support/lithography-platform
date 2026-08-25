// src/modules/common/email-queue/email-queue.types.ts
export interface QueueEmailInput {
  readonly to: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly templateId?: string;
  readonly meta?: Readonly<Record<string, string>>;
  readonly dedupKey?: string;
  readonly traceId?: string;
}

export interface QueueEmailResult {
  readonly jobId: string;
  readonly traceId: string;
}
