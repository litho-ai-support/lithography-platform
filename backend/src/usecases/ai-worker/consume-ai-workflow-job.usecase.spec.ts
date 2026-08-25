/// <reference types="jest" />
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { DomainError, THIRDPARTY_ERROR } from '@src/core/common/errors/domain-error';
import type {
  AiProviderCallRecordService,
  AiProviderCallRecordView,
} from '@src/modules/ai-provider-call-record/ai-provider-call-record.service';
import type { AiWorkflowContextService } from '@src/modules/ai-workflow-context/ai-workflow-context.service';
import type {
  AiWorkflowContextMutationResult,
  AiWorkflowContextStatus,
  AiWorkflowContextView,
  AiWorkflowPayloadReadResult,
} from '@src/modules/ai-workflow-context/ai-workflow-context.types';
import type { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordView } from '@src/modules/async-task-record/async-task-record.types';
import type { TransactionRunner } from '@src/usecases/common/ports/transaction-runner.contract';
import type { AiWorkflowHandlerRegistry } from './ai-workflow-handler.registry';
import type { AiWorkflowHandler } from './ai-workflow-handler.types';
import { AiWorkflowNonRetryableError } from './ai-workflow-worker-errors';
import { ConsumeAiWorkflowJobUsecase } from './consume-ai-workflow-job.usecase';
import type { ConsumeAiWorkflowJobProcessInput } from './consume-ai-workflow-job.types';

type AiWorkflowContextServiceMock = {
  readonly findByWorkflowId: jest.Mock<Promise<AiWorkflowContextView | null>>;
  readonly markProcessingForWorker: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
  readonly readInputPayload: jest.Mock<Promise<AiWorkflowPayloadReadResult>>;
  readonly writeOutputPayloadForWorker: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
  readonly markSucceededForWorker: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
  readonly markFailedForWorker: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
  readonly releaseProcessingForRetry: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
};

type AsyncTaskRecordServiceMock = {
  readonly recordStarted: jest.Mock<Promise<AsyncTaskRecordView>>;
  readonly recordFinished: jest.Mock<Promise<AsyncTaskRecordView>>;
};

type AiProviderCallRecordServiceMock = {
  readonly createRecord: jest.Mock<Promise<AiProviderCallRecordView>>;
};

type AiWorkflowHandlerRegistryMock = {
  readonly getHandler: jest.Mock<AiWorkflowHandler>;
};

