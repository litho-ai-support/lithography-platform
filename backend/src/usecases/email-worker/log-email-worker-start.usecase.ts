// src/usecases/email-worker/log-email-worker-start.usecase.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class LogEmailWorkerStartUsecase implements OnModuleInit {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LogEmailWorkerStartUsecase.name);
  }

  onModuleInit(): void {
    this.logger.info('Email worker usecase started');
  }
}
