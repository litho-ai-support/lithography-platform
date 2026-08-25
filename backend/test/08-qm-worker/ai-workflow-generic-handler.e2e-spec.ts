// test/08-qm-worker/ai-workflow-generic-handler.e2e-spec.ts
import { getQueueToken } from '@nestjs/bullmq';
import { Inject, Injectable, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { WorkerModule } from '@src/bootstraps/worker/worker.module';
import { THIRDPARTY_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import { BullMqWorkerRuntime } from '@src/infrastructure/bullmq/worker.runtime';
import { AiProviderCallRecordEntity } from '@src/modules/ai-provider-call-record/ai-provider-call-record.entity';
import { AiWorkflowContextEntity } from '@src/modules/ai-workflow-context/ai-workflow-context.entity';
import type {
  AiWorkflowContextStatus,
  AiWorkflowJsonPayload,
} from '@src/modules/ai-workflow-context/ai-workflow-context.types';
import { AiWorkflowQueueService } from '@src/modules/ai-workflow-context/queue/ai-workflow-queue.service';
import type { QueueAiWorkflowQueueHealthResult } from '@src/modules/ai-workflow-context/queue/ai-workflow-queue.types';
import { AsyncTaskRecordEntity } from '@src/modules/async-task-record/async-task-record.entity';
import type { AsyncTaskRecordStatus } from '@src/modules/async-task-record/async-task-record.types';
import {
  CAPABILITY_STATE_READER,
  type CapabilityStateReader,
} from '@src/modules/common/capability-state-reader.contract';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import type {
  EmbedAiContentInput,
  EmbedAiContentResult,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from '@src/modules/common/ai-worker/ai-worker.types';
import { CreateAndAdmitAiWorkflowUsecase } from '@src/usecases/ai-workflow/create-and-admit-ai-workflow.usecase';
import { RunAiWorkflowHousekeepingUsecase } from '@src/usecases/ai-workflow/run-ai-workflow-housekeeping.usecase';
import { AiWorkflowUsecasesModule } from '@src/usecases/ai-workflow/ai-workflow-usecases.module';
import { GENERIC_TEXT_GENERATE_WORKFLOW_TYPE } from '@src/usecases/ai-worker/generic-text-generate-workflow.handler';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';

type FinalJobState = 'completed' | 'failed';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
class SwitchableAiQueueService extends AiWorkflowQueueService {
  private unavailableChecksRemaining = 0;

  constructor(
    producer: BullMqProducerGateway,
    logger: PinoLogger,
    @Inject(CAPABILITY_STATE_READER) capabilityStateReader: CapabilityStateReader,
  ) {
    super(producer, logger, capabilityStateReader);
  }

  forceUnavailableChecks(count: number): void {
    this.unavailableChecksRemaining = Math.max(0, count);
  }

  override async checkWorkflowQueueAvailable(): Promise<QueueAiWorkflowQueueHealthResult> {
    if (this.unavailableChecksRemaining > 0) {
      this.unavailableChecksRemaining -= 1;
      return {
        available: false,
        reason: 'QUEUE_UNAVAILABLE',
      };
    }
    return await super.checkWorkflowQueueAvailable();
  }
}

class MockWorkflowAiWorkerService {
  readonly generateCalls: GenerateAiContentInput[] = [];
  private readonly generateAttemptsByPrompt = new Map<string, number>();

  generate(input: GenerateAiContentInput): Promise<GenerateAiContentResult> {
    this.generateCalls.push(input);
    const currentAttempt = this.resolveGenerateAttempt(input.prompt);
    if (input.prompt.includes('__WORKFLOW_RETRY_SUCCESS_2__') && currentAttempt <= 2) {
      throw this.createProviderFailure({
        message: `Mock workflow transient failure ${currentAttempt}`,
        provider: input.provider,
      });
    }
    if (input.prompt.includes('__WORKFLOW_RETRY_EXHAUST__')) {
      throw this.createProviderFailure({
        message: `Mock workflow exhausted failure ${currentAttempt}`,
        provider: input.provider,
      });
    }
    return Promise.resolve({
      accepted: true,
      outputText: `mock-output:${input.prompt}`,
      provider: 'mock',
      model: input.model,
      providerJobId: `mock-workflow-g-${this.generateCalls.length}`,
      providerRequestId: `mock-workflow-req-${this.generateCalls.length}`,
      providerStatus: 'succeeded',
      providerStartedAt: new Date(),
      providerFinishedAt: new Date(),
    });
  }

  embed(input: EmbedAiContentInput): Promise<EmbedAiContentResult> {
    return Promise.resolve({
      accepted: true,
      vector: [0.1, 0.2, 0.3, 0.4],
      provider: 'mock',
      model: input.model,
      providerJobId: 'mock-workflow-embed',
      providerRequestId: 'mock-workflow-embed-req',
      providerStatus: 'succeeded',
    });
  }

  private resolveGenerateAttempt(prompt: string): number {
    const currentAttempt = (this.generateAttemptsByPrompt.get(prompt) ?? 0) + 1;
    this.generateAttemptsByPrompt.set(prompt, currentAttempt);
    return currentAttempt;
  }

  private createProviderFailure(input: {
    readonly message: string;
    readonly provider?: string;
  }): DomainError {
    return new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, input.message, {
      provider: input.provider ?? 'mock',
      providerErrorCode: 'mock_workflow_provider_error',
    });
  }
}

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
  throw new Error(`AI workflow job did not reach final state in time: ${input.jobId}`);
};

const waitWorkflowContext = async (input: {
  readonly dataSource: DataSource;
  readonly workflowId: string;
  readonly statuses: ReadonlyArray<AiWorkflowContextStatus>;
  readonly timeoutMs: number;
  readonly pollMs: number;
}): Promise<AiWorkflowContextEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const context = await input.dataSource.getRepository(AiWorkflowContextEntity).findOne({
      where: { workflowId: input.workflowId },
    });
    if (context && input.statuses.includes(context.status)) {
      return context;
    }
    await sleep(input.pollMs);
  }
  throw new Error(`AI workflow context did not reach expected state: ${input.workflowId}`);
};

