// src/core/common/time/time-guard.policy.ts
import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';
import type { TimeRangeOrderInput } from './time.types';

export function validateTimeRangeOrder(input: TimeRangeOrderInput): void | DomainError {
  if (!input.start || !input.end) {
    return;
  }
  if (!isValidDate(input.start) || !isValidDate(input.end)) {
    return new DomainError(TIME_ERROR.INVALID_TIME_INPUT, '时间输入非法');
  }
  if (input.start.getTime() > input.end.getTime()) {
    return new DomainError(TIME_ERROR.INVALID_TIME_RANGE_ORDER, '时间区间顺序非法');
  }
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}
