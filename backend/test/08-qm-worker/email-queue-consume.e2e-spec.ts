// test/08-qm-worker/email-queue-consume.e2e-spec.ts
import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { TokenHelper } from '@modules/auth/token.helper';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailSendHandler } from '@src/adapters/worker/email/email-send.handler';
import { EMAIL_SEND_JOB_NAME } from '@src/adapters/worker/email/email-send.mapper';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { WorkerModule } from '@src/bootstraps/worker/worker.module';
import { BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqWorkerRuntime } from '@src/infrastructure/bullmq/worker.runtime';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { AsyncTaskRecordEntity } from '@src/modules/async-task-record/async-task-record.entity';
import type { AsyncTaskRecordStatus } from '@src/modules/async-task-record/async-task-record.types';
import { EmailDeliveryService } from '@src/modules/common/email-worker/email-delivery.service';
import type {
  SendEmailInput,
  SendEmailResult,
} from '@src/modules/common/email-worker/email-worker.types';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

type FinalJobState = 'completed' | 'failed';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class MockEmailDeliveryService {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const slowMs = this.resolveSlowMs({ text: input.text ?? '', subject: input.subject });
    if (slowMs > 0) {
      await sleep(slowMs);
    }
    if (input.to.includes('fail.local')) {
      return Promise.reject(new Error('Simulated email provider failure'));
    }
    return Promise.resolve({
      accepted: true,
      providerMessageId: `mock-${Date.now()}`,
    });
  }

  private resolveSlowMs(input: { readonly text: string; readonly subject: string }): number {
    const matched =
      input.text.match(/__SLOW_MS_(\d+)__/) ?? input.subject.match(/__SLOW_MS_(\d+)__/);
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

const QUEUE_EMAIL_MUTATION = `
  mutation QueueEmail($input: QueueEmailInput!) {
    queueEmail(input: $input) {
      queued
      jobId
      traceId
    }
  }
`;

const LOGIN_MUTATION = `
  mutation Login($input: AuthLoginInput!) {
    login(input: $input) {
      accessToken
    }
  }
`;

const REGISTER_MUTATION = `
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      success
      accountId
      message
    }
  }
`;

const CREATE_VERIFICATION_RECORD_MUTATION = `
  mutation CreateVerificationRecord($input: CreateVerificationRecordInput!) {
    createVerificationRecord(input: $input) {
      success
      token
      message
      data {
        id
        type
        status
      }
    }
  }
`;

const FIND_VERIFICATION_RECORD_QUERY = `
  query FindVerificationRecord($input: FindVerificationRecordInput!) {
    findVerificationRecord(input: $input) {
      id
      type
      status
    }
  }
`;

const RESET_PASSWORD_MUTATION = `
  mutation ResetPassword($input: ResetPasswordInput!) {
    resetPassword(input: $input) {
      success
      message
      accountId
    }
  }
`;

const postGraphql = async <TData>(input: {
  readonly apiApp: INestApplication;
  readonly query: string;
  readonly variables: Record<string, unknown>;
  readonly bearer?: string;
}): Promise<TData> => {
  const req = request(input.apiApp.getHttpServer()).post('/graphql').send({
    query: input.query,
    variables: input.variables,
  });
  if (input.bearer) {
    req.set('Authorization', `Bearer ${input.bearer}`);
  }
  const response = await req.expect(200);
  if (response.body.errors && response.body.errors.length > 0) {
    throw new Error(JSON.stringify(response.body.errors));
  }
  return response.body.data as TData;
};

const loginAndGetAccessToken = async (input: {
  readonly apiApp: INestApplication;
  readonly loginName: string;
  readonly loginPassword: string;
}): Promise<string> => {
  const data = await postGraphql<{ login: { accessToken: string } }>({
    apiApp: input.apiApp,
    query: LOGIN_MUTATION,
    variables: {
      input: {
        loginName: input.loginName,
        loginPassword: input.loginPassword,
        type: 'PASSWORD',
        audience: 'DESKTOP',
      },
    },
  });
  return data.login.accessToken;
};

const registerAccount = async (input: {
  readonly apiApp: INestApplication;
  readonly loginName: string;
  readonly loginEmail: string;
  readonly loginPassword: string;
}): Promise<number> => {
  const data = await postGraphql<{
    register: {
      success: boolean;
      accountId: number | null;
      message?: string | null;
    };
  }>({
    apiApp: input.apiApp,
    query: REGISTER_MUTATION,
    variables: {
      input: {
        loginName: input.loginName,
        loginEmail: input.loginEmail,
        loginPassword: input.loginPassword,
        type: 'REGISTRANT',
      },
    },
  });
  if (!data.register.success || !data.register.accountId) {
    throw new Error(`register failed: ${data.register.message ?? 'unknown error'}`);
  }
  return data.register.accountId;
};

const getAccountIdFromToken = (input: {
  readonly apiApp: INestApplication;
  readonly token: string;
}): number => {
  const tokenHelper = input.apiApp.get(TokenHelper);
  const payload = tokenHelper.decodeToken({ token: input.token });
  if (!payload || !payload.sub) {
    throw new Error('token payload missing sub');
  }
  return Number(payload.sub);
};

const createVerificationRecord = async (input: {
  readonly apiApp: INestApplication;
  readonly bearer: string;
  readonly type: VerificationRecordType;
  readonly targetAccountId: number;
  readonly payload: Record<string, unknown>;
}): Promise<string> => {
  const data = await postGraphql<{
    createVerificationRecord: {
      success: boolean;
      token: string | null;
      message?: string | null;
    };
  }>({
    apiApp: input.apiApp,
    query: CREATE_VERIFICATION_RECORD_MUTATION,
    variables: {
      input: {
        type: input.type,
        targetAccountId: input.targetAccountId,
        payload: input.payload,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        returnToken: true,
      },
    },
    bearer: input.bearer,
  });
  if (!data.createVerificationRecord.success || !data.createVerificationRecord.token) {
    throw new Error(data.createVerificationRecord.message ?? 'create verification failed');
  }
  return data.createVerificationRecord.token;
};

const resetPassword = async (input: {
  readonly apiApp: INestApplication;
  readonly token: string;
  readonly newPassword: string;
}): Promise<{ readonly success: boolean; readonly accountId?: number | null }> => {
  const data = await postGraphql<{
    resetPassword: {
      success: boolean;
      accountId?: number | null;
      message?: string | null;
    };
  }>({
    apiApp: input.apiApp,
    query: RESET_PASSWORD_MUTATION,
    variables: {
      input: {
        token: input.token,
        newPassword: input.newPassword,
      },
    },
  });
  return data.resetPassword;
};

const assertVerificationRecordReadable = async (input: {
  readonly apiApp: INestApplication;
  readonly token: string;
  readonly expectedType: VerificationRecordType;
}): Promise<void> => {
  const data = await postGraphql<{
    findVerificationRecord: { id: number; type: VerificationRecordType; status: string } | null;
  }>({
    apiApp: input.apiApp,
    query: FIND_VERIFICATION_RECORD_QUERY,
    variables: {
      input: {
        token: input.token,
        expectedType: input.expectedType,
        ignoreTargetRestriction: true,
      },
    },
  });
  expect(data.findVerificationRecord).not.toBeNull();
  expect(data.findVerificationRecord?.type).toBe(input.expectedType);
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
  throw new Error(`Email job did not reach final state in time: ${input.jobId}`);
};

const getJobAttemptsMade = async (input: {
  readonly queue: Queue;
  readonly jobId: string;
}): Promise<number> => {
  const job = await input.queue.getJob(input.jobId);
  if (!job) {
    throw new Error(`Email job not found: ${input.jobId}`);
  }
  return job.attemptsMade;
};

const findAsyncTaskRecord = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly jobId: string;
}): Promise<AsyncTaskRecordEntity | null> => {
  return await input.dataSource.getRepository(AsyncTaskRecordEntity).findOne({
    where: {
      queueName: input.queueName,
      jobId: input.jobId,
    },
  });
};

