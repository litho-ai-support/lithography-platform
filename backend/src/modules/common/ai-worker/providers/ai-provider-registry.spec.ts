// src/modules/common/ai-worker/providers/ai-provider-registry.spec.ts
import type { AiProviderClient } from '@core/ai/ai-provider.interface';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import type { LocalMockAiProvider } from '@src/infrastructure/ai/providers/local/local-mock-ai.provider';
import type { OpenAiGenerateProvider } from '@src/infrastructure/ai/providers/openai/openai-generate.provider';
import type { QwenGenerateProvider } from '@src/infrastructure/ai/providers/qwen/qwen-generate.provider';
import { AiProviderRegistry } from './ai-provider-registry';

describe('AiProviderRegistry', () => {
  const buildRegistry = (input: { mode: string }) => {
    const providers: Readonly<Record<string, AiProviderClient>> = {
      mock: { name: 'mock' },
      openai: { name: 'openai' },
      qwen: { name: 'qwen' },
    };
    return new AiProviderRegistry(
      { providerMode: input.mode },
      providers.mock as unknown as LocalMockAiProvider,
      providers.openai as unknown as OpenAiGenerateProvider,
      providers.qwen as unknown as QwenGenerateProvider,
    );
  };

  it('AI_PROVIDER_MODE 为 mock 时始终返回 mock provider', () => {
    const registry = buildRegistry({ mode: 'mock' });
    const provider = registry.getGenerateProvider('openai');
    expect(provider.name).toBe('mock');
  });

  it('AI_PROVIDER_MODE 为 remote 时按入参 provider 路由', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getGenerateProvider('openai');
    expect(provider.name).toBe('openai');
  });

  it('AI_PROVIDER_MODE 为 remote 且未传 provider 时走 mock', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getGenerateProvider();
    expect(provider.name).toBe('mock');
  });

  it('AI_PROVIDER_MODE 为 remote 时支持 qwen provider', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getGenerateProvider('qwen');
    expect(provider.name).toBe('qwen');
  });

  it('AI_PROVIDER_MODE 为 remote 时支持 openai provider', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getGenerateProvider('openai');
    expect(provider.name).toBe('openai');
  });

  it('embed 在 remote 模式且未传 provider 时走 mock', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getEmbedProvider();
    expect(provider.name).toBe('mock');
  });

  it('embed 在 remote 模式下不参与 provider 选择', () => {
    const registry = buildRegistry({ mode: 'remote' });
    expect(registry.getEmbedProvider().name).toBe('mock');
  });

  it('不支持的 provider 抛出明确错误', () => {
    const registry = buildRegistry({ mode: 'remote' });
    expect(() => registry.getGenerateProvider('unknown')).toThrow(DomainError);
    expect(() => registry.getGenerateProvider('unknown')).toThrow(
      `unsupported_ai_provider:unknown`,
    );
    try {
      registry.getGenerateProvider('unknown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED);
    }
  });
});
