import type { AiWorkflowGenerateProviderCallResult } from './ai-workflow-handler.types';

export class AiWorkflowNonRetryableError extends Error {
  constructor(
    message: string,
    readonly reason: string,
    readonly providerCall?: AiWorkflowGenerateProviderCallResult,
  ) {
    super(message);
    this.name = 'AiWorkflowNonRetryableError';
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AiWorkflowNonRetryableError);
    }
  }
}

export function isAiWorkflowNonRetryableError(
  error: unknown,
): error is AiWorkflowNonRetryableError {
  return error instanceof AiWorkflowNonRetryableError;
}
