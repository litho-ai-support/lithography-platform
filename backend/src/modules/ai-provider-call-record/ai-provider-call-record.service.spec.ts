// src/modules/ai-provider-call-record/ai-provider-call-record.service.spec.ts
import type { Repository } from 'typeorm';
import { AiProviderCallRecordEntity } from './ai-provider-call-record.entity';
import { AiProviderCallRecordService } from './ai-provider-call-record.service';

describe('AiProviderCallRecordService', () => {
  it('normalizes negative provider latency to null before saving', async () => {
    const repository = createRepositoryMock();
    const service = new AiProviderCallRecordService(repository);

    await service.createRecord({
      data: {
        traceId: 'trace-negative-latency',
        source: 'system',
        provider: 'mock',
        model: 'test-model',
        taskType: 'embed',
        providerStatus: 'failed',
        normalizedErrorCode: 'ai_provider_auth_failed',
        errorMessage: 'ai_provider_auth_failed',
        providerStartedAt: new Date('2026-01-01T00:00:10.000Z'),
        providerFinishedAt: new Date('2026-01-01T00:00:09.000Z'),
      },
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        providerLatencyMs: null,
      }),
    );
  });
});

function createRepositoryMock(): Repository<AiProviderCallRecordEntity> {
  return {
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(undefined),
    })),
    create: jest.fn((input: Partial<AiProviderCallRecordEntity>) => ({
      ...input,
      id: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    save: jest.fn((entity: AiProviderCallRecordEntity) => Promise.resolve(entity)),
  } as unknown as Repository<AiProviderCallRecordEntity>;
}
