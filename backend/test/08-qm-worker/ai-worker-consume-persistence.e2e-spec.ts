// test/08-qm-worker/ai-worker-consume-persistence.e2e-spec.ts
import type {
  EmbedAiContentInput,
  EmbedAiContentResult,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from '@core/ai/ai-provider.interface';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { WorkerModule } from '@src/bootstraps/worker/worker.module';
import { DomainError, THIRDPARTY_ERROR } from '@src/core/common/errors/domain-error';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqWorkerRuntime } from '@src/infrastructure/bullmq/worker.runtime';
import { AiProviderCallRecordEntity } from '@src/modules/ai-provider-call-record/ai-provider-call-record.entity';
import { AsyncTaskRecordEntity } from '@src/modules/async-task-record/async-task-record.entity';
import type { AsyncTaskRecordStatus } from '@src/modules/async-task-record/async-task-record.types';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';

type FinalJobState = 'completed' | 'failed';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class MockAiWorkerService {
  readonly generateCalls: GenerateAiContentInput[] = [];
  readonly embedCalls: EmbedAiContentInput[] = [];
  private readonly generateAttemptsByPrompt = new Map<string, number>();
  private readonly embedAttemptsByText = new Map<string, number>();

  async generate(input: GenerateAiContentInput): Promise<GenerateAiContentResult> {
    this.generateCalls.push(input);
    const slowMs = this.resolveSlowMs({ content: input.prompt });
    if (slowMs > 0) {
      await sleep(slowMs);
    }
    if (input.prompt.includes('__PRECHECK_FAIL__')) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
        `unsupported_ai_provider:${input.provider ?? 'unknown'}`,
      );
    }
    const attemptKey = `${input.model}:${input.prompt}`;
    const currentAttempt = (this.generateAttemptsByPrompt.get(attemptKey) ?? 0) + 1;
    this.generateAttemptsByPrompt.set(attemptKey, currentAttempt);
    if (input.prompt.includes('__RETRY_SUCCESS_2__') && currentAttempt <= 2) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_API_ERROR,
        `Mock AI transient failure ${currentAttempt}`,
        {
          provider: input.provider ?? 'openai',
        },
      );
    }
    if (input.prompt.includes('__RETRY_EXHAUST__')) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_API_ERROR,
        `Mock AI exhausted failure ${currentAttempt}`,
        {
          provider: input.provider ?? 'openai',
        },
      );
    }
    if (input.prompt.includes('__FAIL_GENERATE__')) {
      throw new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, 'Mock AI generate failure', {
        provider: input.provider ?? 'openai',
      });
    }
    if (input.prompt.includes('__FAIL_WITH_ERROR_DETAILS__')) {
      throw new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, 'ai_provider_auth_failed', {
        provider: input.provider ?? 'openai',
        providerErrorCode: 'invalid_api_key',
      });
    }
    if (input.prompt.includes('__FULL_USAGE__')) {
      const providerStartedAt = new Date(Date.now() - 321);
      const providerFinishedAt = new Date(providerStartedAt.getTime() + 321);
      return {
        accepted: true,
        outputText: `mock-output:${input.prompt.trim()}`,
        provider: 'mock',
        model: input.model,
        providerJobId: `mock-g-${this.generateCalls.length}`,
        providerRequestId: `mock-req-${this.generateCalls.length}`,
        providerStatus: 'succeeded',
        promptTokens: 123,
        completionTokens: 45,
        totalTokens: 168,
        costAmount: '0.01234567',
        costCurrency: 'USD',
        normalizedErrorCode: null,
        providerErrorCode: null,
        errorMessage: null,
        providerStartedAt,
        providerFinishedAt,
        providerLatencyMs: 321,
      };
    }
    return {
      accepted: true,
      outputText: `mock-output:${input.prompt.trim()}`,
      provider: 'mock',
      model: input.model,
      providerJobId: `mock-g-${this.generateCalls.length}`,
    };
  }

  async embed(input: EmbedAiContentInput): Promise<EmbedAiContentResult> {
    this.embedCalls.push(input);
    const slowMs = this.resolveSlowMs({ content: input.text });
    if (slowMs > 0) {
      await sleep(slowMs);
    }
    if (input.text.includes('__PRECHECK_FAIL__')) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
        'unsupported_ai_embedding_model',
      );
    }
    const attemptKey = `${input.model}:${input.text}`;
    const currentAttempt = (this.embedAttemptsByText.get(attemptKey) ?? 0) + 1;
    this.embedAttemptsByText.set(attemptKey, currentAttempt);
    if (input.text.includes('__RETRY_SUCCESS_2__') && currentAttempt <= 2) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_API_ERROR,
        `Mock AI embed transient failure ${currentAttempt}`,
        {
          provider: 'mock-embed',
        },
      );
    }
    if (input.text.includes('__RETRY_EXHAUST__')) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_API_ERROR,
        `Mock AI embed exhausted failure ${currentAttempt}`,
        {
          provider: 'mock-embed',
        },
      );
    }
    if (input.text.includes('__FAIL_EMBED__')) {
      throw new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, 'Mock AI embed failure', {
        provider: 'mock-embed',
      });
    }
    if (input.text.includes('__FAIL_WITH_ERROR_DETAILS__')) {
      throw new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, 'ai_provider_auth_failed', {
        provider: 'mock-embed',
        providerErrorCode: 'embed_auth_failed',
      });
    }
    if (input.text.includes('__FULL_USAGE__')) {
      const providerStartedAt = new Date(Date.now() - 222);
      const providerFinishedAt = new Date(providerStartedAt.getTime() + 222);
      return {
        accepted: true,
        vector: [0.11, 0.22, 0.33, 0.44],
        provider: 'mock',
        model: input.model,
        providerJobId: `mock-e-${this.embedCalls.length}`,
        providerRequestId: `mock-embed-req-${this.embedCalls.length}`,
        providerStatus: 'succeeded',
        promptTokens: 222,
        completionTokens: 0,
        totalTokens: 222,
        costAmount: '0.00012000',
        costCurrency: 'USD',
        normalizedErrorCode: null,
        providerErrorCode: null,
        errorMessage: null,
        providerStartedAt,
        providerFinishedAt,
        providerLatencyMs: 222,
      };
    }
    return {
      accepted: true,
      vector: [0.11, 0.22, 0.33, 0.44],
      provider: 'mock',
      model: input.model,
      providerJobId: `mock-e-${this.embedCalls.length}`,
    };
  }

  private resolveSlowMs(input: { readonly content: string }): number {
    const matched = input.content.match(/__SLOW_MS_(\d+)__/);
    if (!matched) {
      return 0;
    }
    const parsed = Number(matched[1]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(parsed, 5000);
  }
}

