// src/features/repair-request/application/use-create-engineer-response.spec.ts

/**
 * 回复 command hook 单测。
 *
 * 走真实 hook 与真实列表失效通道，只 mock 外部 GraphQL adapter；
 * 重点覆盖：ref 锁防连点、列表失效宣告的取舍（成功/结果不确定才宣告，
 * 确定拒绝不宣告）、transport 失败转结果不确定、convergeToSubmitted 收敛。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import type {
  CreateEngineerResponseInput,
  CreateEngineerResponseResult,
  EngineerRepairRequestResponseItem,
} from '../infrastructure/engineer-repair-request.types';
import * as engineerRepairRequestAdapter from '../infrastructure/engineer-repair-request-adapter';

import { onEngineerRepairListsInvalidated } from './engineer-repair-list-refresh';
import { useCreateEngineerResponse } from './use-create-engineer-response';

vi.mock('../infrastructure/engineer-repair-request-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof engineerRepairRequestAdapter>();

  return {
    ...actual,
    createEngineerResponse: vi.fn(),
  };
});

const createMock = vi.mocked(engineerRepairRequestAdapter.createEngineerResponse);

const INPUT: CreateEngineerResponseInput = {
  requestId: 21,
  responseText: '已更换备件，待观察',
  resolutionStatus: 'PENDING',
};

const RESPONSE: EngineerRepairRequestResponseItem = {
  id: 61,
  engineerNickname: '陈工',
  resolutionStatus: 'PENDING',
  responseText: '已更换备件，待观察',
  createdAt: '2026-09-02T10:00:00.000Z',
};

/** 订阅真实失效通道，验证宣告次数与时机 */
function trackListInvalidation() {
  const calls: number[] = [];
  const unsubscribe = onEngineerRepairListsInvalidated(() => {
    calls.push(calls.length + 1);
  });

  return { calls, unsubscribe };
}

beforeEach(() => {
  createMock.mockReset();
});

describe('useCreateEngineerResponse', () => {
  it('成功后返回结果并更新提交状态与反馈结果', async () => {
    createMock.mockResolvedValue({ ok: true, response: RESPONSE });
    const { result, unmount } = renderHook(() => useCreateEngineerResponse());

    let submitResult: CreateEngineerResponseResult | null = null;
    await act(async () => {
      submitResult = await result.current.submit(INPUT);
    });

    expect(submitResult).toEqual({ ok: true, response: RESPONSE });
    expect(result.current.submitting).toBe(false);
    expect(result.current.result).toEqual({ ok: true, response: RESPONSE });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(INPUT);
    unmount();
  });

  it('Mutation 进行中连点只产生一次请求，重入返回 null', async () => {
    let resolveSubmit: (value: CreateEngineerResponseResult) => void = () => {};
    const pending = new Promise<CreateEngineerResponseResult>((resolve) => {
      resolveSubmit = resolve;
    });
    createMock.mockReturnValueOnce(pending);
    const { result, unmount } = renderHook(() => useCreateEngineerResponse());

    let first: Promise<CreateEngineerResponseResult | null> = Promise.resolve(null);
    let second: Promise<CreateEngineerResponseResult | null> = Promise.resolve(null);
    await act(async () => {
      first = result.current.submit(INPUT);
      second = result.current.submit(INPUT);
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(true);

    await act(async () => {
      resolveSubmit({ ok: true, response: RESPONSE });
      await first;
      await second;
    });

    await expect(second).resolves.toBeNull();
    expect(result.current.submitting).toBe(false);
    unmount();
  });

  it('成功后只宣告一次工程师列表失效', async () => {
    createMock.mockResolvedValue({ ok: true, response: RESPONSE });
    const invalidation = trackListInvalidation();
    const { result, unmount } = renderHook(() => useCreateEngineerResponse());

    await act(async () => {
      await result.current.submit(INPUT);
    });

    expect(invalidation.calls).toHaveLength(1);
    invalidation.unsubscribe();
    unmount();
  });

  it('response-failed（结果不确定）宣告一次列表失效', async () => {
    createMock.mockResolvedValue({
      ok: false,
      reason: 'response-failed',
      message: '处理回复失败，请稍后重试',
    });
    const invalidation = trackListInvalidation();
    const { result, unmount } = renderHook(() => useCreateEngineerResponse());

    await act(async () => {
      await result.current.submit(INPUT);
    });

    expect(invalidation.calls).toHaveLength(1);
    invalidation.unsubscribe();
    unmount();
  });

  it.each([
    ['not-accepted', '维修申请尚未接单，请先接单后回复'],
    ['not-accessible', '维修申请不存在或不可访问'],
    ['insufficient-permission', '仅工程师账号可以回复维修申请'],
    ['invalid-input', '回复内容无效，请检查后重试。'],
  ] as const)(
    '确定拒绝 reason=%s 不宣告列表失效（申请数据未变，列表无需刷新）',
    async (reason, message) => {
      createMock.mockResolvedValue({ ok: false, reason, message });
      const invalidation = trackListInvalidation();
      const { result, unmount } = renderHook(() => useCreateEngineerResponse());

      await act(async () => {
        await result.current.submit(INPUT);
      });

      expect(result.current.result).toEqual({ ok: false, reason, message });
      expect(invalidation.calls).toHaveLength(0);
      invalidation.unsubscribe();
      unmount();
    },
  );

  it('transport 失败转换成结果不确定反馈（reason=response-failed）并宣告列表失效', async () => {
    const networkError = new GraphQLIngressError({ type: 'network', message: 'fetch failed' });
    createMock.mockRejectedValue(networkError);
    const invalidation = trackListInvalidation();
    const { result, unmount } = renderHook(() => useCreateEngineerResponse());

    let submitResult: CreateEngineerResponseResult | null = null;
    await act(async () => {
      submitResult = await result.current.submit(INPUT);
    });

    expect(submitResult).toEqual({
      ok: false,
      reason: 'response-failed',
      message: networkError.userMessage,
    });
    expect(result.current.result).toEqual(submitResult);
    expect(invalidation.calls).toHaveLength(1);
    invalidation.unsubscribe();
    unmount();
  });

  it('非 GraphQLIngressError 的未知异常同样转结果不确定反馈', async () => {
    createMock.mockRejectedValue(new Error('unexpected'));
    const { result, unmount } = renderHook(() => useCreateEngineerResponse());

    let submitResult: CreateEngineerResponseResult | null = null;
    await act(async () => {
      submitResult = await result.current.submit(INPUT);
    });

    expect(submitResult).toEqual({
      ok: false,
      reason: 'response-failed',
      message: '处理回复失败，请稍后重试',
    });
    unmount();
  });

  it('convergeToSubmitted 把最近一次不确定结果收敛为成功', async () => {
    createMock.mockResolvedValue({
      ok: false,
      reason: 'response-failed',
      message: '处理回复失败，请稍后重试',
    });
    const { result, unmount } = renderHook(() => useCreateEngineerResponse());

    await act(async () => {
      await result.current.submit(INPUT);
    });
    expect(result.current.result?.ok).toBe(false);

    await act(async () => {
      result.current.convergeToSubmitted(RESPONSE);
    });

    expect(result.current.result).toEqual({ ok: true, response: RESPONSE });
    // 收敛不重发 Mutation，也不产生新的提交状态
    expect(createMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.submitting).toBe(false));
    unmount();
  });
});
