export interface QueueAiWorkflowInput {
  readonly workflowId: string;
  readonly traceId: string;
  readonly jobId: string;
}

export interface QueueAiWorkflowResult {
  readonly jobId: string;
  readonly traceId: string;
}

export interface QueueAiWorkflowJobExistenceInput {
  readonly jobId: string;
}

export interface QueueAiWorkflowJobExistenceResult {
  readonly jobId: string;
  readonly exists: boolean;
}

export type QueueAiWorkflowQueueHealthResult =
  | { readonly available: true }
  | { readonly available: false; readonly reason: 'QUEUE_UNAVAILABLE' };
