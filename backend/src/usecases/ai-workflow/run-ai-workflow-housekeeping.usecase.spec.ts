/// <reference types="jest" />
import type {
  AiWorkflowContextHousekeepingCandidate,
  AiWorkflowContextMutationResult,
  AiWorkflowContextStatus,
  AiWorkflowContextView,
} from '@src/modules/ai-workflow-context/ai-workflow-context.types';
import type { CapabilityStateReader } from '@src/modules/common/capability-state-reader.contract';
import type { AiWorkflowContextService } from '@src/modules/ai-workflow-context/ai-workflow-context.service';
import type { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';
import type {
  AsyncTaskRecordStatus,
  AsyncTaskRecordView,
} from '@src/modules/async-task-record/async-task-record.types';
import type { AiWorkflowQueueService } from '@src/modules/ai-workflow-context/queue/ai-workflow-queue.service';
import type { PinoLogger } from 'nestjs-pino';
import type { CreateAndAdmitAiWorkflowResult } from './ai-workflow-usecases.types';
import { CreateAndAdmitAiWorkflowUsecase } from './create-and-admit-ai-workflow.usecase';
import { RunAiWorkflowHousekeepingUsecase } from './run-ai-workflow-housekeeping.usecase';
import { createEnabledCapabilityStateReader } from '../../../test/support/capability/capability-state-reader.fixture';

type AiWorkflowContextServiceMock = {
  readonly listDueAdmissionWaitingContexts: jest.Mock<
    Promise<AiWorkflowContextHousekeepingCandidate[]>
  >;
  readonly listStaleQueuedContexts: jest.Mock<Promise<AiWorkflowContextHousekeepingCandidate[]>>;
  readonly listTerminalContextsForDrain: jest.Mock<
    Promise<AiWorkflowContextHousekeepingCandidate[]>
  >;
  readonly markFailed: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
  readonly linkAsyncTaskRecord: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
  readonly linkTerminalAsyncTaskRecordForDrain: jest.Mock<Promise<AiWorkflowContextMutationResult>>;
};

type AiQueueServiceMock = {
  readonly hasWorkflowJob: jest.Mock<Promise<{ readonly jobId: string; readonly exists: boolean }>>;
  readonly enqueueWorkflow: jest.Mock<
    Promise<{ readonly jobId: string; readonly traceId: string }>
  >;
};

type AsyncTaskRecordServiceMock = {
  readonly recordEnqueued: jest.Mock<Promise<AsyncTaskRecordView>>;
  readonly recordFinished: jest.Mock<Promise<AsyncTaskRecordView>>;
};

type AsyncTaskRecordQueryServiceMock = {
  readonly findById: jest.Mock<Promise<AsyncTaskRecordView | null>>;
  readonly findByQueueJob: jest.Mock<Promise<AsyncTaskRecordView | null>>;
};

type CreateAndAdmitAiWorkflowUsecaseMock = {
  readonly admitExisting: jest.Mock<Promise<CreateAndAdmitAiWorkflowResult>>;
};

type PinoLoggerMock = {
  readonly setContext: jest.Mock;
  readonly warn: jest.Mock;
};

describe('RunAiWorkflowHousekeepingUsecase', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  let aiWorkflowContextService: AiWorkflowContextServiceMock;
  let aiQueueService: AiQueueServiceMock;
  let asyncTaskRecordService: AsyncTaskRecordServiceMock;
  let asyncTaskRecordQueryService: AsyncTaskRecordQueryServiceMock;
  let createAndAdmitAiWorkflowUsecase: CreateAndAdmitAiWorkflowUsecaseMock;
  let logger: PinoLoggerMock;
  let usecase: RunAiWorkflowHousekeepingUsecase;

  beforeEach(() => {
    aiWorkflowContextService = {
      listDueAdmissionWaitingContexts: jest.fn().mockResolvedValue([]),
      listStaleQueuedContexts: jest.fn().mockResolvedValue([]),
      listTerminalContextsForDrain: jest.fn().mockResolvedValue([]),
      markFailed: jest.fn(),
      linkAsyncTaskRecord: jest.fn(),
      linkTerminalAsyncTaskRecordForDrain: jest.fn(),
    };
    aiQueueService = {
      hasWorkflowJob: jest.fn(),
      enqueueWorkflow: jest.fn(),
    };
    asyncTaskRecordService = {
      recordEnqueued: jest.fn(),
      recordFinished: jest.fn(),
    };
    asyncTaskRecordQueryService = {
      findById: jest.fn(),
      findByQueueJob: jest.fn(),
    };
    createAndAdmitAiWorkflowUsecase = {
      admitExisting: jest.fn(),
    };
    logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
    };
    usecase = new RunAiWorkflowHousekeepingUsecase(
      aiWorkflowContextService as unknown as AiWorkflowContextService,
      aiQueueService as unknown as AiWorkflowQueueService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      asyncTaskRecordQueryService as unknown as AsyncTaskRecordQueryService,
      createAndAdmitAiWorkflowUsecase as unknown as CreateAndAdmitAiWorkflowUsecase,
      logger as unknown as PinoLogger,
      createEnabledCapabilityStateReader(),
    );
  });

  it('drains only terminal owned facts when AI execution blocks workflow', async () => {
    const candidate = createCandidate({
      status: 'CANCELLED',
      queueName: 'ai-workflow',
      jobName: 'workflow',
      jobId: 'workflow-job-1',
      asyncTaskRecordId: 77,
    });
    aiWorkflowContextService.listTerminalContextsForDrain.mockResolvedValue([candidate]);
    asyncTaskRecordQueryService.findByQueueJob.mockResolvedValue(
      createAsyncTaskRecord({ id: 77, status: 'cancelled' }),
    );
    usecase = new RunAiWorkflowHousekeepingUsecase(
      aiWorkflowContextService as unknown as AiWorkflowContextService,
      aiQueueService as unknown as AiWorkflowQueueService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      asyncTaskRecordQueryService as unknown as AsyncTaskRecordQueryService,
      createAndAdmitAiWorkflowUsecase as unknown as CreateAndAdmitAiWorkflowUsecase,
      logger as unknown as PinoLogger,
      createAiExecutionBlockedReader(),
    );

    const result = await usecase.execute({ now });

    expect(result.admission).toEqual({ scanned: 0, succeeded: 0, skipped: 0, failed: 0 });
    expect(result.staleQueued).toEqual({ scanned: 0, succeeded: 0, skipped: 0, failed: 0 });
    expect(result.asyncTaskReconcile).toEqual({
      scanned: 1,
      succeeded: 0,
      skipped: 1,
      failed: 0,
    });
    expect(aiWorkflowContextService.listDueAdmissionWaitingContexts).not.toHaveBeenCalled();
    expect(aiWorkflowContextService.listStaleQueuedContexts).not.toHaveBeenCalled();
    expect(aiQueueService.hasWorkflowJob).not.toHaveBeenCalled();
    expect(aiWorkflowContextService.listTerminalContextsForDrain).toHaveBeenCalledTimes(1);
  });

  it('retries due admission waiting contexts', async () => {
    const candidate = createCandidate({
      status: 'ADMISSION_WAITING',
      nextEnqueueAt: new Date('2025-12-31T23:59:30.000Z'),
      admissionExpiresAt: new Date('2026-01-01T01:00:00.000Z'),
    });
    aiWorkflowContextService.listDueAdmissionWaitingContexts.mockResolvedValue([candidate]);
    createAndAdmitAiWorkflowUsecase.admitExisting.mockResolvedValue({
      status: 'ADMISSION_WAITING',
      context: createWorkflowContext({ status: 'ADMISSION_WAITING' }),
      reason: 'QUEUE_UNAVAILABLE',
    });

    const result = await usecase.execute({ now, limit: 10 });

    expect(result.admission).toEqual({
      scanned: 1,
      succeeded: 0,
      skipped: 1,
      failed: 0,
    });
    expect(createAndAdmitAiWorkflowUsecase.admitExisting).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      now,
    });
  });

  it('counts stale queued admission result as failed', async () => {
    const candidate = createCandidate({
      status: 'ADMISSION_WAITING',
      nextEnqueueAt: new Date('2025-12-31T23:59:30.000Z'),
      admissionExpiresAt: new Date('2026-01-01T01:00:00.000Z'),
    });
    aiWorkflowContextService.listDueAdmissionWaitingContexts.mockResolvedValue([candidate]);
    createAndAdmitAiWorkflowUsecase.admitExisting.mockResolvedValue({
      status: 'STALE_QUEUED',
      context: createWorkflowContext({ status: 'QUEUED', jobId: 'workflow-job-1' }),
      jobId: 'workflow-job-1',
      traceId: 'trace-1',
      reason: 'ENQUEUE_FAILED',
    });

    const result = await usecase.execute({ now, limit: 10 });

    expect(result.admission).toEqual({
      scanned: 1,
      succeeded: 0,
      skipped: 0,
      failed: 1,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'admission',
        workflowId: 'workflow-1',
        jobId: 'workflow-job-1',
        error: 'ENQUEUE_FAILED',
      }),
      'AI workflow housekeeping item failed',
    );
  });

  it('marks expired admission waiting contexts failed', async () => {
    const candidate = createCandidate({
      status: 'ADMISSION_WAITING',
      nextEnqueueAt: new Date('2025-12-31T23:59:30.000Z'),
      admissionExpiresAt: new Date('2025-12-31T23:59:59.000Z'),
    });
    aiWorkflowContextService.listDueAdmissionWaitingContexts.mockResolvedValue([candidate]);
    aiWorkflowContextService.markFailed.mockResolvedValue({
      status: 'UPDATED',
      context: createWorkflowContext({ status: 'FAILED' }),
    });

    const result = await usecase.execute({ now });

    expect(result.admission.succeeded).toBe(1);
    expect(createAndAdmitAiWorkflowUsecase.admitExisting).not.toHaveBeenCalled();
    expect(aiWorkflowContextService.markFailed).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      expectedStatuses: ['ADMISSION_WAITING'],
      errorCode: 'ADMISSION_TIMEOUT',
      errorMessage: 'ADMISSION_TIMEOUT',
    });
  });

  it('re-enqueues missing stale queued job and backfills async task record', async () => {
    const candidate = createCandidate({
      status: 'QUEUED',
      jobId: 'workflow-job-1',
      queueName: 'ai',
      jobName: 'workflow',
      asyncTaskRecordId: null,
      admissionExpiresAt: new Date('2026-01-01T01:00:00.000Z'),
    });
    aiWorkflowContextService.listStaleQueuedContexts.mockResolvedValue([candidate]);
    aiQueueService.hasWorkflowJob.mockResolvedValue({ jobId: 'workflow-job-1', exists: false });
    aiQueueService.enqueueWorkflow.mockResolvedValue({
      jobId: 'workflow-job-1',
      traceId: 'trace-1',
    });
    asyncTaskRecordService.recordEnqueued.mockResolvedValue(
      createAsyncTaskRecord({ id: 33, status: 'queued' }),
    );
    aiWorkflowContextService.linkAsyncTaskRecord.mockResolvedValue({
      status: 'UPDATED',
      context: createWorkflowContext({ status: 'QUEUED', asyncTaskRecordId: 33 }),
    });

    const result = await usecase.execute({ now, staleQueuedGraceMs: 60_000 });

    expect(result.staleQueued).toEqual({
      scanned: 1,
      succeeded: 1,
      skipped: 0,
      failed: 0,
    });
    expect(aiWorkflowContextService.listStaleQueuedContexts).toHaveBeenCalledWith({
      staleBefore: new Date('2025-12-31T23:59:00.000Z'),
      limit: 50,
    });
    expect(aiQueueService.enqueueWorkflow).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      traceId: 'trace-1',
      jobId: 'workflow-job-1',
    });
    expect(asyncTaskRecordService.recordEnqueued).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queueName: 'ai',
        jobName: 'workflow',
        jobId: 'workflow-job-1',
        traceId: 'trace-1',
        bizType: 'ai_workflow',
        bizKey: 'trace-1',
        source: 'user_action',
        reason: 'enqueue_accepted',
      }),
    });
    expect(aiWorkflowContextService.linkAsyncTaskRecord).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: 'workflow-job-1',
      asyncTaskRecordId: 33,
      expectedStatuses: ['QUEUED', 'PROCESSING'],
    });
  });

  it('skips stale queued repair only after verifying linked async task record exists', async () => {
    const candidate = createCandidate({
      status: 'QUEUED',
      jobId: 'workflow-job-1',
      queueName: 'ai',
      jobName: 'workflow',
      asyncTaskRecordId: 55,
    });
    aiWorkflowContextService.listStaleQueuedContexts.mockResolvedValue([candidate]);
    aiQueueService.hasWorkflowJob.mockResolvedValue({ jobId: 'workflow-job-1', exists: true });
    asyncTaskRecordQueryService.findById.mockResolvedValue(
      createAsyncTaskRecord({
        id: 55,
        queueName: 'ai',
        jobName: 'workflow',
        jobId: 'workflow-job-1',
        traceId: 'trace-1',
        status: 'queued',
      }),
    );

    const result = await usecase.execute({ now });

    expect(result.staleQueued).toEqual({
      scanned: 1,
      succeeded: 0,
      skipped: 1,
      failed: 0,
    });
    expect(asyncTaskRecordQueryService.findById).toHaveBeenCalledWith({ id: 55 });
    expect(asyncTaskRecordService.recordEnqueued).not.toHaveBeenCalled();
    expect(aiWorkflowContextService.linkAsyncTaskRecord).not.toHaveBeenCalled();
  });

  it('repairs stale queued context when linked async task record is dangling', async () => {
    const candidate = createCandidate({
      status: 'QUEUED',
      jobId: 'workflow-job-1',
      queueName: 'ai',
      jobName: 'workflow',
      asyncTaskRecordId: 55,
    });
    aiWorkflowContextService.listStaleQueuedContexts.mockResolvedValue([candidate]);
    aiQueueService.hasWorkflowJob.mockResolvedValue({ jobId: 'workflow-job-1', exists: true });
    asyncTaskRecordQueryService.findById.mockResolvedValue(null);
    asyncTaskRecordService.recordEnqueued.mockResolvedValue(
      createAsyncTaskRecord({ id: 66, status: 'queued' }),
    );
    aiWorkflowContextService.linkAsyncTaskRecord.mockResolvedValue({
      status: 'UPDATED',
      context: createWorkflowContext({ status: 'QUEUED', asyncTaskRecordId: 66 }),
    });

    const result = await usecase.execute({ now });

    expect(result.staleQueued).toEqual({
      scanned: 1,
      succeeded: 1,
      skipped: 0,
      failed: 0,
    });
    expect(asyncTaskRecordQueryService.findById).toHaveBeenCalledWith({ id: 55 });
    expect(asyncTaskRecordService.recordEnqueued).toHaveBeenCalledTimes(1);
    expect(aiWorkflowContextService.linkAsyncTaskRecord).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: 'workflow-job-1',
      asyncTaskRecordId: 66,
      expectedStatuses: ['QUEUED', 'PROCESSING'],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'staleQueued',
        workflowId: 'workflow-1',
        asyncTaskRecordId: 55,
        linkedRecordFound: false,
      }),
      'AI workflow linked async task record mismatch, attempting repair',
    );
  });

  it('marks expired stale queued contexts failed when queue job is missing', async () => {
    const candidate = createCandidate({
      status: 'QUEUED',
      jobId: 'workflow-job-1',
      admissionExpiresAt: new Date('2025-12-31T23:59:59.000Z'),
    });
    aiWorkflowContextService.listStaleQueuedContexts.mockResolvedValue([candidate]);
    aiQueueService.hasWorkflowJob.mockResolvedValue({ jobId: 'workflow-job-1', exists: false });
    aiWorkflowContextService.markFailed.mockResolvedValue({
      status: 'UPDATED',
      context: createWorkflowContext({ status: 'FAILED' }),
    });

    const result = await usecase.execute({ now });

    expect(result.staleQueued.succeeded).toBe(1);
    expect(aiQueueService.enqueueWorkflow).not.toHaveBeenCalled();
    expect(asyncTaskRecordService.recordEnqueued).not.toHaveBeenCalled();
    expect(aiWorkflowContextService.markFailed).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      expectedStatuses: ['QUEUED'],
      errorCode: 'ENQUEUE_REPAIR_TIMEOUT',
      errorMessage: 'ENQUEUE_REPAIR_TIMEOUT',
    });
  });

  it('reconciles cancelled terminal workflow to async task cancelled status', async () => {
    const candidate = createCandidate({
      status: 'CANCELLED',
      queueName: 'ai',
      jobName: 'workflow',
      jobId: 'workflow-job-1',
      asyncTaskRecordId: null,
    });
    aiWorkflowContextService.listTerminalContextsForDrain.mockResolvedValue([candidate]);
    asyncTaskRecordQueryService.findByQueueJob.mockResolvedValue(
      createAsyncTaskRecord({ status: 'processing', attemptCount: 2 }),
    );
    asyncTaskRecordService.recordFinished.mockResolvedValue(
      createAsyncTaskRecord({ id: 44, status: 'cancelled' }),
    );
    aiWorkflowContextService.linkTerminalAsyncTaskRecordForDrain.mockResolvedValue({
      status: 'UPDATED',
      context: createWorkflowContext({ status: 'CANCELLED', asyncTaskRecordId: 44 }),
    });

    const result = await usecase.execute({ now });

    expect(result.asyncTaskReconcile).toEqual({
      scanned: 1,
      succeeded: 1,
      skipped: 0,
      failed: 0,
    });
    expect(asyncTaskRecordService.recordFinished).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queueName: 'ai',
        jobName: 'workflow',
        jobId: 'workflow-job-1',
        traceId: 'trace-1',
        bizType: 'ai_workflow',
        bizKey: 'trace-1',
        source: 'system',
        status: 'cancelled',
        reason: 'worker_cancelled:workflow_reconciled',
        attemptCount: 2,
        finishedAt: now,
        occurredAt: now,
      }),
    });
    expect(aiWorkflowContextService.linkTerminalAsyncTaskRecordForDrain).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      jobId: 'workflow-job-1',
      asyncTaskRecordId: 44,
      expectedStatuses: ['CANCELLED'],
    });
  });

  it('does not overwrite an existing terminal async task record with a different terminal status', async () => {
    const candidate = createCandidate({
      status: 'CANCELLED',
      queueName: 'ai',
      jobName: 'workflow',
      jobId: 'workflow-job-1',
      asyncTaskRecordId: 77,
    });
    aiWorkflowContextService.listTerminalContextsForDrain.mockResolvedValue([candidate]);
    asyncTaskRecordQueryService.findByQueueJob.mockResolvedValue(
      createAsyncTaskRecord({
        id: 77,
        status: 'failed',
        reason: 'worker_failed:provider_error',
        finishedAt: new Date('2025-12-31T23:59:00.000Z'),
      }),
    );

    const result = await usecase.execute({ now });

    expect(result.asyncTaskReconcile).toEqual({
      scanned: 1,
      succeeded: 0,
      skipped: 1,
      failed: 0,
    });
    expect(asyncTaskRecordService.recordFinished).not.toHaveBeenCalled();
    expect(aiWorkflowContextService.linkTerminalAsyncTaskRecordForDrain).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'asyncTaskReconcile',
        workflowId: 'workflow-1',
        jobId: 'workflow-job-1',
        asyncTaskRecordId: 77,
        workflowStatus: 'CANCELLED',
        asyncTaskRecordStatus: 'failed',
        expectedStatus: 'cancelled',
      }),
      'AI workflow terminal async task record status mismatch',
    );
  });
});

function createAiExecutionBlockedReader(): CapabilityStateReader {
  return {
    getState: () => ({
      capabilityId: 'ai.workflow',
      configuredState: 'enabled',
      effectiveState: 'blocked',
      health: 'unknown',
      rootBlockers: [{ capabilityId: 'ai.execution', effectiveState: 'disabled' }],
    }),
    requireEnabled: () => {
      throw new Error('Capability is unavailable');
    },
  };
}

function createCandidate(
  overrides: Partial<AiWorkflowContextHousekeepingCandidate> & {
    readonly status?: AiWorkflowContextStatus;
  } = {},
): AiWorkflowContextHousekeepingCandidate {
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  return {
    workflowId: 'workflow-1',
    workflowType: 'generic_text_generate',
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
    status: 'ADMISSION_WAITING',
    nextEnqueueAt: null,
    admissionExpiresAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
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

function createAsyncTaskRecord(
  overrides: Partial<AsyncTaskRecordView> & { readonly status?: AsyncTaskRecordStatus } = {},
): AsyncTaskRecordView {
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 1,
    queueName: 'ai',
    jobName: 'workflow',
    jobId: 'workflow-job-1',
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
    maxAttempts: null,
    enqueuedAt: timestamp,
    startedAt: timestamp,
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