const findLatestAsyncTaskRecordByTrace = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly traceId: string;
}): Promise<AsyncTaskRecordEntity | null> => {
  return await input.dataSource.getRepository(AsyncTaskRecordEntity).findOne({
    where: {
      queueName: input.queueName,
      traceId: input.traceId,
    },
    order: {
      id: 'DESC',
    },
  });
};

const countAsyncTaskRecords = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly jobId: string;
}): Promise<number> => {
  return await input.dataSource.getRepository(AsyncTaskRecordEntity).count({
    where: {
      queueName: input.queueName,
      jobId: input.jobId,
    },
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
    if (record) {
      if (!input.statuses || input.statuses.includes(record.status)) {
        return record;
      }
    }
    await sleep(input.pollMs);
  }
  throw new Error(`Async task record did not reach expected state in time: ${input.jobId}`);
};

const waitAsyncTaskRecordByTrace = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly traceId: string;
  readonly timeoutMs: number;
  readonly pollMs: number;
  readonly statuses?: ReadonlyArray<AsyncTaskRecordStatus>;
}): Promise<AsyncTaskRecordEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const record = await findLatestAsyncTaskRecordByTrace({
      dataSource: input.dataSource,
      queueName: input.queueName,
      traceId: input.traceId,
    });
    if (record) {
      if (!input.statuses || input.statuses.includes(record.status)) {
        return record;
      }
    }
    await sleep(input.pollMs);
  }
  throw new Error(`Async task record did not reach expected state in time: ${input.traceId}`);
};

