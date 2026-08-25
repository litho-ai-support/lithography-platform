import type {
  AiWorkflowContextView,
  AiWorkflowJsonPayload,
} from '@src/modules/ai-workflow-context/ai-workflow-context.types';
import type { GenerateAiContentResult } from '@src/modules/common/ai-worker/ai-worker.types';

export interface AiWorkflowHandlerProcessInput {
  readonly context: AiWorkflowContextView;
  readonly inputPayload: AiWorkflowJsonPayload;
}

export interface AiWorkflowGenerateProviderCallResult {
  readonly taskType: 'generate';
  readonly result: GenerateAiContentResult;
  readonly providerStartedAtFallback: Date;
}

export interface AiWorkflowHandlerProcessResult {
  readonly outputPayload: AiWorkflowJsonPayload;
  readonly providerCall?: AiWorkflowGenerateProviderCallResult;
}

export interface AiWorkflowHandler {
  readonly workflowType: string;
  handle(input: AiWorkflowHandlerProcessInput): Promise<AiWorkflowHandlerProcessResult>;
}
