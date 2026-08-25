import { AiWorkflowNonRetryableError } from '@src/usecases/ai-worker/ai-workflow-worker-errors';
import type { AiWorkflowWorkerActivationUsecase } from '@src/usecases/ai-worker/ai-workflow-worker-activation.usecase';
import { UnrecoverableError } from 'bullmq';
import type { AiWorkflowJobHandler } from './ai-workflow-job.handler';
import type { AiWorkflowJob } from './ai-workflow-job.mapper';
import { AiWorkflowJobProcessor } from './ai-workflow-job.processor';

describe(AiWorkflowJobProcessor.name, () => {
  it('converts workflow non-retryable error to BullMQ UnrecoverableError', async () => {
    const handler = {
      process: jest
        .fn()
        .mockRejectedValue(
          new AiWorkflowNonRetryableError(
            'workflow_handler_not_found',
            'WORKFLOW_HANDLER_NOT_FOUND',
          ),
        ),
    };
    const processor = new AiWorkflowJobProcessor(
      handler as unknown as AiWorkflowJobHandler,
      { shouldRun: () => true } as AiWorkflowWorkerActivationUsecase,
    );

    await expect(processor.process(createWorkflowJob())).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

function createWorkflowJob(): AiWorkflowJob {
  return {
    name: 'workflow',
    id: 'job-1',
    data: { workflowId: 'workflow-1', traceId: 'trace-1' },
    attemptsMade: 0,
    opts: { attempts: 1 },
    timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
  } as unknown as AiWorkflowJob;
}