const enqueueAiGenerate = async (input: {
  readonly queue: Queue;
  readonly jobId: string;
  readonly prompt: string;
  readonly traceId?: string;
  readonly attempts?: number;
}): Promise<void> => {
  const traceId = input.traceId ?? `ai-generate-e2e-trace:${input.jobId}`;
  await input.queue.add(
    BULLMQ_JOBS.AI.GENERATE,
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: input.prompt,
      traceId,
      metadata: {
        source: 'e2e-ai-generate-persistence',
      },
    },
    {
      jobId: input.jobId,
      attempts: input.attempts ?? 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  );
};

const enqueueAiEmbed = async (input: {
  readonly queue: Queue;
  readonly jobId: string;
  readonly text: string;
  readonly traceId?: string;
  readonly attempts?: number;
}): Promise<void> => {
  const traceId = input.traceId ?? `ai-embed-e2e-trace:${input.jobId}`;
  await input.queue.add(
    BULLMQ_JOBS.AI.EMBED,
    {
      model: 'text-embedding-3-small',
      text: input.text,
      traceId,
      metadata: {
        source: 'e2e-ai-embed-persistence',
      },
    },
    {
      jobId: input.jobId,
      attempts: input.attempts ?? 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  );
};

const waitJobFinalState = async (input: {
  readonly queue: Queue;
  readonly jobId: string;
  readonly timeoutMs: number;
  readonly pollMs: number;
}): Promise<{
  readonly state: FinalJobState;
  readonly returnvalue: unknown;
  readonly failedReason: string | undefined;
}> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const job = await input.queue.getJob(input.jobId);
    if (job) {
      const state = await job.getState();
      if (state === 'completed' || state === 'failed') {
        return {
          state,
          returnvalue: job.returnvalue,
          failedReason: job.failedReason,
        };
      }
    }
    await sleep(input.pollMs);
  }
  throw new Error(`AI job did not reach final state in time: ${input.jobId}`);
};

