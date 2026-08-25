// src/bootstraps/api/api.controller.ts
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiService, type ApiHealthPayload, type ApiReadinessPayload } from './api.service';

@Controller()
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  @Get('health')
  getHealth(): ApiHealthPayload {
    return this.apiService.getHealth();
  }

  @Get('health/readiness')
  async getReadiness(): Promise<ApiReadinessPayload> {
    try {
      return await this.apiService.getReadiness();
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        service: 'api',
        checks: {
          database: 'down',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}
