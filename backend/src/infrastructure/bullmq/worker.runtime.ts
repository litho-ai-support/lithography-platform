// src/infrastructure/bullmq/worker.runtime.ts
import { getQueueToken } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { BullMqQueueName } from './bullmq.constants';
import { BULLMQ_QUEUE_NAMES, BULLMQ_QUEUE_REGISTRY } from './queue-registry';

export type WorkerRuntimeHealthStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface WorkerQueueHealth {
  readonly queueName: BullMqQueueName;
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly failed: number;
  readonly completed: number;
}

export interface WorkerRuntimeHealth {
  readonly status: WorkerRuntimeHealthStatus;
  readonly running: boolean;
  readonly queues: ReadonlyArray<WorkerQueueHealth>;
}

@Injectable()
export class BullMqWorkerRuntime implements OnModuleInit, OnModuleDestroy {
  private running = false;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BullMqWorkerRuntime.name);
  }

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.running) return;
    for (const queueName of BULLMQ_QUEUE_NAMES) {
      const queue = this.getQueue({ queueName });
      await queue.resume();
    }
    this.running = true;
    this.logger.info({ queueCount: BULLMQ_QUEUE_NAMES.length }, 'BullMQ worker runtime started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    for (const queueName of BULLMQ_QUEUE_NAMES) {
      const queue = this.getQueue({ queueName });
      await queue.pause();
    }
    this.running = false;
    this.logger.info('BullMQ worker runtime stopped');
  }

  async health(): Promise<WorkerRuntimeHealth> {
    const queues: WorkerQueueHealth[] = [];
    for (const queueName of BULLMQ_QUEUE_NAMES) {
      const queue = this.getQueue({ queueName });
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      );
      queues.push({
        queueName,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
      });
    }
    const status = this.resolveStatus({ queues });
    return {
      status,
      running: this.running,
      queues,
    };
  }

  getRuntimePolicy(input: { readonly queueName: BullMqQueueName }) {
    return BULLMQ_QUEUE_REGISTRY[input.queueName].runtime;
  }

  private resolveStatus(input: {
    readonly queues: ReadonlyArray<WorkerQueueHealth>;
  }): WorkerRuntimeHealthStatus {
    if (!this.running) return 'DOWN';
    const hasFailedJobs = input.queues.some((queue) => queue.failed > 0);
    if (hasFailedJobs) return 'DEGRADED';
    return 'UP';
  }

  private getQueue(input: { readonly queueName: BullMqQueueName }): Queue {
    const token = getQueueToken(input.queueName);
    const queue = this.moduleRef.get<Queue>(token, { strict: false });
    if (!queue) {
      throw new Error(`BullMQ queue is not registered: ${input.queueName}`);
    }
    return queue;
  }
}
