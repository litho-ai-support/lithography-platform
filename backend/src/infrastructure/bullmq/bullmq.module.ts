// src/infrastructure/bullmq/bullmq.module.ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';
import { BullMqProducerGateway } from './producer.gateway';
import { BULLMQ_REGISTER_QUEUE_OPTIONS } from './queue-registry';

const getRequiredConfigString = (configService: ConfigService, key: string): string => {
  const value = configService.get<string>(key);
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
};

const getRequiredConfigNumber = (configService: ConfigService, key: string): number => {
  const value = configService.get<number>(key);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a valid number`);
  }
  return value;
};

const buildRedisOptions = (configService: ConfigService): RedisOptions => {
  const host = getRequiredConfigString(configService, 'redis.host');
  const port = getRequiredConfigNumber(configService, 'redis.port');
  const db = getRequiredConfigNumber(configService, 'redis.db');
  const password = configService.get<string>('redis.password');
  const tlsEnabled = configService.get<boolean>('redis.tls', false);
  const options: RedisOptions = {
    host,
    port,
    db,
  };
  if (password && password.trim().length > 0) {
    options.password = password;
  }
  if (tlsEnabled) {
    options.tls = {};
  }
  return options;
};

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connection = buildRedisOptions(configService);
        const prefix = configService.get<string>('bullmq.prefix', 'bullmq');
        return {
          connection,
          prefix,
        };
      },
    }),
    BullModule.registerQueue(...BULLMQ_REGISTER_QUEUE_OPTIONS),
  ],
  providers: [BullMqProducerGateway],
  exports: [BullModule, BullMqProducerGateway],
})
export class BullMqModule {}
