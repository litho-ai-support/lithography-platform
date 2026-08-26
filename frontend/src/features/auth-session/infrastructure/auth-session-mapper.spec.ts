// src/features/auth-session/infrastructure/auth-session-mapper.spec.ts

import { describe, expect, it } from 'vitest';

import { decodeAuthSessionPayload } from './auth-session-mapper';

describe('decodeAuthSessionPayload', () => {
  it('decodes a minimal valid payload into a normalized session snapshot', () => {
    expect(
      decodeAuthSessionPayload({
        accessToken: ' access-token ',
        accountId: 900101,
        role: 'ENGINEER',
        userInfo: null,
      }),
    ).toEqual({
      accessToken: 'access-token',
      accountId: 900101,
      role: 'ENGINEER',
      userInfo: null,
    });
  });

  it('decodes a payload carrying a valid user summary', () => {
    expect(
      decodeAuthSessionPayload({
        accessToken: 'access-token',
        accountId: 900101,
        role: 'ENGINEER',
        userInfo: {
          accessGroup: ['ENGINEER'],
          nickname: ' 陈工 ',
        },
      }),
    ).toEqual({
      accessToken: 'access-token',
      accountId: 900101,
      role: 'ENGINEER',
      userInfo: {
        accessGroup: ['ENGINEER'],
        nickname: '陈工',
      },
    });
  });

  it('rejects non-record and missing-field payloads', () => {
    expect(decodeAuthSessionPayload(null)).toBeNull();
    expect(decodeAuthSessionPayload('session')).toBeNull();
    expect(
      decodeAuthSessionPayload({
        accountId: 900101,
        role: 'ENGINEER',
      }),
    ).toBeNull();
    expect(
      decodeAuthSessionPayload({
        accessToken: 'access-token',
        accountId: '900101',
        role: 'ENGINEER',
      }),
    ).toBeNull();
  });

  it('rejects unknown roles and invalid account ids', () => {
    expect(
      decodeAuthSessionPayload({
        accessToken: 'access-token',
        accountId: 900101,
        role: 'OPERATOR',
      }),
    ).toBeNull();
    expect(
      decodeAuthSessionPayload({
        accessToken: 'access-token',
        accountId: -1,
        role: 'ENGINEER',
      }),
    ).toBeNull();
    expect(
      decodeAuthSessionPayload({
        accessToken: 'access-token',
        accountId: 900101.5,
        role: 'ENGINEER',
      }),
    ).toBeNull();
  });

  it('rejects whitespace-only tokens via the session policy invariants', () => {
    expect(
      decodeAuthSessionPayload({
        accessToken: '   ',
        accountId: 900101,
        role: 'ENGINEER',
      }),
    ).toBeNull();
  });

  it('rejects malformed user summaries instead of passing them through', () => {
    expect(
      decodeAuthSessionPayload({
        accessToken: 'access-token',
        accountId: 900101,
        role: 'ENGINEER',
        userInfo: {
          accessGroup: [],
          nickname: '陈工',
        },
      }),
    ).toBeNull();
    expect(
      decodeAuthSessionPayload({
        accessToken: 'access-token',
        accountId: 900101,
        role: 'ENGINEER',
        userInfo: {
          accessGroup: ['OPERATOR'],
          nickname: '陈工',
        },
      }),
    ).toBeNull();
    expect(
      decodeAuthSessionPayload({
        accessToken: 'access-token',
        accountId: 900101,
        role: 'ENGINEER',
        userInfo: {
          nickname: '陈工',
        },
      }),
    ).toBeNull();
  });

  it('rejects summaries that contradict the active role', () => {
    expect(
      decodeAuthSessionPayload({
        accessToken: 'access-token',
        accountId: 900101,
        role: 'ENGINEER',
        userInfo: {
          accessGroup: ['CUSTOMER'],
          nickname: '错误身份',
        },
      }),
    ).toBeNull();
  });
});