const findAsyncTaskRecord = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly jobId: string;
}): Promise<AsyncTaskRecordEntity | null> => {
  return await input.dataSource.getRepository(AsyncTaskRecordEntity).findOne({
    where: { queueName: input.queueName, jobId: input.jobId },
  });
};

const waitAsyncTaskRecord = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly jobId: string;
  readonly timeoutMs: number;
  readonly pollMs: number;
  readonly statuses?: ReadonlyArray<AsyncTaskRecordStatus>;
}): Promise<AsyncTaskRecordEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const record = await findAsyncTaskRecord({
      dataSource: input.dataSource,
      queueName: input.queueName,
      jobId: input.jobId,
    });
    if (record && (!input.statuses || input.statuses.includes(record.status))) {
      return record;
    }
    await sleep(input.pollMs);
  }
  throw new Error(`AI async task record did not reach expected state in time: ${input.jobId}`);
};

const waitLatestProviderCallRecord = async (input: {
  readonly dataSource: DataSource;
  readonly traceId: string;
  readonly status?: 'succeeded' | 'failed';
  readonly timeoutMs: number;
  readonly pollMs: number;
}): Promise<AiProviderCallRecordEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const where =
      input.status === undefined
        ? { traceId: input.traceId }
        : { traceId: input.traceId, providerStatus: input.status };
    const record = await input.dataSource.getRepository(AiProviderCallRecordEntity).findOne({
      where,
      order: { id: 'DESC' },
    });
    if (record) {
      return record;
    }
    await sleep(input.pollMs);
  }
  throw new Error(`AI provider call record was not created in time: ${input.traceId}`);
};

const countProviderCallRecordByTraceId = async (input: {
  readonly dataSource: DataSource;
  readonly traceId: string;
}): Promise<number> => {
  return await input.dataSource.getRepository(AiProviderCallRecordEntity).count({
    where: { traceId: input.traceId },
  });
};

const listProviderCallRecordsByTraceId = async (input: {
  readonly dataSource: DataSource;
  readonly traceId: string;
}): Promise<AiProviderCallRecordEntity[]> => {
  return await input.dataSource.getRepository(AiProviderCallRecordEntity).find({
    where: { traceId: input.traceId },
    order: { callSeq: 'ASC', id: 'ASC' },
  });
};

const waitProviderCallRecordCount = async (input: {
  readonly dataSource: DataSource;
  readonly traceId: string;
  readonly expectedCount: number;
  readonly timeoutMs: number;
  readonly pollMs: number;
}): Promise<AiProviderCallRecordEntity[]> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const records = await listProviderCallRecordsByTraceId({
      dataSource: input.dataSource,
      traceId: input.traceId,
    });
    if (records.length === input.expectedCount) {
      return records;
    }
    await sleep(input.pollMs);
  }
  throw new Error(
    `AI provider call record count mismatch: traceId=${input.traceId}, expected=${input.expectedCount}`,
  );
};

const recordAiEnqueued = async (input: {
  readonly asyncTaskRecordService: AsyncTaskRecordService;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly maxAttempts?: number;
}): Promise<void> => {
  const bizType = input.jobName === BULLMQ_JOBS.AI.EMBED ? 'ai_embedding' : 'ai_generation';
  await input.asyncTaskRecordService.recordEnqueued({
    data: {
      queueName: BULLMQ_QUEUES.AI,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      bizType,
      bizKey: input.traceId,
      source: 'system',
      reason: 'enqueue_accepted',
      maxAttempts: input.maxAttempts,
    },
  });
};

