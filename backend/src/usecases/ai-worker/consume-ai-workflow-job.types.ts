export interface ConsumeAiWorkflowJobProcessInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly workflowId: string;
  readonly traceId: string;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
}

export interface ConsumeAiWorkflowJobCompleteInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly workflowId: string;
  readonly traceId: string;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
}

export interface ConsumeAiWorkflowJobFailInput extends ConsumeAiWorkflowJobCompleteInput {
  readonly reason?: string;
  readonly occurredAt?: Date;
  readonly error?: unknown;
}

export interface ConsumeAiWorkflowJobProcessResult {
  readonly accepted: boolean;
  readonly workflowId: string;
  readonly traceId: string;
}
