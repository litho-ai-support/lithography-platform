// src/bootstraps/api/api.service.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ApiHealthPayload {
  readonly status: 'ok';
  readonly service: 'api';
  readonly timestamp: string;
  readonly uptimeSeconds: number;
}

export interface ApiReadinessPayload {
  readonly status: 'ready';
  readonly service: 'api';
  readonly checks: {
    readonly database: 'up';
  };
  readonly timestamp: string;
}

@Injectable()
export class ApiService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  getHealth(): ApiHealthPayload {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async getReadiness(): Promise<ApiReadinessPayload> {
    if (!this.dataSource.isInitialized) {
      throw new Error('database datasource not initialized');
    }
    await this.dataSource.query('SELECT 1');
    return {
      status: 'ready',
      service: 'api',
      checks: {
        database: 'up',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
