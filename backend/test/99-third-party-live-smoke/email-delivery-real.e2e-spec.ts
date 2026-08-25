// test/09-email-delivery-real/email-delivery-real.e2e-spec.ts
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { WorkerModule } from '@src/bootstraps/worker/worker.module';
import { BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqWorkerRuntime } from '@src/infrastructure/bullmq/worker.runtime';
import { Queue } from 'bullmq';
import os from 'node:os';
import request from 'supertest';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';

type FinalJobState = 'completed' | 'failed';

const QUEUE_EMAIL_MUTATION = `
  mutation QueueEmail($input: QueueEmailInput!) {
    queueEmail(input: $input) {
      queued
      jobId
      traceId
    }
  }
`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const formatCst = (ms: number): string =>
  new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

const buildServerInfo = (): string => {
  const hostname = os.hostname();
  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();
  const cpus = os.cpus().length;
  const load = os
    .loadavg()
    .map((value) => value.toFixed(2))
    .join(',');
  const uptimeSec = Math.round(os.uptime());
  const node = process.version;
  const pid = process.pid;
  const nodeEnv = process.env.NODE_ENV ?? 'unknown';
  return [
    `host=${hostname}`,
    `platform=${platform} ${release} ${arch}`,
    `cpus=${cpus}`,
    `loadavg=${load}`,
    `uptimeSec=${uptimeSec}`,
    `node=${node}`,
    `pid=${pid}`,
    `NODE_ENV=${nodeEnv}`,
  ].join('\n');
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

const queueEmail = async (input: {
  readonly apiApp: INestApplication;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly dedupKey: string;
  readonly traceId: string;
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
            source: 'e2e-real-delivery',
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

describe('邮件发送 E2E（真实发送）', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplicationContext;
  let emailQueue: Queue;
  let workerRuntime: BullMqWorkerRuntime;

  beforeAll(async () => {
    initGraphQLSchema();

    const apiModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    apiApp = apiModuleFixture.createNestApplication();
    await apiApp.init();

    workerApp = await NestFactory.createApplicationContext(WorkerModule);

    emailQueue = apiApp.get<Queue>(getQueueToken(BULLMQ_QUEUES.EMAIL));
    workerRuntime = workerApp.get(BullMqWorkerRuntime);
    await workerRuntime.start();
  }, 60000);

  afterAll(async () => {
    if (workerApp) {
      await workerApp.close();
    }
    if (apiApp) {
      await apiApp.close();
    }
  });

  it('应完成真实发送任务', async () => {
    const timestamp = Date.now();
    const timestampCst = formatCst(timestamp);
    const to = process.env.E2E_EMAIL_TO ?? 'yoyobq@hotmail.com';
    const dedupKey = `e2e-real-delivery-${timestamp}`;
    const traceId = `e2e-real-delivery-trace-${timestamp}`;
    const debugText = [
      'e2e-real-delivery',
      `createdAtCST=${timestampCst}`,
      `createdAtMs=${timestamp}`,
      `traceId=${traceId}`,
      `dedupKey=${dedupKey}`,
      'server',
      buildServerInfo(),
    ].join('\n');

    const enqueueResult = await queueEmail({
      apiApp,
      to,
      subject: `E2E real email ${timestampCst}`,
      text: debugText,
      dedupKey,
      traceId,
    });

    expect(enqueueResult.queued).toBe(true);
    expect(enqueueResult.jobId).toBe(dedupKey);

    const finalState = await waitJobFinalState({
      queue: emailQueue,
      jobId: enqueueResult.jobId,
      timeoutMs: 60000,
      pollMs: 200,
    });

    expect(finalState.state).toBe('completed');
    const returnvalue = finalState.returnvalue as {
      readonly accepted?: boolean;
      readonly providerMessageId?: string;
    };
    expect(returnvalue.accepted).toBe(true);
    expect(typeof returnvalue.providerMessageId).toBe('string');
  }, 90000);
});
