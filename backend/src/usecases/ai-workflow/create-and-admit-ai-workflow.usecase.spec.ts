/// <reference types="jest" />
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import type {
  AiWorkflowContextMutationResult,
  AiWorkflowContextStatus,
  AiWorkflowContextView,
  CreateAiWorkflowContextResult,
} from '@src/modules/ai-workflow-context/ai-workflow-context.types';
import type { AiWorkflowContextService } from '@src/modules/ai-workflow-context/ai-workflow-context.service';
import type { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordView } from '@src/modules/async-task-record/async-task-record.types';
import type { AiWorkflowQueueService } from '@src/modules/ai-workflow-context/queue/ai-workflow-queue.service';
import type { QueueAiWorkflowQueueHealthResult } from '@src/modules/ai-workflow-context/queue/ai-workflow-queue.types';
import type { TransactionRunner } from '@src/usecases/common/ports/transaction-runner.contract';
import type { PinoLogger } from 'nestjs-pino';
import { CreateAndAdmitAiWorkflowUsecase } from './create-and-admit-ai-workflow.usecase';

type AiWorkflowContextServiceMock = {
  readonly createContext: jest.Mock<Promise<CreateAiWorkflowContextResult>>;
  readonly findByWorkflowId: jest.Mock<Promise<AiWorkflowContextView | null>>;
  readonly markAdmissionWaiting: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
  readonly markQueuedForAdmission: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
  readonly linkAsyncTaskRecord: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
};

type AiQueueServiceMock = {
  readonly checkWorkflowQueueAvailable: jest.Mock<Promise<QueueAiWorkflowQueueHealthResult>>;
  readonly enqueueWorkflow: jest.Mock<
    Promise<{ readonly jobId: string; readonly traceId: string }>
  >;
};

type AsyncTaskRecordServiceMock = {
  readonly recordEnqueued: jest.Mock<Promise<AsyncTaskRecordView>>;
};

type PinoLoggerMock = {
  readonly setContext: jest.Mock;
  readonly warn: jest.Mock;
};