const waitAsyncTaskRecord = async (input: {
  readonly dataSource: DataSource;
  readonly jobId: string;
  readonly statuses: ReadonlyArray<AsyncTaskRecordStatus>;
  readonly timeoutMs: number;
  readonly pollMs: number;
}): Promise<AsyncTaskRecordEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const record = await input.dataSource.getRepository(AsyncTaskRecordEntity).findOne({
      where: {
        queueName: BULLMQ_QUEUES.AI_WORKFLOW,
        jobName: BULLMQ_JOBS.AI.WORKFLOW,
        jobId: input.jobId,
      },
    });
    if (record && input.statuses.includes(record.status)) {
      return record;
    }
    await sleep(input.pollMs);
  }
  throw new Error(`AI workflow async task record did not reach expected state: ${input.jobId}`);
};

const waitProviderCallRecords = async (input: {
  readonly dataSource: DataSource;
  readonly traceId: string;
  readonly minCount: number;
  readonly timeoutMs: number;
  readonly pollMs: number;
}): Promise<AiProviderCallRecordEntity[]> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const records = await listProviderCallRecords({
      dataSource: input.dataSource,
      traceId: input.traceId,
    });
    if (records.length >= input.minCount) {
      return records;
    }
    await sleep(input.pollMs);
  }
  throw new Error(`AI workflow provider call records were not created: ${input.traceId}`);
};

const listProviderCallRecords = async (input: {
  readonly dataSource: DataSource;
  readonly traceId: string;
}): Promise<AiProviderCallRecordEntity[]> => {
  return await input.dataSource.getRepository(AiProviderCallRecordEntity).find({
    where: { traceId: input.traceId },
    order: { callSeq: 'ASC' },
  });
};

function resolveOutputPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI workflow output payload is not an object');
  }
  return value as Record<string, unknown>;
}