describe('AI Worker 消费落库阶段（e2e）', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplication;
  let aiQueue: Queue;
  let workerRuntime: BullMqWorkerRuntime;
  let dataSource: DataSource;
  let aiWorkerMock: MockAiWorkerService;
  let asyncTaskRecordService: AsyncTaskRecordService;

  beforeAll(async () => {
    initGraphQLSchema();

    const apiModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();
    apiApp = apiModuleFixture.createNestApplication();
    await apiApp.init();

    const workerModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(AiWorkerService)
      .useClass(MockAiWorkerService)
      .compile();
    workerApp = workerModuleFixture.createNestApplication();
    await workerApp.init();

    aiQueue = apiApp.get<Queue>(getQueueToken(BULLMQ_QUEUES.AI));
    workerRuntime = workerApp.get(BullMqWorkerRuntime);
    dataSource = apiApp.get(DataSource);
    aiWorkerMock = workerApp.get(AiWorkerService);
    asyncTaskRecordService = apiApp.get(AsyncTaskRecordService);
  }, 60000);

  afterAll(async () => {
    if (workerRuntime) {
      await workerRuntime.stop();
    }
    if (workerApp) {
      await workerApp.close();
    }
    if (apiApp) {
      await apiApp.close();
    }
  });

  it('generate 成功时应写入 provider succeeded 调用记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-persist-generate-${timestamp}`;
    const traceId = `ai-persist-generate-${timestamp}`;

    try {
      await workerRuntime.stop();
      const callsBefore = aiWorkerMock.generateCalls.length;
      await recordAiEnqueued({
        asyncTaskRecordService,
        jobName: BULLMQ_JOBS.AI.GENERATE,
        jobId,
        traceId,
        maxAttempts: 1,
      });

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: 'generate persistence success __SLOW_MS_300__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      const providerCallRecord = await waitLatestProviderCallRecord({
        dataSource,
        traceId,
        status: 'succeeded',
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('succeeded');
      expect(aiWorkerMock.generateCalls.length - callsBefore).toBe(1);
      expect(providerCallRecord.asyncTaskRecordId).toBe(record.id);
      expect(providerCallRecord.source).toBe('system');
      expect(providerCallRecord.bizType).toBe('ai_generation');
      expect(providerCallRecord.bizKey).toBe(record.bizKey);
      expect(providerCallRecord.callSeq).toBeGreaterThanOrEqual(1);
      expect(providerCallRecord.providerStatus).toBe('succeeded');
      expect(providerCallRecord.provider).toBe('mock');
      expect(providerCallRecord.model).toBe('gpt-4o-mini');
      expect(providerCallRecord.taskType).toBe('generate');
      expect(providerCallRecord.providerRequestId).toContain('mock-g-');
      expect(providerCallRecord.providerStartedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerFinishedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerLatencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('embed 成功时应写入 provider succeeded 调用记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.EMBED}-persist-embed-${timestamp}`;
    const traceId = `ai-persist-embed-${timestamp}`;

    try {
      await workerRuntime.stop();

      await enqueueAiEmbed({
        queue: aiQueue,
        jobId,
        text: 'embed persistence success',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      const providerCallRecord = await waitLatestProviderCallRecord({
        dataSource,
        traceId,
        status: 'succeeded',
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('succeeded');
      expect(providerCallRecord.asyncTaskRecordId).toBe(record.id);
      expect(providerCallRecord.providerStatus).toBe('succeeded');
      expect(providerCallRecord.provider).toBe('mock');
      expect(providerCallRecord.model).toBe('text-embedding-3-small');
      expect(providerCallRecord.taskType).toBe('embed');
      expect(providerCallRecord.providerRequestId).toContain('mock-e-');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('generate 失败时应写入 provider failed 调用记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-persist-failed-${timestamp}`;
    const traceId = `ai-persist-failed-${timestamp}`;

    try {
      await workerRuntime.stop();
      await recordAiEnqueued({
        asyncTaskRecordService,
        jobName: BULLMQ_JOBS.AI.GENERATE,
        jobId,
        traceId,
        maxAttempts: 1,
      });

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: '__FAIL_GENERATE__ __SLOW_MS_300__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      const providerCallRecord = await waitLatestProviderCallRecord({
        dataSource,
        traceId,
        status: 'failed',
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('failed');
      expect(providerCallRecord.asyncTaskRecordId).toBe(record.id);
      expect(providerCallRecord.providerStatus).toBe('failed');
      expect(providerCallRecord.provider).toBe('openai');
      expect(providerCallRecord.model).toBe('gpt-4o-mini');
      expect(providerCallRecord.taskType).toBe('generate');
      expect(providerCallRecord.normalizedErrorCode).toContain('Mock AI generate failure');
      expect(providerCallRecord.errorMessage).toContain('Mock AI generate failure');
      expect(providerCallRecord.providerStartedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerFinishedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerLatencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('embed 失败时应写入 provider failed 调用记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.EMBED}-persist-embed-failed-${timestamp}`;
    const traceId = `ai-persist-embed-failed-${timestamp}`;

    try {
      await workerRuntime.stop();
      await recordAiEnqueued({
        asyncTaskRecordService,
        jobName: BULLMQ_JOBS.AI.EMBED,
        jobId,
        traceId,
        maxAttempts: 1,
      });

      await enqueueAiEmbed({
        queue: aiQueue,
        jobId,
        text: '__FAIL_EMBED__ __SLOW_MS_300__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      const providerCallRecord = await waitLatestProviderCallRecord({
        dataSource,
        traceId,
        status: 'failed',
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('failed');
      expect(providerCallRecord.asyncTaskRecordId).toBe(record.id);
      expect(providerCallRecord.providerStatus).toBe('failed');
      expect(providerCallRecord.provider).toBe('mock-embed');
      expect(providerCallRecord.model).toBe('text-embedding-3-small');
      expect(providerCallRecord.taskType).toBe('embed');
      expect(providerCallRecord.normalizedErrorCode).toContain('Mock AI embed failure');
      expect(providerCallRecord.errorMessage).toContain('Mock AI embed failure');
      expect(providerCallRecord.providerStartedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerFinishedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerLatencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('未真正发起 provider 请求时不应写 provider 调用记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-persist-no-attempt-${timestamp}`;
    const traceId = `ai-persist-no-attempt-${timestamp}`;

    try {
      await workerRuntime.stop();
      await recordAiEnqueued({
        asyncTaskRecordService,
        jobName: BULLMQ_JOBS.AI.GENERATE,
        jobId,
        traceId,
        maxAttempts: 1,
      });

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: '__PRECHECK_FAIL__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('failed');
      expect(record.reason).toContain('unsupported_ai_provider:openai');
      await sleep(500);
      const providerCallRecordCount = await countProviderCallRecordByTraceId({
        dataSource,
        traceId,
      });
      expect(providerCallRecordCount).toBe(0);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('embed 未真正发起 provider 请求时不应写 provider 调用记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.EMBED}-persist-no-attempt-${timestamp}`;
    const traceId = `ai-persist-embed-no-attempt-${timestamp}`;

    try {
      await workerRuntime.stop();
      await recordAiEnqueued({
        asyncTaskRecordService,
        jobName: BULLMQ_JOBS.AI.EMBED,
        jobId,
        traceId,
        maxAttempts: 1,
      });

      await enqueueAiEmbed({
        queue: aiQueue,
        jobId,
        text: '__PRECHECK_FAIL__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('failed');
      expect(record.reason).toContain('unsupported_ai_embedding_model');
      await sleep(500);
      const providerCallRecordCount = await countProviderCallRecordByTraceId({
        dataSource,
        traceId,
      });
      expect(providerCallRecordCount).toBe(0);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('generate 重试前两次失败第三次成功时应写入 3 条 provider 调用记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-persist-retry-success-${timestamp}`;
    const traceId = `ai-persist-retry-success-${timestamp}`;
    const prompt = `__RETRY_SUCCESS_2__-${timestamp}`;

    try {
      await workerRuntime.stop();
      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt,
        traceId,
        attempts: 3,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      const asyncTaskRecord = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      const providerRecords = await waitProviderCallRecordCount({
        dataSource,
        traceId,
        expectedCount: 3,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(providerRecords.map((item) => item.callSeq)).toEqual([1, 2, 3]);
      expect(providerRecords.map((item) => item.providerStatus)).toEqual([
        'failed',
        'failed',
        'succeeded',
      ]);
      expect(providerRecords[0].normalizedErrorCode).toContain('Mock AI transient failure 1');
      expect(providerRecords[1].normalizedErrorCode).toContain('Mock AI transient failure 2');
      expect(providerRecords[2].providerRequestId).toContain('mock-g-');
      expect(providerRecords[2].asyncTaskRecordId).toBe(asyncTaskRecord.id);
      expect(asyncTaskRecord.status).toBe('succeeded');
      expect(asyncTaskRecord.attemptCount).toBe(3);
      expect(asyncTaskRecord.reason).toBe('worker_completed');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('generate 重试耗尽时应写入 3 条 failed provider 调用记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-persist-retry-exhaust-${timestamp}`;
    const traceId = `ai-persist-retry-exhaust-${timestamp}`;
    const prompt = `__RETRY_EXHAUST__-${timestamp}`;

    try {
      await workerRuntime.stop();
      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt,
        traceId,
        attempts: 3,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      const asyncTaskRecord = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      const providerRecords = await waitProviderCallRecordCount({
        dataSource,
        traceId,
        expectedCount: 3,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(providerRecords.map((item) => item.callSeq)).toEqual([1, 2, 3]);
      expect(providerRecords.every((item) => item.providerStatus === 'failed')).toBe(true);
      expect(providerRecords[2].normalizedErrorCode).toContain('Mock AI exhausted failure 3');
      expect(providerRecords[2].asyncTaskRecordId).toBe(asyncTaskRecord.id);
      expect(asyncTaskRecord.status).toBe('failed');
      expect(asyncTaskRecord.attemptCount).toBe(3);
      expect(asyncTaskRecord.reason).toContain('Mock AI exhausted failure 3');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('success full usage 时应完整映射 provider 字段', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-persist-full-usage-${timestamp}`;
    const traceId = `ai-persist-full-usage-${timestamp}`;

    try {
      await workerRuntime.stop();
      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: '__FULL_USAGE__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      const providerCallRecord = await waitLatestProviderCallRecord({
        dataSource,
        traceId,
        status: 'succeeded',
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(providerCallRecord.promptTokens).toBe(123);
      expect(providerCallRecord.completionTokens).toBe(45);
      expect(providerCallRecord.totalTokens).toBe(168);
      expect(providerCallRecord.costAmount).toBe('0.01234567');
      expect(providerCallRecord.costCurrency).toBe('USD');
      expect(providerCallRecord.providerRequestId).toContain('mock-req-');
      expect(providerCallRecord.providerStartedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerFinishedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerLatencyMs).toBe(321);
      expect(providerCallRecord.normalizedErrorCode).toBeNull();
      expect(providerCallRecord.providerErrorCode).toBeNull();
      expect(providerCallRecord.errorMessage).toBeNull();
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('failed with error details 时应映射错误字段且 token cost 为空', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-persist-error-details-${timestamp}`;
    const traceId = `ai-persist-error-details-${timestamp}`;

    try {
      await workerRuntime.stop();
      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: '__FAIL_WITH_ERROR_DETAILS__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      const providerCallRecord = await waitLatestProviderCallRecord({
        dataSource,
        traceId,
        status: 'failed',
        timeoutMs: 20000,
        pollMs: 150,
      });
      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('failed');
      expect(providerCallRecord.providerStatus).toBe('failed');
      expect(providerCallRecord.normalizedErrorCode).toBe('ai_provider_auth_failed');
      expect(providerCallRecord.providerErrorCode).toBe('invalid_api_key');
      expect(providerCallRecord.errorMessage).toBe('ai_provider_auth_failed');
      expect(providerCallRecord.promptTokens).toBeNull();
      expect(providerCallRecord.completionTokens).toBeNull();
      expect(providerCallRecord.totalTokens).toBeNull();
      expect(providerCallRecord.costAmount).toBeNull();
      expect(providerCallRecord.costCurrency).toBeNull();
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('success without provider request id 时应回退写入 providerJobId', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-persist-no-request-id-${timestamp}`;
    const traceId = `ai-persist-no-request-id-${timestamp}`;

    try {
      await workerRuntime.stop();
      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: '__NO_REQUEST_ID__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      const providerCallRecord = await waitLatestProviderCallRecord({
        dataSource,
        traceId,
        status: 'succeeded',
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(providerCallRecord.providerStatus).toBe('succeeded');
      const returnvalue = finalState.returnvalue as { readonly providerJobId?: string };
      expect(returnvalue.providerJobId).toBeDefined();
      expect(providerCallRecord.providerRequestId).toBe(returnvalue.providerJobId ?? null);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('embed success full usage 时应完整映射 provider 字段', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.EMBED}-persist-full-usage-${timestamp}`;
    const traceId = `ai-persist-embed-full-usage-${timestamp}`;

    try {
      await workerRuntime.stop();
      await enqueueAiEmbed({
        queue: aiQueue,
        jobId,
        text: '__FULL_USAGE__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      const providerCallRecord = await waitLatestProviderCallRecord({
        dataSource,
        traceId,
        status: 'succeeded',
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(providerCallRecord.taskType).toBe('embed');
      expect(providerCallRecord.promptTokens).toBe(222);
      expect(providerCallRecord.completionTokens).toBe(0);
      expect(providerCallRecord.totalTokens).toBe(222);
      expect(providerCallRecord.costAmount).toBe('0.00012000');
      expect(providerCallRecord.costCurrency).toBe('USD');
      expect(providerCallRecord.providerRequestId).toContain('mock-embed-req-');
      expect(providerCallRecord.providerStartedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerFinishedAt).toBeInstanceOf(Date);
      expect(providerCallRecord.providerLatencyMs).toBe(222);
      expect(providerCallRecord.normalizedErrorCode).toBeNull();
      expect(providerCallRecord.providerErrorCode).toBeNull();
      expect(providerCallRecord.errorMessage).toBeNull();
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('embed failed with error details 时应映射错误字段且 token cost 为空', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.EMBED}-persist-error-details-${timestamp}`;
    const traceId = `ai-persist-embed-error-details-${timestamp}`;

    try {
      await workerRuntime.stop();
      await enqueueAiEmbed({
        queue: aiQueue,
        jobId,
        text: '__FAIL_WITH_ERROR_DETAILS__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      const providerCallRecord = await waitLatestProviderCallRecord({
        dataSource,
        traceId,
        status: 'failed',
        timeoutMs: 20000,
        pollMs: 150,
      });
      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('failed');
      expect(providerCallRecord.taskType).toBe('embed');
      expect(providerCallRecord.providerStatus).toBe('failed');
      expect(providerCallRecord.provider).toBe('mock-embed');
      expect(providerCallRecord.normalizedErrorCode).toBe('ai_provider_auth_failed');
      expect(providerCallRecord.providerErrorCode).toBe('embed_auth_failed');
      expect(providerCallRecord.errorMessage).toBe('ai_provider_auth_failed');
      expect(providerCallRecord.promptTokens).toBeNull();
      expect(providerCallRecord.completionTokens).toBeNull();
      expect(providerCallRecord.totalTokens).toBeNull();
      expect(providerCallRecord.costAmount).toBeNull();
      expect(providerCallRecord.costCurrency).toBeNull();
    } finally {
      await workerRuntime.start();
    }
  }, 60000);
});
