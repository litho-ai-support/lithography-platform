// src/entities/upstream-access/infrastructure/upstream-access-storage.spec.ts

import { describe, expect, it } from 'vitest';

import { createUpstreamAccessPersistence } from './upstream-access-storage';

function createMemoryStorageBackend() {
  const entries = new Map<string, string>();

  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

const STORAGE_KEY = 'aigc-friendly-frontend.upstream.access.v1';

describe('upstream access persistence adapter', () => {
  it('round-trips access through the injected storage backend', () => {
    const backend = createMemoryStorageBackend();
    const persistence = createUpstreamAccessPersistence(() => backend);

    persistence.write({
      accountId: 900101,
      expiresAt: null,
      upstreamAccessToken: ' upstream-token ',
      upstreamLoginId: ' upstream-user ',
    });

    expect(persistence.read(900101)).toEqual({
      accountId: 900101,
      expiresAt: null,
      upstreamAccessToken: 'upstream-token',
      upstreamLoginId: 'upstream-user',
    });
  });

  it('invalidates stored access owned by another account', () => {
    const backend = createMemoryStorageBackend();
    const persistence = createUpstreamAccessPersistence(() => backend);

    persistence.write({
      accountId: 900101,
      expiresAt: null,
      upstreamAccessToken: 'upstream-token',
      upstreamLoginId: null,
    });

    expect(persistence.read(900201)).toBeNull();
    expect(backend.entries.has(STORAGE_KEY)).toBe(false);
  });

  it('discards corrupted or foreign payloads instead of surfacing them', () => {
    const backend = createMemoryStorageBackend();
    const persistence = createUpstreamAccessPersistence(() => backend);

    backend.entries.set(STORAGE_KEY, '{not-json');
    expect(persistence.read(900101)).toBeNull();
    expect(backend.entries.has(STORAGE_KEY)).toBe(false);

    backend.entries.set(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(persistence.read(900101)).toBeNull();
    expect(backend.entries.has(STORAGE_KEY)).toBe(false);
  });

  it('treats an unavailable storage backend as an empty persistence', () => {
    const persistence = createUpstreamAccessPersistence(() => null);

    persistence.write({
      accountId: 900101,
      expiresAt: null,
      upstreamAccessToken: 'upstream-token',
      upstreamLoginId: null,
    });

    expect(persistence.read(900101)).toBeNull();
    expect(() => persistence.clear()).not.toThrow();
  });
});