describe('AI Workflow generic text generate handler（e2e）', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplication;
  let aiQueue: Queue;
  let workerRuntime: BullMqWorkerRuntime;
  let dataSource: DataSource;
  let aiWorkerMock: MockWorkflowAiWorkerService;
  let aiQueueService: SwitchableAiQueueService;
  let createAndAdmitAiWorkflowUsecase: CreateAndAdmitAiWorkflowUsecase;
  let runAiWorkflowHousekeepingUsecase: RunAiWorkflowHousekeepingUsecase;

  beforeAll(async () => {
    initGraphQLSchema();

    const apiModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule, AiWorkflowUsecasesModule],
    })
      .overrideProvider(AiWorkflowQueueService)
      .useClass(SwitchableAiQueueService)
      .compile();
    apiApp = apiModuleFixture.createNestApplication();
    await apiApp.init();

    const workerModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(AiWorkerService)
      .useClass(MockWorkflowAiWorkerService)
      .compile();
    workerApp = workerModuleFixture.createNestApplication();
    await workerApp.init();

    aiQueue = apiApp.get<Queue>(getQueueToken(BULLMQ_QUEUES.AI_WORKFLOW));
    workerRuntime = workerApp.get(BullMqWorkerRuntime);
    dataSource = apiApp.get(DataSource);
    aiWorkerMock = workerApp.get<MockWorkflowAiWorkerService>(AiWorkerService);
    aiQueueService = apiApp.get<SwitchableAiQueueService>(AiWorkflowQueueService);
    createAndAdmitAiWorkflowUsecase = apiApp.get(CreateAndAdmitAiWorkflowUsecase);
    runAiWorkflowHousekeepingUsecase = apiApp.get(RunAiWorkflowHousekeepingUsecase);
  }, 60000);

  afterAll(async () => {
    if (workerApp) {
      await workerApp.close();
    }
    if (apiApp) {
      await apiApp.close();
    }
  });

  it('admission 后应进入 QUEUED，worker 消费成功后写入 output JSON', async () => {
    const unique = randomUUID();
    try {
      await workerRuntime.stop();
      const admitted = await createWorkflow({
        unique,
        inputPayload: {
          userPrompt: `hello workflow ${unique}`,
          systemPrompt: 'Answer briefly.',
          context: 'E2E generic text generate success.',
          provider: 'openai',
          model: 'gpt-4o-mini',
        },
      });
      expect(admitted.status).toBe('QUEUED');
      if (admitted.status !== 'QUEUED') {
        throw new Error(`unexpected workflow admission status:${admitted.status}`);
      }

      const queuedContext = await waitWorkflowContext({
        dataSource,
        workflowId: admitted.context.workflowId,
        statuses: ['QUEUED'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(queuedContext.jobId).toBe(admitted.jobId);

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId: admitted.jobId,
        timeoutMs: 30000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      expect(finalState.returnvalue).toMatchObject({
        accepted: true,
        workflowId: admitted.context.workflowId,
        traceId: admitted.traceId,
      });

      const succeededContext = await waitWorkflowContext({
        dataSource,
        workflowId: admitted.context.workflowId,
        statuses: ['SUCCEEDED'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      const outputPayload = resolveOutputPayload(succeededContext.outputPayloadJson);
      expect(outputPayload.outputText).toContain(`hello workflow ${unique}`);
      expect(outputPayload.provider).toBe('mock');
      expect(outputPayload.model).toBe('gpt-4o-mini');
      expect(outputPayload.providerJobId).toEqual(expect.stringContaining('mock-workflow-g-'));

      const asyncTaskRecord = await waitAsyncTaskRecord({
        dataSource,
        jobId: admitted.jobId,
        statuses: ['succeeded'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(asyncTaskRecord.reason).toBe('worker_completed');

      const providerRecords = await waitProviderCallRecords({
        dataSource,
        traceId: admitted.traceId,
        minCount: 1,
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(providerRecords).toHaveLength(1);
      expect(providerRecords[0]).toMatchObject({
        provider: 'mock',
        model: 'gpt-4o-mini',
        taskType: 'generate',
        providerStatus: 'succeeded',
      });
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('非法 input 应进入 FAILED 且不调用 provider', async () => {
    const unique = randomUUID();
    const callsBefore = aiWorkerMock.generateCalls.length;
    try {
      await workerRuntime.stop();
      const admitted = await createWorkflow({
        unique,
        inputPayload: {
          userPrompt: '',
          model: 'gpt-4o-mini',
        },
      });
      expect(admitted.status).toBe('QUEUED');
      if (admitted.status !== 'QUEUED') {
        throw new Error(`unexpected workflow admission status:${admitted.status}`);
      }

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId: admitted.jobId,
        timeoutMs: 30000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      expect(finalState.failedReason).toContain('workflow_input_payload_invalid');

      const failedContext = await waitWorkflowContext({
        dataSource,
        workflowId: admitted.context.workflowId,
        statuses: ['FAILED'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(failedContext.errorCode).toBe('WORKFLOW_INPUT_PAYLOAD_INVALID');
      expect(aiWorkerMock.generateCalls.length).toBe(callsBefore);
      const providerRecords = await listProviderCallRecords({
        dataSource,
        traceId: admitted.traceId,
      });
      expect(providerRecords).toHaveLength(0);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('transient provider failure 应重试并最终成功', async () => {
    const unique = randomUUID();
    try {
      await workerRuntime.stop();
      const admitted = await createWorkflow({
        unique,
        inputPayload: {
          userPrompt: `__WORKFLOW_RETRY_SUCCESS_2__ ${unique}`,
          provider: 'openai',
          model: 'gpt-4o-mini',
        },
      });
      expect(admitted.status).toBe('QUEUED');
      if (admitted.status !== 'QUEUED') {
        throw new Error(`unexpected workflow admission status:${admitted.status}`);
      }

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId: admitted.jobId,
        timeoutMs: 45000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');

      const context = await waitWorkflowContext({
        dataSource,
        workflowId: admitted.context.workflowId,
        statuses: ['SUCCEEDED'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(context.errorCode).toBeNull();

      const asyncTaskRecord = await waitAsyncTaskRecord({
        dataSource,
        jobId: admitted.jobId,
        statuses: ['succeeded'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(asyncTaskRecord.attemptCount).toBe(3);

      const providerRecords = await waitProviderCallRecords({
        dataSource,
        traceId: admitted.traceId,
        minCount: 3,
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(providerRecords.map((record) => record.providerStatus)).toEqual([
        'failed',
        'failed',
        'succeeded',
      ]);
    } finally {
      await workerRuntime.start();
    }
  }, 75000);

  it('transient provider failure 重试耗尽后应最终 FAILED', async () => {
    const unique = randomUUID();
    try {
      await workerRuntime.stop();
      const admitted = await createWorkflow({
        unique,
        inputPayload: {
          userPrompt: `__WORKFLOW_RETRY_EXHAUST__ ${unique}`,
          provider: 'openai',
          model: 'gpt-4o-mini',
        },
      });
      expect(admitted.status).toBe('QUEUED');
      if (admitted.status !== 'QUEUED') {
        throw new Error(`unexpected workflow admission status:${admitted.status}`);
      }

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId: admitted.jobId,
        timeoutMs: 45000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');

      const context = await waitWorkflowContext({
        dataSource,
        workflowId: admitted.context.workflowId,
        statuses: ['FAILED'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(context.errorCode).toBe('WORKFLOW_PROVIDER_FAILED');
      expect(context.errorMessage).toContain('Mock workflow exhausted failure 3');

      const asyncTaskRecord = await waitAsyncTaskRecord({
        dataSource,
        jobId: admitted.jobId,
        statuses: ['failed'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(asyncTaskRecord.attemptCount).toBe(3);
      expect(asyncTaskRecord.reason).toContain('Mock workflow exhausted failure 3');

      const providerRecords = await waitProviderCallRecords({
        dataSource,
        traceId: admitted.traceId,
        minCount: 3,
        timeoutMs: 10000,
        pollMs: 100,
      });
      expect(providerRecords.map((record) => record.providerStatus)).toEqual([
        'failed',
        'failed',
        'failed',
      ]);
    } finally {
      await workerRuntime.start();
    }
  }, 75000);

  it('admission waiting 应由 housekeeping retry 后入队并成功消费', async () => {
    const unique = randomUUID();
    try {
      await workerRuntime.stop();
      aiQueueService.forceUnavailableChecks(1);
      const waiting = await createWorkflow({
        unique,
        inputPayload: {
          userPrompt: `housekeeping retry ${unique}`,
          provider: 'openai',
          model: 'gpt-4o-mini',
        },
      });
      expect(waiting.status).toBe('ADMISSION_WAITING');
      if (waiting.status !== 'ADMISSION_WAITING') {
        throw new Error(`unexpected workflow admission status:${waiting.status}`);
      }
      expect(waiting.context.nextEnqueueAt).not.toBeNull();

      const dueNow = new Date((waiting.context.nextEnqueueAt ?? new Date()).getTime() + 1);
      const housekeeping = await runAiWorkflowHousekeepingUsecase.execute({
        now: dueNow,
        limit: 10,
      });
      expect(housekeeping.admission.succeeded).toBe(1);

      const queuedContext = await waitWorkflowContext({
        dataSource,
        workflowId: waiting.context.workflowId,
        statuses: ['QUEUED'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      if (!queuedContext.jobId) {
        throw new Error('workflow queued context missing jobId');
      }

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId: queuedContext.jobId,
        timeoutMs: 30000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');

      await waitAsyncTaskRecord({
        dataSource,
        jobId: queuedContext.jobId,
        statuses: ['succeeded'],
        timeoutMs: 10000,
        pollMs: 100,
      });
      await waitWorkflowContext({
        dataSource,
        workflowId: waiting.context.workflowId,
        statuses: ['SUCCEEDED'],
        timeoutMs: 10000,
        pollMs: 100,
      });
    } finally {
      aiQueueService.forceUnavailableChecks(0);
      await workerRuntime.start();
    }
  }, 60000);

  async function createWorkflow(input: {
    readonly unique: string;
    readonly inputPayload: AiWorkflowJsonPayload;
  }): Promise<Awaited<ReturnType<CreateAndAdmitAiWorkflowUsecase['execute']>>> {
    const inputPayload = resolveOutputPayload(input.inputPayload);
    return await createAndAdmitAiWorkflowUsecase.execute({
      workflowType: GENERIC_TEXT_GENERATE_WORKFLOW_TYPE,
      workflowDedupKey: `e2e-generic-text-generate:${input.unique}`,
      inputPayload: input.inputPayload,
      traceId: `e2e-ai-workflow-generic:${input.unique}`,
      bizType: 'e2e_ai_workflow',
      bizKey: input.unique,
      source: 'system',
      provider: typeof inputPayload.provider === 'string' ? inputPayload.provider : undefined,
      model: typeof inputPayload.model === 'string' ? inputPayload.model : undefined,
    });
  }
});