describe('CreateAndAdmitAiWorkflowUsecase', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const transactionContext = Symbol(
    'transactionContext',
  ) as unknown as PersistenceTransactionContext;
  let aiWorkflowContextService: AiWorkflowContextServiceMock;
  let aiQueueService: AiQueueServiceMock;
  let asyncTaskRecordService: AsyncTaskRecordServiceMock;
  let transactionRunner: TransactionRunner;
  let logger: PinoLoggerMock;
  let usecase: CreateAndAdmitAiWorkflowUsecase;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    aiWorkflowContextService = {
      createContext: jest.fn(),
      findByWorkflowId: jest.fn(),
      markAdmissionWaiting: jest.fn(),
      markQueuedForAdmission: jest.fn(),
      linkAsyncTaskRecord: jest.fn(),
    };
    aiQueueService = {
      checkWorkflowQueueAvailable: jest.fn(),
      enqueueWorkflow: jest.fn(),
    };
    asyncTaskRecordService = {
      recordEnqueued: jest.fn(),
    };
    transactionRunner = {
      run: async <T>(
        callback: (transactionContext: PersistenceTransactionContext) => Promise<T>,
      ): Promise<T> => await callback(transactionContext),
    };
    logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
    };
    usecase = new CreateAndAdmitAiWorkflowUsecase(
      aiWorkflowContextService as unknown as AiWorkflowContextService,
      aiQueueService as unknown as AiWorkflowQueueService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      transactionRunner,
      logger as unknown as PinoLogger,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks admission waiting when workflow queue is unavailable', async () => {
    const created = createWorkflowContext({ status: 'CREATED' });
    const waiting = createWorkflowContext({
      status: 'ADMISSION_WAITING',
      nextEnqueueAt: new Date('2026-01-01T00:00:30.000Z'),
      admissionExpiresAt: new Date('2026-01-02T00:00:00.000Z'),
      admissionReason: 'QUEUE_UNAVAILABLE',
    });
    aiWorkflowContextService.createContext.mockResolvedValue({
      status: 'CREATED',
      context: created,
    });
    aiQueueService.checkWorkflowQueueAvailable.mockResolvedValue({
      available: false,
      reason: 'QUEUE_UNAVAILABLE',
    });
    aiWorkflowContextService.markAdmissionWaiting.mockResolvedValue({
      status: 'UPDATED',
      context: waiting,
    });

    const result = await usecase.execute(createInput());

    expect(result).toMatchObject({
      status: 'ADMISSION_WAITING',
      context: { workflowId: 'workflow-1' },
      reason: 'QUEUE_UNAVAILABLE',
    });
    expect(aiWorkflowContextService.markAdmissionWaiting).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      expectedStatuses: ['CREATED'],
      nextEnqueueAt: new Date('2026-01-01T00:00:30.000Z'),
      admissionExpiresAt: new Date('2026-01-02T00:00:00.000Z'),
      admissionReason: 'QUEUE_UNAVAILABLE',
      transactionContext,
    });
    expect(aiQueueService.enqueueWorkflow).not.toHaveBeenCalled();
    expect(asyncTaskRecordService.recordEnqueued).not.toHaveBeenCalled();
  });

  it('queues workflow and backfills async task record when queue is available', async () => {
    const created = createWorkflowContext({ status: 'CREATED' });
    const queued = createWorkflowContext({ status: 'QUEUED', jobId: 'queued-job' });
    const linked = createWorkflowContext({
      status: 'QUEUED',
      jobId: 'queued-job',
      asyncTaskRecordId: 88,
    });
    aiWorkflowContextService.createContext.mockResolvedValue({
      status: 'CREATED',
      context: created,
    });
    aiQueueService.checkWorkflowQueueAvailable.mockResolvedValue({ available: true });
    aiWorkflowContextService.markQueuedForAdmission.mockResolvedValue({
      status: 'UPDATED',
      context: queued,
    });
    aiQueueService.enqueueWorkflow.mockResolvedValue({ jobId: 'ignored', traceId: 'trace-1' });
    asyncTaskRecordService.recordEnqueued.mockResolvedValue(
      createAsyncTaskRecord({ id: 88, status: 'queued' }),
    );
    aiWorkflowContextService.linkAsyncTaskRecord.mockResolvedValue({
      status: 'UPDATED',
      context: linked,
    });

    const result = await usecase.execute(createInput());
    const generatedJobId = aiWorkflowContextService.markQueuedForAdmission.mock.calls[0][0].jobId;

    expect(generatedJobId).toMatch(/^aiw-/);
    expect(result).toMatchObject({
      status: 'QUEUED',
      context: { asyncTaskRecordId: 88 },
      jobId: generatedJobId,
      traceId: 'trace-1',
      asyncTaskRecordId: 88,
    });
    expect(aiQueueService.enqueueWorkflow).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      traceId: 'trace-1',
      jobId: generatedJobId,
    });
    expect(asyncTaskRecordService.recordEnqueued).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queueName: 'ai-workflow',
        jobName: 'workflow',
        jobId: generatedJobId,
        traceId: 'trace-1',
        bizType: 'ai_workflow',
        bizKey: 'trace-1',
        source: 'user_action',
        reason: 'enqueue_accepted',
      }),
    });
    expect(aiWorkflowContextService.linkAsyncTaskRecord).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: generatedJobId,
      asyncTaskRecordId: 88,
      expectedStatuses: ['QUEUED', 'PROCESSING'],
    });
  });

  it('returns stale queued when BullMQ enqueue fails after context is queued', async () => {
    const created = createWorkflowContext({ status: 'CREATED' });
    const queued = createWorkflowContext({ status: 'QUEUED' });
    aiWorkflowContextService.createContext.mockResolvedValue({
      status: 'CREATED',
      context: created,
    });
    aiQueueService.checkWorkflowQueueAvailable.mockResolvedValue({ available: true });
    aiWorkflowContextService.markQueuedForAdmission.mockResolvedValue({
      status: 'UPDATED',
      context: queued,
    });
    aiQueueService.enqueueWorkflow.mockRejectedValue(new Error('redis_down'));

    const result = await usecase.execute(createInput());

    expect(result).toMatchObject({
      status: 'STALE_QUEUED',
      context: { workflowId: 'workflow-1' },
      reason: 'ENQUEUE_FAILED',
    });
    expect(asyncTaskRecordService.recordEnqueued).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'ENQUEUE_FAILED' }),
      'AI workflow enqueue failed after context queued',
    );
  });

  it('returns stale queued when async task backfill fails after enqueue succeeds', async () => {
    const created = createWorkflowContext({ status: 'CREATED' });
    const queued = createWorkflowContext({ status: 'QUEUED' });
    aiWorkflowContextService.createContext.mockResolvedValue({
      status: 'CREATED',
      context: created,
    });
    aiQueueService.checkWorkflowQueueAvailable.mockResolvedValue({ available: true });
    aiWorkflowContextService.markQueuedForAdmission.mockResolvedValue({
      status: 'UPDATED',
      context: queued,
    });
    aiQueueService.enqueueWorkflow.mockResolvedValue({ jobId: 'ignored', traceId: 'trace-1' });
    asyncTaskRecordService.recordEnqueued.mockRejectedValue(new Error('db_down'));

    const result = await usecase.execute(createInput());

    expect(result).toMatchObject({
      status: 'STALE_QUEUED',
      context: { workflowId: 'workflow-1' },
      reason: 'POST_ENQUEUE_BACKFILL_FAILED',
    });
  });

  it('returns existing active when the existing context is not admission due', async () => {
    const existing = createWorkflowContext({ status: 'QUEUED', jobId: 'job-1' });
    aiWorkflowContextService.createContext.mockResolvedValue({
      status: 'EXISTING_ACTIVE',
      context: existing,
    });

    const result = await usecase.execute(createInput());

    expect(result).toEqual({
      status: 'EXISTING_ACTIVE',
      context: existing,
    });
    expect(aiQueueService.checkWorkflowQueueAvailable).not.toHaveBeenCalled();
  });
});

function createInput() {
  return {
    workflowType: 'generic_text_generate',
    workflowDedupKey: 'dedup-1',
    inputPayload: { prompt: 'hello' },
    traceId: 'trace-1',
    bizType: 'demo',
    bizKey: 'biz-1',
    source: 'user_action' as const,
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
    queueName: null,
    jobName: null,
    jobId: null,
    asyncTaskRecordId: null,
    bizType: 'demo',
    bizKey: 'biz-1',
    bizSubKey: null,
    source: 'user_action',
    actorAccountId: 123,
    actorActiveRole: 'owner',
    provider: 'mock',
    model: 'model-1',
    status: 'CREATED',
    inputPayloadJson: { prompt: 'hello' },
    outputPayloadJson: null,
    admissionAttemptCount: 0,
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
    source: 'user_action',
    reason: 'enqueue_accepted',
    occurredAt: timestamp,
    dedupKey: null,
    status: 'queued',
    attemptCount: 0,
    maxAttempts: null,
    enqueuedAt: timestamp,
    startedAt: null,
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