describe('ConsumeAiWorkflowJobUsecase', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const transactionContext = Symbol(
    'transactionContext',
  ) as unknown as PersistenceTransactionContext;
  let aiWorkflowContextService: AiWorkflowContextServiceMock;
  let asyncTaskRecordService: AsyncTaskRecordServiceMock;
  let aiProviderCallRecordService: AiProviderCallRecordServiceMock;
  let handlerRegistry: AiWorkflowHandlerRegistryMock;
  let handler: AiWorkflowHandler;
  let transactionRunner: TransactionRunner;
  let usecase: ConsumeAiWorkflowJobUsecase;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    aiWorkflowContextService = {
      findByWorkflowId: jest.fn(),
      markProcessingForWorker: jest.fn(),
      readInputPayload: jest.fn(),
      writeOutputPayloadForWorker: jest.fn(),
      markSucceededForWorker: jest.fn(),
      markFailedForWorker: jest.fn(),
      releaseProcessingForRetry: jest.fn(),
    };
    asyncTaskRecordService = {
      recordStarted: jest.fn(),
      recordFinished: jest.fn(),
    };
    aiProviderCallRecordService = {
      createRecord: jest.fn(),
    };
    handler = {
      workflowType: 'generic_text_generate',
      handle: jest.fn(),
    };
    handlerRegistry = {
      getHandler: jest.fn(() => handler),
    };
    transactionRunner = {
      run: async <T>(
        callback: (transactionContext: PersistenceTransactionContext) => Promise<T>,
      ): Promise<T> => await callback(transactionContext),
    };
    usecase = new ConsumeAiWorkflowJobUsecase(
      aiWorkflowContextService as unknown as AiWorkflowContextService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      aiProviderCallRecordService as unknown as AiProviderCallRecordService,
      handlerRegistry as unknown as AiWorkflowHandlerRegistry,
      transactionRunner,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('processes queued workflow, writes output, records provider call, and marks succeeded', async () => {
    const queued = createWorkflowContext({ status: 'QUEUED' });
    const processing = createWorkflowContext({ status: 'PROCESSING' });
    const succeeded = createWorkflowContext({
      status: 'SUCCEEDED',
      outputPayloadJson: { outputText: 'ok' },
    });
    aiWorkflowContextService.findByWorkflowId.mockResolvedValue(queued);
    aiWorkflowContextService.markProcessingForWorker.mockResolvedValue({
      status: 'UPDATED',
      context: processing,
    });
    asyncTaskRecordService.recordStarted.mockResolvedValue(createAsyncTaskRecord({ id: 55 }));
    aiWorkflowContextService.readInputPayload.mockResolvedValue({
      kind: 'PRESENT',
      payload: { prompt: 'hello' },
    });
    jest.mocked(handler.handle).mockResolvedValue({
      outputPayload: { outputText: 'ok' },
      providerCall: {
        taskType: 'generate',
        result: {
          accepted: true,
          outputText: 'ok',
          provider: 'mock',
          model: 'model-1',
          providerJobId: 'provider-job-1',
        },
        providerStartedAtFallback: now,
      },
    });
    aiProviderCallRecordService.createRecord.mockResolvedValue(createProviderCallRecord());
    aiWorkflowContextService.writeOutputPayloadForWorker.mockResolvedValue({
      status: 'UPDATED',
      context: processing,
    });
    aiWorkflowContextService.markSucceededForWorker.mockResolvedValue({
      status: 'UPDATED',
      context: succeeded,
    });

    const result = await usecase.process(createProcessInput());

    expect(result).toEqual({
      accepted: true,
      workflowId: 'workflow-1',
      traceId: 'trace-1',
    });
    expect(aiWorkflowContextService.markProcessingForWorker).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: 'job-1',
      now,
      processingTimeoutMs: 15 * 60 * 1000,
    });
    expect(asyncTaskRecordService.recordStarted).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queueName: 'ai',
        jobName: 'workflow',
        jobId: 'job-1',
        traceId: 'trace-1',
        bizType: 'ai_workflow',
        bizKey: 'trace-1',
        reason: 'worker_processing',
        attemptCount: 1,
      }),
    });
    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledWith({
      data: expect.objectContaining({
        asyncTaskRecordId: 55,
        traceId: 'trace-1',
        bizType: 'demo',
        bizKey: 'biz-1',
        providerStatus: 'succeeded',
      }),
    });
    expect(aiWorkflowContextService.writeOutputPayloadForWorker).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: 'job-1',
      outputPayload: { outputText: 'ok' },
      expectedStatuses: ['PROCESSING'],
      transactionContext,
    });
    expect(aiWorkflowContextService.markSucceededForWorker).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: 'job-1',
      transactionContext,
    });
  });

  it('accepts already succeeded workflow idempotently without reprocessing', async () => {
    aiWorkflowContextService.findByWorkflowId.mockResolvedValue(
      createWorkflowContext({ status: 'SUCCEEDED' }),
    );

    const result = await usecase.process(createProcessInput());

    expect(result.accepted).toBe(true);
    expect(aiWorkflowContextService.markProcessingForWorker).not.toHaveBeenCalled();
    expect(handlerRegistry.getHandler).not.toHaveBeenCalled();
  });

  it('marks processing workflow failed when handler is missing', async () => {
    const queued = createWorkflowContext({ status: 'QUEUED' });
    const processing = createWorkflowContext({ status: 'PROCESSING' });
    aiWorkflowContextService.findByWorkflowId.mockResolvedValue(queued);
    aiWorkflowContextService.markProcessingForWorker.mockResolvedValue({
      status: 'UPDATED',
      context: processing,
    });
    asyncTaskRecordService.recordStarted.mockResolvedValue(createAsyncTaskRecord({ id: 56 }));
    aiWorkflowContextService.readInputPayload.mockResolvedValue({
      kind: 'PRESENT',
      payload: { prompt: 'hello' },
    });
    handlerRegistry.getHandler.mockImplementation(() => {
      throw new AiWorkflowNonRetryableError(
        'workflow_handler_not_found',
        'WORKFLOW_HANDLER_NOT_FOUND',
      );
    });
    aiWorkflowContextService.markFailedForWorker.mockResolvedValue({
      status: 'UPDATED',
      context: createWorkflowContext({
        status: 'FAILED',
        errorCode: 'WORKFLOW_HANDLER_NOT_FOUND',
      }),
    });

    await expect(usecase.process(createProcessInput())).rejects.toMatchObject({
      reason: 'WORKFLOW_HANDLER_NOT_FOUND',
    });

    expect(aiWorkflowContextService.markFailedForWorker).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: 'job-1',
      errorCode: 'WORKFLOW_HANDLER_NOT_FOUND',
      errorMessage: 'workflow_handler_not_found',
    });
    expect(aiWorkflowContextService.releaseProcessingForRetry).not.toHaveBeenCalled();
  });

  it('releases processing for BullMQ retry on transient non-final provider failure', async () => {
    const queued = createWorkflowContext({ status: 'QUEUED' });
    const processing = createWorkflowContext({ status: 'PROCESSING' });
    const providerError = new DomainError(
      THIRDPARTY_ERROR.PROVIDER_API_ERROR,
      'ai_provider_timeout',
      { provider: 'mock', providerErrorCode: 'timeout' },
    );
    aiWorkflowContextService.findByWorkflowId.mockResolvedValue(queued);
    aiWorkflowContextService.markProcessingForWorker.mockResolvedValue({
      status: 'UPDATED',
      context: processing,
    });
    asyncTaskRecordService.recordStarted.mockResolvedValue(createAsyncTaskRecord({ id: 57 }));
    aiWorkflowContextService.readInputPayload.mockResolvedValue({
      kind: 'PRESENT',
      payload: { prompt: 'hello' },
    });
    jest.mocked(handler.handle).mockRejectedValue(providerError);
    aiProviderCallRecordService.createRecord.mockResolvedValue(createProviderCallRecord());
    aiWorkflowContextService.releaseProcessingForRetry.mockResolvedValue({
      status: 'UPDATED',
      context: createWorkflowContext({ status: 'QUEUED' }),
    });

    await expect(
      usecase.process(createProcessInput({ attemptsMade: 0, maxAttempts: 3 })),
    ).rejects.toBe(providerError);

    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerStatus: 'failed',
        normalizedErrorCode: 'ai_provider_timeout',
        providerErrorCode: 'timeout',
      }),
    });
    expect(aiWorkflowContextService.releaseProcessingForRetry).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: 'job-1',
    });
    expect(aiWorkflowContextService.markFailedForWorker).not.toHaveBeenCalled();
  });

  it('marks workflow failed on final transient provider failure', async () => {
    const queued = createWorkflowContext({ status: 'QUEUED' });
    const processing = createWorkflowContext({ status: 'PROCESSING' });
    const providerError = new DomainError(
      THIRDPARTY_ERROR.PROVIDER_API_ERROR,
      'ai_provider_timeout',
      { provider: 'mock' },
    );
    aiWorkflowContextService.findByWorkflowId.mockResolvedValue(queued);
    aiWorkflowContextService.markProcessingForWorker.mockResolvedValue({
      status: 'UPDATED',
      context: processing,
    });
    asyncTaskRecordService.recordStarted.mockResolvedValue(createAsyncTaskRecord({ id: 58 }));
    aiWorkflowContextService.readInputPayload.mockResolvedValue({
      kind: 'PRESENT',
      payload: { prompt: 'hello' },
    });
    jest.mocked(handler.handle).mockRejectedValue(providerError);
    aiProviderCallRecordService.createRecord.mockResolvedValue(createProviderCallRecord());
    aiWorkflowContextService.markFailedForWorker.mockResolvedValue({
      status: 'UPDATED',
      context: createWorkflowContext({ status: 'FAILED' }),
    });

    await expect(
      usecase.process(createProcessInput({ attemptsMade: 2, maxAttempts: 3 })),
    ).rejects.toBe(providerError);

    expect(aiWorkflowContextService.markFailedForWorker).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: 'job-1',
      errorCode: 'WORKFLOW_PROVIDER_FAILED',
      errorMessage: 'ai_provider_timeout',
    });
    expect(aiWorkflowContextService.releaseProcessingForRetry).not.toHaveBeenCalled();
  });

  it('records cancelled terminal status in failed event when workflow was cancelled', async () => {
    aiWorkflowContextService.findByWorkflowId.mockResolvedValue(
      createWorkflowContext({ status: 'CANCELLED' }),
    );
    asyncTaskRecordService.recordFinished.mockResolvedValue(
      createAsyncTaskRecord({ status: 'cancelled' }),
    );

    await usecase.fail({
      ...createProcessInput(),
      finishedAt: now,
      occurredAt: now,
      reason: 'worker_failed:workflow_already_terminal',
    });

    expect(asyncTaskRecordService.recordFinished).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'cancelled',
        reason: 'worker_cancelled:workflow_already_terminal',
      }),
    });
    expect(aiWorkflowContextService.markFailedForWorker).not.toHaveBeenCalled();
    expect(aiWorkflowContextService.releaseProcessingForRetry).not.toHaveBeenCalled();
  });
});

