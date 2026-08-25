// src/modules/common/ai-worker/ai-worker.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { AiProviderRegistry } from './providers/ai-provider-registry';
import { CapabilityRuntimeContributionProvider } from '@src/infrastructure/capability/capability.decorators';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import {
  CAPABILITY_STATE_READER,
  type CapabilityStateReader,
} from '@src/modules/common/capability-state-reader.contract';
import type {
  EmbedAiContentInput,
  EmbedAiContentResult,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from './ai-worker.types';

@Injectable()
@CapabilityRuntimeContributionProvider({
  capabilityId: 'ai.execution',
  runtimeDependencies: [],
  queueResources: [
    { queueName: BULLMQ_QUEUES.AI, jobName: BULLMQ_JOBS.AI.GENERATE },
    { queueName: BULLMQ_QUEUES.AI, jobName: BULLMQ_JOBS.AI.EMBED },
  ],
})
export class AiWorkerService {
  constructor(
    private readonly registry: AiProviderRegistry,
    @Inject(CAPABILITY_STATE_READER)
    private readonly capabilityStateReader: CapabilityStateReader,
  ) {}

  async generate(input: GenerateAiContentInput): Promise<GenerateAiContentResult> {
    this.capabilityStateReader.requireEnabled('ai.execution');
    const provider = this.registry.getGenerateProvider(input.provider);
    if (!provider.generate) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
        `unsupported_ai_generate_provider:${provider.name}`,
      );
    }
    return provider.generate(input);
  }

  async embed(input: EmbedAiContentInput): Promise<EmbedAiContentResult> {
    this.capabilityStateReader.requireEnabled('ai.execution');
    const provider = this.registry.getEmbedProvider();
    if (!provider.embed) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
        `unsupported_ai_embed_provider:${provider.name}`,
      );
    }
    return provider.embed(input);
  }
}