const waitFailedAsyncTaskRecordByReason = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly reasonKeyword: string;
  readonly timeoutMs: number;
  readonly pollMs: number;
}): Promise<AsyncTaskRecordEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const record = await input.dataSource.getRepository(AsyncTaskRecordEntity).findOne({
      where: {
        queueName: input.queueName,
        status: 'failed',
      },
      order: {
        id: 'DESC',
      },
    });
    if (record && record.reason?.includes(input.reasonKeyword)) {
      return record;
    }
    await sleep(input.pollMs);
  }
  throw new Error('Failed async task record with expected reason was not found in time');
};

const queueEmail = async (input: {
  readonly apiApp: INestApplication;
  readonly to: string;
  readonly subject: string;
  readonly text?: string;
  readonly dedupKey?: string;
  readonly traceId?: string;
  readonly source: string;
}): Promise<{
  readonly queued: boolean;
  readonly jobId: string;
  readonly traceId: string;
}> => {
  const response = await request(input.apiApp.getHttpServer())
    .post('/graphql')
    .send({
      query: QUEUE_EMAIL_MUTATION,
      variables: {
        input: {
          to: input.to,
          subject: input.subject,
          text: input.text,
          dedupKey: input.dedupKey,
          traceId: input.traceId,
          meta: {
            source: input.source,
          },
        },
      },
    })
    .expect(200);

  expect(response.body.errors).toBeUndefined();
  return response.body.data.queueEmail as {
    readonly queued: boolean;
    readonly jobId: string;
    readonly traceId: string;
  };
};

