// src/adapters/worker/email/email-send.handler.ts
import { Injectable } from '@nestjs/common';
import { ConsumeEmailJobUsecase } from '@src/usecases/email-worker/consume-email-job.usecase';
import {
  type EmailSendJob,
  type EmailSendResult,
  mapEmailSendJobToCompleteInput,
  mapEmailSendJobToFailInput,
  mapEmailSendJobToProcessInput,
  mapMissingEmailSendJobToFailInput,
} from './email-send.mapper';

@Injectable()
export class EmailSendHandler {
  constructor(private readonly consumeEmailJobUsecase: ConsumeEmailJobUsecase) {}

  async process(input: { readonly job: EmailSendJob }): Promise<EmailSendResult> {
    return await this.consumeEmailJobUsecase.process(
      mapEmailSendJobToProcessInput({ job: input.job }),
    );
  }

  async onCompleted(input: { readonly job: EmailSendJob }): Promise<void> {
    await this.consumeEmailJobUsecase.complete(mapEmailSendJobToCompleteInput({ job: input.job }));
  }

  async onFailed(input: {
    readonly job: EmailSendJob | undefined;
    readonly error: Error;
  }): Promise<void> {
    if (!input.job) {
      await this.consumeEmailJobUsecase.fail(
        mapMissingEmailSendJobToFailInput({ error: input.error }),
      );
      return;
    }
    await this.consumeEmailJobUsecase.fail(
      mapEmailSendJobToFailInput({ job: input.job, error: input.error }),
    );
  }
}
