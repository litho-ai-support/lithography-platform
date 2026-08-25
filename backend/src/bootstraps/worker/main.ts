// src/bootstraps/worker/main.ts
// 文件位置：/var/www/backend/src/bootstraps/worker/main.js
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  const logger = app.get(Logger);
  logger.log('Worker 已启动并完成基础设施装配');
}

void bootstrap();
