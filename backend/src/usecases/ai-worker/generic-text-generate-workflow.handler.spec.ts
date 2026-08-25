import type { AiWorkflowContextView } from '@src/modules/ai-workflow-context/ai-workflow-context.types';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import type {
  GenerateAiContentInput,
  GenerateAiContentResult,
} from '@src/modules/common/ai-worker/ai-worker.types';
import {
  GENERIC_TEXT_GENERATE_PROMPT_MAX_CHARS,
  GENERIC_TEXT_GENERATE_WORKFLOW_TYPE,
  GenericTextGenerateWorkflowHandler,
} from './generic-text-generate-workflow.handler';
import { AiWorkflowNonRetryableError } from './ai-workflow-worker-errors';

type AiWorkerServiceMock = {
  readonly generate: jest.Mock<Promise<GenerateAiContentResult>, [GenerateAiContentInput]>;
};

describe('GenericTextGenerateWorkflowHandler', () => {
  let aiWorkerService: AiWorkerServiceMock;
  let handler: GenericTextGenerateWorkflowHandler;

  beforeEach(() => {
    aiWorkerService = {
      generate: jest.fn(),
    };
    handler = new GenericTextGenerateWorkflowHandler(aiWorkerService as unknown as AiWorkerService);
  });

  it('maps generic text generate payload to AI generate provider call', async () => {
    aiWorkerService.generate.mockResolvedValue({
      accepted: true,
      outputText: 'generated text',
      provider: 'mock',
      model: 'gpt-4o-mini',
      providerJobId: 'provider-job-1',
      providerRequestId: 'provider-request-1',
      providerStatus: 'succeeded',
      providerStartedAt: new Date('2026-01-01T00:00:00.000Z'),
      providerFinishedAt: new Date('2026-01-01T00:00:01.000Z'),
    });

    const result = await handler.handle({
      context: createContext(),
      inputPayload: {
        userPrompt: 'Write a short answer.',
        systemPrompt: 'Be concise.',
        context: 'Audience: developers.',
        provider: 'openai',
        model: 'gpt-4o-mini',
      },
    });

    expect(aiWorkerService.generate).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: [
        'System:\nBe concise.',
        'Context:\nAudience: developers.',
        'User:\nWrite a short answer.',
      ].join('\n\n'),
      metadata: {
        workflowId: 'workflow-1',
        workflowType: GENERIC_TEXT_GENERATE_WORKFLOW_TYPE,
        traceId: 'trace-1',
      },
    });
    expect(result.outputPayload).toEqual({
      outputText: 'generated text',
      provider: 'mock',
      model: 'gpt-4o-mini',
      providerJobId: 'provider-job-1',
      providerRequestId: 'provider-request-1',
    });
    expect(result.providerCall).toMatchObject({
      taskType: 'generate',
      result: {
        providerJobId: 'provider-job-1',
      },
    });
  });

  it('allows missing optional provider and prompt context', async () => {
    aiWorkerService.generate.mockResolvedValue({
      accepted: true,
      outputText: 'generated text',
      provider: 'mock',
      model: 'gpt-4o-mini',
      providerJobId: 'provider-job-2',
      providerRequestId: null,
    });

    const result = await handler.handle({
      context: createContext({ provider: null }),
      inputPayload: {
        userPrompt: 'Only user text.',
        model: 'gpt-4o-mini',
      },
    });

    expect(aiWorkerService.generate).toHaveBeenCalledWith({
      provider: undefined,
      model: 'gpt-4o-mini',
      prompt: 'User:\nOnly user text.',
      metadata: {
        workflowId: 'workflow-1',
        workflowType: GENERIC_TEXT_GENERATE_WORKFLOW_TYPE,
        traceId: 'trace-1',
      },
    });
    expect(result.outputPayload).toEqual({
      outputText: 'generated text',
      provider: 'mock',
      model: 'gpt-4o-mini',
      providerJobId: 'provider-job-2',
      providerRequestId: null,
    });
  });

  it('rejects invalid payload as non-retryable without provider call', async () => {
    await expect(
      handler.handle({
        context: createContext(),
        inputPayload: {
          userPrompt: '',
          model: 'gpt-4o-mini',
        },
      }),
    ).rejects.toMatchObject({
      reason: 'WORKFLOW_INPUT_PAYLOAD_INVALID',
    } satisfies Partial<AiWorkflowNonRetryableError>);

    expect(aiWorkerService.generate).not.toHaveBeenCalled();
  });

  it('rejects provider or model snapshot mismatch as non-retryable', async () => {
    await expect(
      handler.handle({
        context: createContext({ provider: 'qwen' }),
        inputPayload: {
          userPrompt: 'Use mismatched provider.',
          provider: 'openai',
          model: 'gpt-4o-mini',
        },
      }),
    ).rejects.toMatchObject({
      reason: 'WORKFLOW_INPUT_PAYLOAD_INVALID',
    } satisfies Partial<AiWorkflowNonRetryableError>);

    await expect(
      handler.handle({
        context: createContext({ model: 'qwen-plus' }),
        inputPayload: {
          userPrompt: 'Use mismatched model.',
          provider: 'openai',
          model: 'gpt-4o-mini',
        },
      }),
    ).rejects.toMatchObject({
      reason: 'WORKFLOW_INPUT_PAYLOAD_INVALID',
    } satisfies Partial<AiWorkflowNonRetryableError>);

    expect(aiWorkerService.generate).not.toHaveBeenCalled();
  });

  it('rejects oversized composed prompt as non-retryable', async () => {
    await expect(
      handler.handle({
        context: createContext({ provider: null }),
        inputPayload: {
          userPrompt: 'x'.repeat(GENERIC_TEXT_GENERATE_PROMPT_MAX_CHARS + 1),
          model: 'gpt-4o-mini',
        },
      }),
    ).rejects.toMatchObject({
      reason: 'WORKFLOW_INPUT_PAYLOAD_INVALID',
    } satisfies Partial<AiWorkflowNonRetryableError>);

    expect(aiWorkerService.generate).not.toHaveBeenCalled();
  });
});

function createContext(overrides: Partial<AiWorkflowContextView> = {}): AiWorkflowContextView {
  const context: AiWorkflowContextView = {
    workflowId: 'workflow-1',
    workflowType: GENERIC_TEXT_GENERATE_WORKFLOW_TYPE,
    workflowDedupHash: null,
    workflowDedupActiveHash: null,
    traceId: 'trace-1',
    queueName: 'ai',
    jobName: 'workflow',
    jobId: 'workflow-job-1',
    asyncTaskRecordId: null,
    bizType: 'ai_workflow',
    bizKey: 'trace-1',
    bizSubKey: null,
    source: 'system',
    actorAccountId: null,
    actorActiveRole: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'PROCESSING',
    inputPayloadJson: {
      userPrompt: 'Write a short answer.',
      model: 'gpt-4o-mini',
    },
    outputPayloadJson: null,
    admissionAttemptCount: 1,
    nextEnqueueAt: null,
    admissionExpiresAt: null,
    admissionReason: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  return {
    ...context,
    ...overrides,
  };
}