describe('邮件队列与 Worker（e2e）', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplication;
  let emailQueue: Queue;
  let workerRuntime: BullMqWorkerRuntime;
  let dataSource: DataSource;
  let emailSendHandler: EmailSendHandler;

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
      .overrideProvider(EmailDeliveryService)
      .useClass(MockEmailDeliveryService)
      .compile();

    workerApp = workerModuleFixture.createNestApplication();
    await workerApp.init();

    emailQueue = apiApp.get<Queue>(getQueueToken(BULLMQ_QUEUES.EMAIL));
    workerRuntime = workerApp.get(BullMqWorkerRuntime);
    dataSource = apiApp.get(DataSource);
    emailSendHandler = workerApp.get(EmailSendHandler);
  }, 60000);

  afterAll(async () => {
    if (workerApp) {
      await workerApp.close();
    }
    if (apiApp) {
      await apiApp.close();
    }
  });

  it('API 应用上下文不应注册 Worker 运行时', () => {
    expect(() => apiApp.get(BullMqWorkerRuntime)).toThrow();
  });

  describe('成功路径分阶段落库', () => {
    it('暂停消费后应先无记录，恢复消费后应落库为 succeeded', async () => {
      const timestamp = Date.now();
      const dedupKey = `e2e-email-success-job-${timestamp}`;
      const traceId = `e2e-email-success-trace-${timestamp}`;

      try {
        await workerRuntime.stop();

        const enqueueResult = await queueEmail({
          apiApp,
          to: 'queue.stage.success@example.com',
          subject: 'E2E email queue stage success test __SLOW_MS_400__',
          text: 'queue-stage-success __SLOW_MS_400__',
          dedupKey,
          traceId,
          source: 'e2e-success-stage',
        });

        expect(enqueueResult.queued).toBe(true);
        expect(enqueueResult.jobId).toBe(dedupKey);
        expect(enqueueResult.traceId).toBe(traceId);

        const queuedJob = await emailQueue.getJob(dedupKey);
        expect(queuedJob).toBeDefined();

        const recordBeforeStart = await waitAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId: dedupKey,
          statuses: ['queued'],
          timeoutMs: 5000,
          pollMs: 100,
        });
        expect(recordBeforeStart.status).toBe('queued');
        expect(recordBeforeStart.source).toBe('user_action');
        expect(recordBeforeStart.traceId).toBe(traceId);
        expect(recordBeforeStart.reason).toBe('enqueue_accepted');

        await workerRuntime.start();
        const processingRecord = await waitAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId: dedupKey,
          statuses: ['processing'],
          timeoutMs: 5000,
          pollMs: 100,
        });
        expect(processingRecord.status).toBe('processing');
        expect(processingRecord.reason).toBe('worker_processing');
        expect(processingRecord.startedAt).toBeInstanceOf(Date);
        expect(processingRecord.finishedAt).toBeNull();

        const finalState = await waitJobFinalState({
          queue: emailQueue,
          jobId: dedupKey,
          timeoutMs: 20000,
          pollMs: 150,
        });
        expect(finalState.state).toBe('completed');

        const returnvalue = finalState.returnvalue as {
          readonly accepted?: boolean;
          readonly providerMessageId?: string;
        };
        expect(returnvalue.accepted).toBe(true);
        expect(typeof returnvalue.providerMessageId).toBe('string');

        const record = await waitAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId: dedupKey,
          statuses: ['succeeded'],
          timeoutMs: 20000,
          pollMs: 150,
        });
        expect(record.queueName).toBe(BULLMQ_QUEUES.EMAIL);
        expect(record.jobName).toBe('send');
        expect(record.jobId).toBe(dedupKey);
        expect(record.traceId).toBe(traceId);
        expect(record.status).toBe('succeeded');
        expect(record.source).toBe('user_action');
        expect(record.reason).toBe('worker_completed');
        const attemptsMade = await getJobAttemptsMade({
          queue: emailQueue,
          jobId: dedupKey,
        });
        expect(record.attemptCount).toBe(attemptsMade);
        expect(record.maxAttempts).toBeNull();
        expect(record.enqueuedAt).toBeInstanceOf(Date);
        expect(record.startedAt).toBeInstanceOf(Date);
        expect(record.finishedAt).toBeInstanceOf(Date);
        expect(record.startedAt!.getTime()).toBeGreaterThanOrEqual(record.enqueuedAt.getTime());
        expect(record.finishedAt!.getTime()).toBeGreaterThanOrEqual(record.startedAt!.getTime());
      } finally {
        await workerRuntime.start();
      }
    }, 60000);
  });

  describe('失败路径分阶段落库', () => {
    it('暂停消费后应先无记录，恢复消费后应落库为 failed', async () => {
      const timestamp = Date.now();
      const dedupKey = `e2e-email-fail-job-${timestamp}`;
      const traceId = `e2e-email-fail-trace-${timestamp}`;

      try {
        await workerRuntime.stop();

        const enqueueResult = await queueEmail({
          apiApp,
          to: 'queue.stage.fail@fail.local',
          subject: 'E2E email queue stage failure test __SLOW_MS_400__',
          text: 'queue-stage-failure __SLOW_MS_400__',
          dedupKey,
          traceId,
          source: 'e2e-failure-stage',
        });

        expect(enqueueResult.queued).toBe(true);
        expect(enqueueResult.jobId).toBe(dedupKey);
        expect(enqueueResult.traceId).toBe(traceId);

        const queuedJob = await emailQueue.getJob(dedupKey);
        expect(queuedJob).toBeDefined();

        const recordBeforeStart = await waitAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId: dedupKey,
          statuses: ['queued'],
          timeoutMs: 5000,
          pollMs: 100,
        });
        expect(recordBeforeStart.status).toBe('queued');
        expect(recordBeforeStart.source).toBe('user_action');
        expect(recordBeforeStart.traceId).toBe(traceId);
        expect(recordBeforeStart.reason).toBe('enqueue_accepted');

        await workerRuntime.start();
        const processingRecord = await waitAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId: dedupKey,
          statuses: ['processing'],
          timeoutMs: 5000,
          pollMs: 100,
        });
        expect(processingRecord.status).toBe('processing');
        expect(processingRecord.reason).toBe('worker_processing');
        expect(processingRecord.startedAt).toBeInstanceOf(Date);
        expect(processingRecord.finishedAt).toBeNull();

        const finalState = await waitJobFinalState({
          queue: emailQueue,
          jobId: dedupKey,
          timeoutMs: 30000,
          pollMs: 150,
        });
        expect(finalState.state).toBe('failed');
        expect(finalState.failedReason).toContain('Simulated email provider failure');

        const record = await waitAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId: dedupKey,
          statuses: ['failed'],
          timeoutMs: 30000,
          pollMs: 150,
        });
        expect(record.queueName).toBe(BULLMQ_QUEUES.EMAIL);
        expect(record.jobName).toBe('send');
        expect(record.jobId).toBe(dedupKey);
        expect(record.traceId).toBe(traceId);
        expect(record.status).toBe('failed');
        expect(record.source).toBe('user_action');
        expect(record.reason).toContain('Simulated email provider failure');
        const attemptsMade = await getJobAttemptsMade({
          queue: emailQueue,
          jobId: dedupKey,
        });
        expect(record.attemptCount).toBe(attemptsMade);
        expect(record.maxAttempts).toBeNull();
        expect(record.enqueuedAt).toBeInstanceOf(Date);
        expect(record.startedAt).toBeInstanceOf(Date);
        expect(record.finishedAt).toBeInstanceOf(Date);
        expect(record.startedAt!.getTime()).toBeGreaterThanOrEqual(record.enqueuedAt.getTime());
        expect(record.finishedAt!.getTime()).toBeGreaterThanOrEqual(record.startedAt!.getTime());
      } finally {
        await workerRuntime.start();
      }
    }, 60000);
  });

  describe('幂等与异常分支', () => {
    it('相同 dedupKey 重复入队应只消费一次并只保留一条记录', async () => {
      const timestamp = Date.now();
      const dedupKey = `e2e-email-dedup-job-${timestamp}`;
      const firstTraceId = `e2e-email-dedup-trace-first-${timestamp}`;
      const secondTraceId = `e2e-email-dedup-trace-second-${timestamp}`;

      try {
        await workerRuntime.stop();

        const firstEnqueue = await queueEmail({
          apiApp,
          to: 'queue.dedup@example.com',
          subject: 'E2E email queue dedup test',
          text: 'queue-dedup',
          dedupKey,
          traceId: firstTraceId,
          source: 'e2e-dedup',
        });
        const secondEnqueue = await queueEmail({
          apiApp,
          to: 'queue.dedup@example.com',
          subject: 'E2E email queue dedup test',
          text: 'queue-dedup',
          dedupKey,
          traceId: secondTraceId,
          source: 'e2e-dedup-repeat',
        });

        expect(firstEnqueue.queued).toBe(true);
        expect(secondEnqueue.queued).toBe(true);
        expect(firstEnqueue.jobId).toBe(dedupKey);
        expect(secondEnqueue.jobId).toBe(dedupKey);
        expect(firstEnqueue.traceId).toBe(firstTraceId);
        expect(secondEnqueue.traceId).toBe(firstTraceId);

        const recordBeforeStart = await waitAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId: dedupKey,
          statuses: ['queued'],
          timeoutMs: 5000,
          pollMs: 100,
        });
        expect(recordBeforeStart.status).toBe('queued');
        expect(recordBeforeStart.source).toBe('user_action');
        expect(recordBeforeStart.traceId).toBe(firstTraceId);
        expect(recordBeforeStart.reason).toBe('enqueue_accepted');

        await workerRuntime.start();

        const finalState = await waitJobFinalState({
          queue: emailQueue,
          jobId: dedupKey,
          timeoutMs: 20000,
          pollMs: 150,
        });
        expect(finalState.state).toBe('completed');

        const record = await waitAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId: dedupKey,
          statuses: ['succeeded'],
          timeoutMs: 20000,
          pollMs: 150,
        });
        expect(record.status).toBe('succeeded');

        const recordCount = await countAsyncTaskRecords({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId: dedupKey,
        });
        expect(recordCount).toBe(1);
      } finally {
        await workerRuntime.start();
      }
    }, 60000);

    it('未传 dedupKey 时应自动生成 jobId 并正常入队', async () => {
      const timestamp = Date.now();
      const traceId = `e2e-email-no-dedup-trace-${timestamp}`;

      const response = await request(apiApp.getHttpServer())
        .post('/graphql')
        .send({
          query: QUEUE_EMAIL_MUTATION,
          variables: {
            input: {
              to: 'queue.no.dedup@example.com',
              subject: 'E2E email queue no dedup test',
              text: 'queue-no-dedup',
              traceId,
              meta: {
                source: 'e2e-no-dedup',
              },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data?.queueEmail?.queued).toBe(true);
      expect(response.body.data?.queueEmail?.traceId).toBe(traceId);
      expect(typeof response.body.data?.queueEmail?.jobId).toBe('string');
      expect(response.body.data?.queueEmail?.jobId.length).toBeGreaterThan(0);
      expect(response.body.data?.queueEmail?.jobId).not.toBe(traceId);

      const record = await waitAsyncTaskRecordByTrace({
        dataSource,
        queueName: BULLMQ_QUEUES.EMAIL,
        traceId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.jobName).toBe('send');
      expect(record.source).toBe('user_action');
      expect(record.traceId).toBe(traceId);
    }, 60000);

    it('payload 缺失 traceId 时应走降级失败语义且不回流 jobId', async () => {
      const timestamp = Date.now();
      const jobId = `e2e-email-missing-trace-job-${timestamp}`;

      try {
        await workerRuntime.stop();
        await emailQueue.add(
          EMAIL_SEND_JOB_NAME,
          {
            to: 'queue.missing.trace@example.com',
            subject: 'E2E email missing trace test',
            text: 'queue-missing-trace',
            meta: {
              source: 'e2e-email-missing-trace',
            },
          },
          {
            jobId,
            attempts: 1,
            removeOnComplete: false,
            removeOnFail: false,
          },
        );

        await workerRuntime.start();
        const finalState = await waitJobFinalState({
          queue: emailQueue,
          jobId,
          timeoutMs: 20000,
          pollMs: 150,
        });
        expect(finalState.state).toBe('failed');

        const record = await waitAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.EMAIL,
          jobId,
          statuses: ['failed'],
          timeoutMs: 20000,
          pollMs: 150,
        });
        expect(record.traceId).toBe(`degraded-trace:${EMAIL_SEND_JOB_NAME}:${jobId}`);
        expect(record.reason).toContain('missing_payload_trace_id');
      } finally {
        await workerRuntime.start();
      }
    }, 60000);

    it('failed 事件缺失 job 时应落库 missing-job 降级语义', async () => {
      const timestamp = Date.now();
      const reasonKeyword = `manual-email-missing-job-${timestamp}`;

      await emailSendHandler.onFailed({
        job: undefined,
        error: new Error(reasonKeyword),
      });

      const record = await waitFailedAsyncTaskRecordByReason({
        dataSource,
        queueName: BULLMQ_QUEUES.EMAIL,
        reasonKeyword,
        timeoutMs: 10000,
        pollMs: 120,
      });
      expect(record.jobName).toBe(EMAIL_SEND_JOB_NAME);
      expect(record.jobId).toMatch(new RegExp(`^missing-job:${EMAIL_SEND_JOB_NAME}:\\d+$`));
      expect(record.traceId).toBe(record.jobId);
      expect(record.reason).toContain(`worker_event_job_missing:${reasonKeyword}`);
    }, 60000);
  });

  describe('标识映射一致性', () => {
    it('传入 dedupKey 时应保持 API traceId 与落库 traceId 的当前映射行为', async () => {
      const timestamp = Date.now();
      const dedupKey = `e2e-email-mapping-job-${timestamp}`;
      const traceId = `e2e-email-mapping-trace-${timestamp}`;

      const enqueueResult = await queueEmail({
        apiApp,
        to: 'queue.trace-id@example.com',
        subject: 'E2E email queue trace mapping test',
        text: 'queue-trace-mapping',
        dedupKey,
        traceId,
        source: 'e2e-trace-map',
      });

      expect(enqueueResult.queued).toBe(true);
      expect(enqueueResult.jobId).toBe(dedupKey);
      expect(enqueueResult.traceId).toBe(traceId);

      const finalState = await waitJobFinalState({
        queue: emailQueue,
        jobId: enqueueResult.jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.EMAIL,
        jobId: enqueueResult.jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.traceId).toBe(traceId);
      expect(record.jobId).toBe(enqueueResult.jobId);
      expect(record.status).toBe('succeeded');
    }, 60000);

    it('traceId 缺省时应自动生成并在 worker 消费侧保持一致', async () => {
      const timestamp = Date.now();
      const dedupKey = `e2e-email-generated-trace-job-${timestamp}`;

      const enqueueResult = await queueEmail({
        apiApp,
        to: 'queue.trace-id-generated@example.com',
        subject: 'E2E email queue generated trace test',
        text: 'queue-generated-trace',
        dedupKey,
        source: 'e2e-trace-generated',
      });

      expect(enqueueResult.queued).toBe(true);
      expect(enqueueResult.jobId).toBe(dedupKey);
      expect(typeof enqueueResult.traceId).toBe('string');
      expect(enqueueResult.traceId.length).toBeGreaterThan(0);
      expect(enqueueResult.traceId).not.toBe(dedupKey);

      const finalState = await waitJobFinalState({
        queue: emailQueue,
        jobId: enqueueResult.jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.EMAIL,
        jobId: enqueueResult.jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.traceId).toBe(enqueueResult.traceId);
      expect(record.jobId).toBe(enqueueResult.jobId);
      expect(record.status).toBe('succeeded');
    }, 60000);
  });

  describe('email 触发业务闭环', () => {
    let staffPrimaryAccessToken: string;

    beforeAll(async () => {
      const accountRepository = dataSource.getRepository(AccountEntity);
      const existingStaffPrimary = await accountRepository.findOne({
        where: { loginName: testAccountsConfig.staffPrimary.loginName },
      });
      if (!existingStaffPrimary) {
        const createAccountUsecase = apiApp.get(CreateAccountUsecase);
        await seedTestAccounts({
          dataSource,
          createAccountUsecase,
          includeKeys: ['staffPrimary'],
        });
      }

      staffPrimaryAccessToken = await loginAndGetAccessToken({
        apiApp,
        loginName: testAccountsConfig.staffPrimary.loginName,
        loginPassword: testAccountsConfig.staffPrimary.loginPassword,
      });
    });

    it('应覆盖 resetPassword 的 email 触发闭环', async () => {
      const timestamp = Date.now();
      const oldPassword = 'Rst!a9K@q2';
      const newPassword = 'Rst!b7M@w4';
      const loginName = `resetflow${timestamp}`;
      const loginEmail = `reset-flow-${timestamp}@example.com`;

      await registerAccount({
        apiApp,
        loginName,
        loginEmail,
        loginPassword: oldPassword,
      });
      const inviteeToken = await loginAndGetAccessToken({
        apiApp,
        loginName,
        loginPassword: oldPassword,
      });
      const inviteeAccountId = getAccountIdFromToken({
        apiApp,
        token: inviteeToken,
      });

      const verificationToken = await createVerificationRecord({
        apiApp,
        bearer: staffPrimaryAccessToken,
        type: VerificationRecordType.PASSWORD_RESET,
        targetAccountId: inviteeAccountId,
        payload: {
          flow: 'password_reset',
          accountId: inviteeAccountId,
        },
      });

      await assertVerificationRecordReadable({
        apiApp,
        token: verificationToken,
        expectedType: VerificationRecordType.PASSWORD_RESET,
      });

      const dedupKey = `e2e-rst-${timestamp}`;
      const traceId = `e2e-rst-t-${timestamp}`;
      const enqueueResult = await queueEmail({
        apiApp,
        to: loginEmail,
        subject: 'Reset Password Verification',
        text: `token=${verificationToken}`,
        dedupKey,
        traceId,
        source: 'e2e-reset-password-flow',
      });

      expect(enqueueResult.queued).toBe(true);
      const finalState = await waitJobFinalState({
        queue: emailQueue,
        jobId: enqueueResult.jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');

      const asyncRecord = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.EMAIL,
        jobId: enqueueResult.jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(asyncRecord.status).toBe('succeeded');

      const resetResult = await resetPassword({
        apiApp,
        token: verificationToken,
        newPassword,
      });
      expect(resetResult.success).toBe(true);
      expect(resetResult.accountId).toBe(inviteeAccountId);

      const reloginToken = await loginAndGetAccessToken({
        apiApp,
        loginName,
        loginPassword: newPassword,
      });
      expect(reloginToken).toBeTruthy();
    }, 60000);
  });
});
