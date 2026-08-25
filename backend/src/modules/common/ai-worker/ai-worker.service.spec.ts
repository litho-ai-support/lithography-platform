// src/modules/common/ai-worker/ai-worker.service.spec.ts
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import type { AiProviderClient } from '@core/ai/ai-provider.interface';
import { AiWorkerService } from './ai-worker.service';
import type { AiProviderRegistry } from './providers/ai-provider-registry';
import { createEnabledCapabilityStateReader } from '../../../../test/support/capability/capability-state-reader.fixture';

describe('AiWorkerService', () => {
  it('embed 应使用固定能力路由调用 registry', async () => {
    const mockEmbed = jest.fn(() =>
      Promise.resolve({
        accepted: true,
        vector: [0.1, 0.2, 0.3],
        provider: 'mock',
        model: 'text-embedding-v1',
        providerJobId: 'mock:e2e',
      }),
    );
    const provider: AiProviderClient = {
      name: 'mock',
      embed: mockEmbed,
    };
    const getEmbedProvider = jest.fn(() => provider);
    const registry = {
      getGenerateProvider: jest.fn(),
      getEmbedProvider,
    } as unknown as AiProviderRegistry;
    const service = new AiWorkerService(registry, createEnabledCapabilityStateReader());

    const result = await service.embed({
      model: 'text-embedding-v1',
      text: 'embed content',
    });

    expect(getEmbedProvider).toHaveBeenCalledWith();
    expect(result.accepted).toBe(true);
    expect(result.providerJobId).toBe('mock:e2e');
  });

  it('embed provider 不支持 embed 能力时抛出明确错误', async () => {
    const provider: AiProviderClient = {
      name: 'openai',
    };
    const registry = {
      getGenerateProvider: jest.fn(),
      getEmbedProvider: jest.fn(() => provider),
    } as unknown as AiProviderRegistry;
    const service = new AiWorkerService(registry, createEnabledCapabilityStateReader());

    await expect(
      service.embed({
        model: 'text-embedding-3-small',
        text: 'embed content',
      }),
    ).rejects.toMatchObject({
      code: THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
      message: 'unsupported_ai_embed_provider:openai',
    });

    try {
      await service.embed({
        model: 'text-embedding-3-small',
        text: 'embed content',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
    }
  });
});
