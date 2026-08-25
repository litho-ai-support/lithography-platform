import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EmailWorkerActivationUsecase } from '@src/usecases/email-worker/email-worker-activation.usecase';
import { EmailSendHandler } from './email-send.handler';
import { EMAIL_QUEUE_NAME, type EmailSendJob, type EmailSendResult } from './email-send.mapper';

@Injectable()
@Processor(EMAIL_QUEUE_NAME, { autorun: false })
export class EmailSendProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(
    private readonly handler: EmailSendHandler,
    private readonly workerActivation: EmailWorkerActivationUsecase,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    if (!this.workerActivation.shouldRun()) return;
    void this.worker.run().catch((error: unknown) => {
      this.logger.error(
        'Email Worker stopped unexpectedly',
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  async process(job: EmailSendJob): Promise<EmailSendResult> {
    return await this.handler.process({ job });
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: EmailSendJob): Promise<void> {
    await this.handler.onCompleted({ job });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: EmailSendJob | undefined, error: Error): Promise<void> {
    await this.handler.onFailed({ job, error });
  }
}
