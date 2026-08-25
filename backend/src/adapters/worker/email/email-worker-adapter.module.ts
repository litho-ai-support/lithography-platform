// src/adapters/worker/email/email-worker-adapter.module.ts
import { Module } from '@nestjs/common';
import { EmailWorkerUsecasesModule } from '@src/usecases/email-worker/email-worker-usecases.module';
import { EmailSendHandler } from './email-send.handler';
import { EmailSendProcessor } from './email-send.processor';

@Module({
  imports: [EmailWorkerUsecasesModule],
  providers: [EmailSendHandler, EmailSendProcessor],
})
export class EmailWorkerAdapterModule {}
