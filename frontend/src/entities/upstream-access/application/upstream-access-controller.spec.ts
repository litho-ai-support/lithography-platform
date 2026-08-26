// src/entities/upstream-access/application/upstream-access-controller.spec.ts

import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { UpstreamAccess } from '../domain/upstream-access';

import type {
  RequestUpstreamAccess,
  RequestUpstreamAccessRefresh,
  UpstreamAccessPersistence,
} from './upstream-access.types';
import { createUpstreamAccessController } from './upstream-access-controller';

function createFakePersistence(): UpstreamAccessPersistence & {
  stored: UpstreamAccess | null;
} {
  const fakePersistence = {
    stored: null as UpstreamAccess | null,
    clear: vi.fn(() => {
      fakePersistence.stored = null;
    }),
    read: vi.fn((accountId: number) => {
      if (fakePersistence.stored?.accountId === accountId) {
        return { ...fakePersistence.stored };
      }

      return null;
    }),
    write: vi.fn((access: UpstreamAccess) => {
      fakePersistence.stored = { ...access };
    }),
  };

  return fakePersistence;
}

const BASE_ACCESS: UpstreamAccess = {
  accountId: 900101,
  expiresAt: '2026-01-01T00:00:00.000Z',
  upstreamAccessToken: 'upstream-token',
  upstreamLoginId: 'upstream-user',
};

describe('upstream access controller', () => {
  let persistence: ReturnType<typeof createFakePersistence>;
  let requestAccess: Mock<RequestUpstreamAccess>;
  let requestRefreshAccess: Mock<RequestUpstreamAccessRefresh>;

  beforeEach(() => {
    persistence = createFakePersistence();
    requestAccess = vi.fn<RequestUpstreamAccess>();
    requestRefreshAccess = vi.fn<RequestUpstreamAccessRefresh>();
  });

  it('establishes access through the request port and the persistence port', async () => {
    requestAccess.mockResolvedValue({
      expiresAt: '2026-01-01T00:00:00.000Z',
      upstreamAccessToken: 'upstream-token',
      upstreamLoginId: ' upstream-user ',
    });
    const controller = createUpstreamAccessController({
      persistence,
      requestAccess,
      requestRefreshAccess,
    });

    const nextAccess = await controller.login(900101, { loginId: ' user ', secret: 'secret' });

    expect(requestAccess).toHaveBeenCalledWith({ loginId: 'user', secret: 'secret' });
    expect(nextAccess).toEqual(BASE_ACCESS);
    expect(persistence.write).toHaveBeenCalledWith(BASE_ACCESS);
  });

  it('rejects login before any port is touched when the account is missing', async () => {
    const controller = createUpstreamAccessController({
      persistence,
      requestAccess,
      requestRefreshAccess,
    });

    await expect(controller.login(null, { loginId: 'user', secret: 'secret' })).rejects.toThrow(
      '当前登录账号尚未就绪，请稍后再试。',
    );
    expect(requestAccess).not.toHaveBeenCalled();
    expect(persistence.write).not.toHaveBeenCalled();
  });

  it('overwrites stored access with a rolling refresh result and keeps it on empty results', () => {
    persistence.stored = { ...BASE_ACCESS };
    const controller = createUpstreamAccessController({
      persistence,
      requestAccess,
      requestRefreshAccess,
    });

    const rolledAccess = controller.persistAccessFromResult(BASE_ACCESS, {
      expiresAt: '2026-02-01T00:00:00.000Z',
      upstreamAccessToken: 'rolled-token',
    });

    expect(rolledAccess).toEqual({
      ...BASE_ACCESS,
      expiresAt: '2026-02-01T00:00:00.000Z',
      upstreamAccessToken: 'rolled-token',
    });

    const unchangedAccess = controller.persistAccessFromResult(BASE_ACCESS, {});

    expect(unchangedAccess).toBe(BASE_ACCESS);
    expect(persistence.clear).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent refreshes and clears persistence when refresh fails', async () => {
    persistence.stored = { ...BASE_ACCESS };
    const refreshFailure = new Error('upstream refresh rejected');
    requestRefreshAccess.mockRejectedValue(refreshFailure);
    const controller = createUpstreamAccessController({
      persistence,
      requestAccess,
      requestRefreshAccess,
    });

    const firstRefresh = controller.refresh(BASE_ACCESS).catch((error) => error);
    const secondRefresh = controller.refresh(BASE_ACCESS).catch((error) => error);

    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
      refreshFailure,
      refreshFailure,
    ]);
    expect(requestRefreshAccess).toHaveBeenCalledTimes(1);
    expect(persistence.clear).toHaveBeenCalledTimes(1);
  });

  it('keeps refresh preconditions in the application layer', async () => {
    const controller = createUpstreamAccessController({
      persistence,
      requestAccess,
      requestRefreshAccess: undefined,
    });

    expect(() => controller.refresh(null)).toThrow('尚未建立 upstream access。');
    expect(() => controller.refresh(BASE_ACCESS)).toThrow('当前 upstream access 未配置刷新能力。');
  });
});