function createProcessInput(
  overrides: Partial<ConsumeAiWorkflowJobProcessInput> = {},
): ConsumeAiWorkflowJobProcessInput {
  return {
    queueName: 'ai',
    jobName: 'workflow',
    jobId: 'job-1',
    workflowId: 'workflow-1',
    traceId: 'trace-1',
    attemptsMade: 0,
    maxAttempts: 1,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createWorkflowContext(
  overrides: Partial<AiWorkflowContextView> & { readonly status?: AiWorkflowContextStatus } = {},
): AiWorkflowContextView {
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  return {
    workflowId: 'workflow-1',
    workflowType: 'generic_text_generate',
    workflowDedupHash: Buffer.alloc(32, 1),
    workflowDedupActiveHash: Buffer.alloc(32, 1),
    traceId: 'trace-1',
    queueName: 'ai',
    jobName: 'workflow',
    jobId: 'job-1',
    asyncTaskRecordId: null,
    bizType: 'demo',
    bizKey: 'biz-1',
    bizSubKey: null,
    source: 'user_action',
    actorAccountId: 123,
    actorActiveRole: 'owner',
    provider: 'mock',
    model: 'model-1',
    status: 'QUEUED',
    inputPayloadJson: { prompt: 'hello' },
    outputPayloadJson: null,
    admissionAttemptCount: 1,
    nextEnqueueAt: null,
    admissionExpiresAt: null,
    admissionReason: null,
    errorCode: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function createAsyncTaskRecord(overrides: Partial<AsyncTaskRecordView> = {}): AsyncTaskRecordView {
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 1,
    queueName: 'ai',
    jobName: 'workflow',
    jobId: 'job-1',
    traceId: 'trace-1',
    actorAccountId: 123,
    actorActiveRole: 'owner',
    bizType: 'ai_workflow',
    bizKey: 'trace-1',
    bizSubKey: null,
    source: 'system',
    reason: 'worker_processing',
    occurredAt: timestamp,
    dedupKey: null,
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 1,
    enqueuedAt: timestamp,
    startedAt: timestamp,
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function createProviderCallRecord(
  overrides: Partial<AiProviderCallRecordView> = {},
): AiProviderCallRecordView {
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 1,
    asyncTaskRecordId: 55,
    traceId: 'trace-1',
    callSeq: 1,
    accountId: null,
    nicknameSnapshot: null,
    bizType: 'demo',
    bizKey: 'biz-1',
    bizSubKey: null,
    source: 'system',
    provider: 'mock',
    model: 'model-1',
    taskType: 'generate',
    providerRequestId: 'provider-job-1',
    providerStatus: 'succeeded',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    costAmount: null,
    costCurrency: null,
    normalizedErrorCode: null,
    providerErrorCode: null,
    errorMessage: null,
    providerStartedAt: timestamp,
    providerFinishedAt: timestamp,
    providerLatencyMs: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
