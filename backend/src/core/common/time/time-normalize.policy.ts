// src/core/common/time/time-normalize.policy.ts
import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';
import type { BusinessDateTime, ParsedTimeInput, SystemEventTime } from './time.types';

export function normalizeSystemEventTime(input: ParsedTimeInput): SystemEventTime | DomainError {
  if (input.kind !== 'datetime') {
    return new DomainError(TIME_ERROR.INVALID_SYSTEM_EVENT_TIME, '系统事件时间必须为 datetime');
  }
  if (!input.instant) {
    return new DomainError(
      TIME_ERROR.INVALID_SYSTEM_EVENT_TIME,
      '系统事件时间必须提供可确定瞬时点的 datetime 输入',
    );
  }
  return {
    normalizedKind: 'normalized_time',
    semantic: 'system_event_time',
    epochMilliseconds: input.instant.getTime(),
  };
}

export function normalizeBusinessDateTime(input: ParsedTimeInput): BusinessDateTime | DomainError {
  if (input.kind !== 'datetime') {
    return new DomainError(TIME_ERROR.INVALID_BUSINESS_DATETIME, '业务日期时间必须为 datetime');
  }
  if (input.source !== 'string' || input.hasTimezone) {
    return new DomainError(
      TIME_ERROR.INVALID_BUSINESS_DATETIME,
      '业务日期时间必须为不带时区的 datetime 字符串',
    );
  }
  const parts = input.parts;
  return {
    normalizedKind: 'normalized_time',
    semantic: 'business_datetime',
    epochMilliseconds: Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  };
}
