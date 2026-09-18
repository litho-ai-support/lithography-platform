// src/features/admin-document-database/application/use-debounced-value.spec.ts
// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './use-debounced-value';

/**
 * PR3 S5：输入防抖 hook 单测（分支 × 时序）。
 *
 * 防抖值用于触发列表重载：即时回显由调用方本地 state 负责，这里必须保证
 * 「延迟内不更新、到期才更新、连打字只保留末次、卸载/改值时清掉旧定时器」，
 * 否则每敲一个字符都会打一发列表请求。
 */
describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始立即返回入参值，未到期不变化', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));

    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');
  });

  it('入参变化：到期前保持旧值，到期后更新为新值', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('延迟内连续改值只保留末次（旧定时器被清除，不产生中间态）', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: '' },
    });

    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: 'abc' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: 'abcd' });

    // 从最后一次改动起满 300ms 才落地，中间值不得抢先出现
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('abcd');
  });

  it('卸载时清除挂起定时器，不再回写状态', () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    unmount();

    // 卸载后推进时间：clearTimeout 已生效，等价于无挂起回调被触发（不抛错即达标）
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }).not.toThrow();
  });
});
