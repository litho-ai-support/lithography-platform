// src/modules/common/ai-worker/ai-worker.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiInfrastructureModule } from '@src/infrastructure/ai/ai-infrastructure.module';
import { AiCapabilityModule } from '../ai-capability/ai-capability.module';
import { AiWorkerService } from './ai-worker.service';
import { AI_PROVIDER_REGISTRY_OPTIONS, type AiProviderRegistryOptions } from './ai-worker.options';
import { AiProviderRegistry } from './providers/ai-provider-registry';

@Module({
  imports: [AiCapabilityModule, AiInfrastructureModule],
  providers: [
    {
      provide: AI_PROVIDER_REGISTRY_OPTIONS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): AiProviderRegistryOptions => ({
        providerMode: configService.get<string>('aiWorker.providerMode', 'mock'),
      }),
    },
    AiWorkerService,
    AiProviderRegistry,
  ],
  exports: [AiWorkerService],
})
export class AiWorkerModule {}
