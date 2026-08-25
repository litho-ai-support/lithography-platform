import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import type { PinoLogger } from 'nestjs-pino';
import {
  createDisabledCapabilityStateReader,
  createEnabledCapabilityStateReader,
} from '../../../../test/support/capability/capability-state-reader.fixture';
import { AiWorkflowQueueService } from './ai-workflow-queue.service';

describe(AiWorkflowQueueService.name, () => {
  const createHarness = (disabled = false) => {
    const producer = {
      enqueue: jest.fn().mockResolvedValue({ jobId: 'workflow-job-1', traceId: 'trace-1' }),
      hasJob: jest.fn().mockResolvedValue({ jobId: 'workflow-job-1', exists: true }),
      checkQueueAvailable: jest.fn().mockResolvedValue({ available: true }),
    };
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const service = new AiWorkflowQueueService(
      producer as unknown as BullMqProducerGateway,
      logger as unknown as PinoLogger,
      disabled
        ? createDisabledCapabilityStateReader('ai.workflow')
        : createEnabledCapabilityStateReader(),
    );
    return { producer, service };
  };

  it('owns workflow enqueue, lookup, and health on the workflow queue', async () => {
    const { producer, service } = createHarness();

    await expect(
      service.enqueueWorkflow({
        workflowId: 'workflow-1',
        traceId: 'trace-1',
        jobId: 'workflow-job-1',
      }),
    ).resolves.toEqual({ jobId: 'workflow-job-1', traceId: 'trace-1' });
    await expect(service.hasWorkflowJob({ jobId: 'workflow-job-1' })).resolves.toEqual({
      jobId: 'workflow-job-1',
      exists: true,
    });
    await expect(service.checkWorkflowQueueAvailable()).resolves.toEqual({ available: true });

    expect(producer.enqueue).toHaveBeenCalledWith({
      queueName: BULLMQ_QUEUES.AI_WORKFLOW,
      jobName: BULLMQ_JOBS.AI.WORKFLOW,
      payload: { workflowId: 'workflow-1', traceId: 'trace-1' },
      explicitJobId: 'workflow-job-1',
      traceId: 'trace-1',
    });
    expect(producer.hasJob).toHaveBeenCalledWith({
      queueName: BULLMQ_QUEUES.AI_WORKFLOW,
      jobId: 'workflow-job-1',
    });
    expect(producer.checkQueueAvailable).toHaveBeenCalledWith({
      queueName: BULLMQ_QUEUES.AI_WORKFLOW,
    });
  });

  it('maps remote queue health failure but exposes local registration drift', async () => {
    const { producer, service } = createHarness();
    producer.checkQueueAvailable.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(service.checkWorkflowQueueAvailable()).resolves.toEqual({
      available: false,
      reason: 'QUEUE_UNAVAILABLE',
    });

    const registrationError = new Error(
      `BullMQ queue is not registered: ${BULLMQ_QUEUES.AI_WORKFLOW}`,
    );
    producer.checkQueueAvailable.mockRejectedValueOnce(registrationError);
    await expect(service.checkWorkflowQueueAvailable()).rejects.toBe(registrationError);
  });

  it('rejects disabled workflow admission before touching BullMQ', async () => {
    const { producer, service } = createHarness(true);

    await expect(
      service.enqueueWorkflow({
        workflowId: 'workflow-1',
        traceId: 'trace-1',
        jobId: 'workflow-job-1',
      }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});
