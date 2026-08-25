import type { AiWorkflowWorkerActivationUsecase } from '@src/usecases/ai-worker/ai-workflow-worker-activation.usecase';
import type { AiWorkerActivationUsecase } from '@src/usecases/ai-worker/ai-worker-activation.usecase';
import type { EmailWorkerActivationUsecase } from '@src/usecases/email-worker/email-worker-activation.usecase';
import type { AiWorkflowJobHandler } from './ai-workflow/ai-workflow-job.handler';
import { AiWorkflowJobProcessor } from './ai-workflow/ai-workflow-job.processor';
import type { AiJobHandler } from './ai/ai-job.handler';
import { AiJobProcessor } from './ai/ai-job.processor';
import type { EmailSendHandler } from './email/email-send.handler';
import { EmailSendProcessor } from './email/email-send.processor';

const fixtures = [
  {
    name: 'Email',
    processorType: EmailSendProcessor,
    create: (shouldRun: boolean) =>
      new EmailSendProcessor(
        {} as EmailSendHandler,
        {
          shouldRun: jest.fn().mockReturnValue(shouldRun),
        } as unknown as EmailWorkerActivationUsecase,
      ),
  },
  {
    name: 'AI Execution',
    processorType: AiJobProcessor,
    create: (shouldRun: boolean) =>
      new AiJobProcessor(
        {} as AiJobHandler,
        { shouldRun: jest.fn().mockReturnValue(shouldRun) } as unknown as AiWorkerActivationUsecase,
      ),
  },
  {
    name: 'AI Workflow',
    processorType: AiWorkflowJobProcessor,
    create: (shouldRun: boolean) =>
      new AiWorkflowJobProcessor(
        {} as AiWorkflowJobHandler,
        {
          shouldRun: jest.fn().mockReturnValue(shouldRun),
        } as unknown as AiWorkflowWorkerActivationUsecase,
      ),
  },
] as const;

describe('capability-aware Worker activation', () => {
  it.each(fixtures)('$name stays stopped when its capability is disabled', (fixture) => {
    const processor = fixture.create(false);
    const run = installWorker(processor);

    processor.onApplicationBootstrap();

    expect(run).not.toHaveBeenCalled();
    expect(Reflect.getMetadata('bullmq:worker_metadata', fixture.processorType)).toMatchObject({
      autorun: false,
    });
  });

  it.each(fixtures)('$name starts when its capability is enabled', (fixture) => {
    const processor = fixture.create(true);
    const run = installWorker(processor);

    processor.onApplicationBootstrap();

    expect(run).toHaveBeenCalledTimes(1);
  });
});

function installWorker(processor: object): jest.MockedFunction<() => Promise<void>> {
  const run = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  Object.defineProperty(processor, '_worker', {
    configurable: true,
    value: { run },
  });
  return run;
}
