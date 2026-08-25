// src/core/common/time/time-format.policy.ts
import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';
import type { BusinessDateTime, SystemEventTime } from './time.types';

export function formatForTimestamp3(date: SystemEventTime): string {
  const milliseconds = ensureNormalizedMilliseconds(date, 'system_event_time');
  if (milliseconds instanceof DomainError) {
    throw milliseconds;
  }
  return formatDateTimeUtc(new Date(milliseconds));
}

export function formatForDateTime(date: BusinessDateTime): string {
  const milliseconds = ensureNormalizedMilliseconds(date, 'business_datetime');
  if (milliseconds instanceof DomainError) {
    throw milliseconds;
  }
  return formatDateTimeUtc(new Date(milliseconds));
}

function ensureNormalizedMilliseconds(
  value: unknown,
  semantic: 'system_event_time' | 'business_datetime',
): number | DomainError {
  if (!value || typeof value !== 'object') {
    return new DomainError(TIME_ERROR.INVALID_TIME_INPUT, '时间输入非法');
  }
  const input = value as {
    readonly normalizedKind?: unknown;
    readonly semantic?: unknown;
    readonly epochMilliseconds?: unknown;
  };
  if (input.normalizedKind !== 'normalized_time' || input.semantic !== semantic) {
    return new DomainError(
      semantic === 'system_event_time'
        ? TIME_ERROR.INVALID_SYSTEM_EVENT_TIME
        : TIME_ERROR.INVALID_BUSINESS_DATETIME,
      semantic === 'system_event_time'
        ? '系统事件时间格式化输入必须来自系统事件时间收敛结果'
        : '业务日期时间格式化输入必须来自业务日期时间收敛结果',
    );
  }
  const milliseconds = input.epochMilliseconds;
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds)) {
    return new DomainError(TIME_ERROR.INVALID_TIME_INPUT, '时间输入非法');
  }
  const normalized = new Date(milliseconds);
  if (Number.isNaN(normalized.getTime())) {
    return new DomainError(TIME_ERROR.INVALID_TIME_INPUT, '时间输入非法');
  }
  return milliseconds;
}

function formatDateTimeUtc(value: Date): string {
  const year = value.getUTCFullYear();
  const month = pad2(value.getUTCMonth() + 1);
  const day = pad2(value.getUTCDate());
  const hours = pad2(value.getUTCHours());
  const minutes = pad2(value.getUTCMinutes());
  const seconds = pad2(value.getUTCSeconds());
  const milliseconds = pad3(value.getUTCMilliseconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function pad3(value: number): string {
  return value.toString().padStart(3, '0');
}
