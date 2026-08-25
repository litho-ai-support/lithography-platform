// src/infrastructure/redis/redis.module.ts
import { Inject, Injectable, Module, OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

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

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService): Redis => {
    const options = buildRedisOptions(configService);
    return new Redis(options);
  },
  inject: [ConfigService],
};

@Injectable()
class RedisLifecycleService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

@Module({
  imports: [ConfigModule],
  providers: [redisClientProvider, RedisLifecycleService],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
