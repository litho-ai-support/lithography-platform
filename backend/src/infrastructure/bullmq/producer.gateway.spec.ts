/// <reference types="jest" />
// src/infrastructure/bullmq/producer.gateway.spec.ts
import type { ModuleRef } from '@nestjs/core';
import type { JobsOptions } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from './bullmq.constants';
import { BullMqProducerGateway } from './producer.gateway';

interface TestJob {
  readonly id?: string | number;
  readonly name: string;
  readonly data: unknown;
}

interface TestQueue {
  readonly add: jest.Mock<Promise<TestJob>, [string, unknown, JobsOptions]>;
  readonly getJob: jest.Mock<Promise<TestJob | null>, [string]>;
}

describe('BullMqProducerGateway', () => {
  const createHarness = () => {
    const queue: TestQueue = {
      add: jest.fn((name: string, data: unknown, options: JobsOptions) =>
        Promise.resolve({
          id: String(options.jobId),
          name,
          data,
        }),
      ),
      getJob: jest.fn((_jobId: string) => Promise.resolve(null)),
    };
    const moduleRef = {
      get: jest.fn(() => queue),
    };
    const logger = {
      setContext: jest.fn(),
      info: jest.fn(),
    };
    const gateway = new BullMqProducerGateway(
      moduleRef as unknown as ModuleRef,
      logger as unknown as PinoLogger,
    );
    return { gateway, logger, moduleRef, queue };
  };

  it('enqueues with explicit jobId without dedup precheck', async () => {
    const { gateway, queue } = createHarness();

    const result = await gateway.enqueue({
      queueName: BULLMQ_QUEUES.AI_WORKFLOW,
      jobName: BULLMQ_JOBS.AI.WORKFLOW,
      payload: {
        workflowId: 'workflow-1',
        traceId: 'trace-1',
      },
      explicitJobId: ' workflow-job-1 ',
      traceId: 'trace-1',
    });

    expect(result).toEqual({
      queueName: BULLMQ_QUEUES.AI_WORKFLOW,
      jobName: BULLMQ_JOBS.AI.WORKFLOW,
      jobId: 'workflow-job-1',
      traceId: 'trace-1',
    });
    expect(queue.getJob).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      BULLMQ_JOBS.AI.WORKFLOW,
      { workflowId: 'workflow-1', traceId: 'trace-1' },
      expect.objectContaining({ jobId: 'workflow-job-1' }),
    );
  });

  it('rejects explicit jobId together with dedupKey', async () => {
    const { gateway, queue } = createHarness();

    await expect(
      gateway.enqueue({
        queueName: BULLMQ_QUEUES.AI_WORKFLOW,
        jobName: BULLMQ_JOBS.AI.WORKFLOW,
        payload: {
          workflowId: 'workflow-1',
          traceId: 'trace-1',
        },
        explicitJobId: 'workflow-job-1',
        dedupKey: 'dedup-1',
        traceId: 'trace-1',
      }),
    ).rejects.toThrow(`explicit_job_id_conflicts_with_dedup_key:${BULLMQ_QUEUES.AI_WORKFLOW}`);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects blank explicit jobId', async () => {
    const { gateway } = createHarness();

    await expect(
      gateway.enqueue({
        queueName: BULLMQ_QUEUES.AI_WORKFLOW,
        jobName: BULLMQ_JOBS.AI.WORKFLOW,
        payload: {
          workflowId: 'workflow-1',
          traceId: 'trace-1',
        },
        explicitJobId: ' ',
        traceId: 'trace-1',
      }),
    ).rejects.toThrow('explicit_job_id_required');
  });

  it('keeps dedupKey path returning existing job identifiers', async () => {
    const { gateway, queue } = createHarness();
    queue.getJob.mockResolvedValueOnce({
      id: 'dedup-1',
      name: BULLMQ_JOBS.AI.GENERATE,
      data: {
        model: 'gpt-4.1-mini',
        prompt: 'hello',
        traceId: 'existing-trace',
      },
    });

    const result = await gateway.enqueue({
      queueName: BULLMQ_QUEUES.AI,
      jobName: BULLMQ_JOBS.AI.GENERATE,
      payload: {
        model: 'gpt-4.1-mini',
        prompt: 'hello',
      },
      dedupKey: 'dedup-1',
      traceId: 'new-trace',
    });

    expect(result.jobId).toBe('dedup-1');
    expect(result.traceId).toBe('existing-trace');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('checks job existence with plain result', async () => {
    const { gateway, queue } = createHarness();
    queue.getJob.mockResolvedValueOnce({
      id: 'workflow-job-1',
      name: BULLMQ_JOBS.AI.WORKFLOW,
      data: { workflowId: 'workflow-1', traceId: 'trace-1' },
    });

    await expect(
      gateway.hasJob({
        queueName: BULLMQ_QUEUES.AI_WORKFLOW,
        jobId: ' workflow-job-1 ',
      }),
    ).resolves.toEqual({
      queueName: BULLMQ_QUEUES.AI_WORKFLOW,
      jobId: 'workflow-job-1',
      exists: true,
    });
  });

  it('rejects blank jobId when checking job existence', async () => {
    const { gateway } = createHarness();

    await expect(
      gateway.hasJob({
        queueName: BULLMQ_QUEUES.AI,
        jobId: ' ',
      }),
    ).rejects.toThrow(`bullmq_job_id_required:${BULLMQ_QUEUES.AI}`);
  });

  it('checks queue availability without mutating the queue', async () => {
    const { gateway, queue } = createHarness();

    await expect(
      gateway.checkQueueAvailable({
        queueName: BULLMQ_QUEUES.AI,
      }),
    ).resolves.toEqual({
      queueName: BULLMQ_QUEUES.AI,
      available: true,
    });

    expect(queue.getJob).toHaveBeenCalledWith('queue-health-probe');
    expect(queue.add).not.toHaveBeenCalled();
  });
});
