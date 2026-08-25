// src/core/common/time/time.policy.spec.ts
import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';
import { formatForDateTime, formatForTimestamp3 } from './time-format.policy';
import { validateTimeRangeOrder } from './time-guard.policy';
import { normalizeBusinessDateTime, normalizeSystemEventTime } from './time-normalize.policy';
import { parseTimeInput } from './time-parse.policy';

describe('time policies', () => {
  it('parses datetime string with timezone', () => {
    const parsed = parseTimeInput('2026-03-16T10:00:00.123Z');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    expect(parsed.kind).toBe('datetime');
    expect(parsed.source).toBe('string');
    expect(parsed.hasTimezone).toBe(true);
    expect(parsed.hasMilliseconds).toBe(true);
    expect(parsed.instant?.toISOString()).toBe('2026-03-16T10:00:00.123Z');
  });

  it('parses date-only string', () => {
    const parsed = parseTimeInput('2026-03-16');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    expect(parsed.kind).toBe('date');
    expect(parsed.source).toBe('string');
    expect(parsed.hasTimezone).toBe(false);
    expect(parsed.instant).toBeNull();
    expect(parsed.parts).toEqual({ year: 2026, month: 3, day: 16 });
  });

  it('parses datetime string without timezone as neutral datetime parts', () => {
    const parsed = parseTimeInput('2026-03-16 10:00:00.120');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    expect(parsed.kind).toBe('datetime');
    expect(parsed.hasTimezone).toBe(false);
    expect(parsed.hasMilliseconds).toBe(true);
    expect(parsed.instant).toBeNull();
    expect(parsed.parts).toEqual({
      year: 2026,
      month: 3,
      day: 16,
      hour: 10,
      minute: 0,
      second: 0,
      millisecond: 120,
    });
  });

  it('returns error for unsupported raw input', () => {
    const parsed = parseTimeInput({ foo: 'bar' });
    expect(parsed).toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      expect(parsed.code).toBe(TIME_ERROR.INVALID_TIME_INPUT);
    }
  });

  it('returns error for invalid timezone offset', () => {
    const parsedHourOverflow = parseTimeInput('2026-03-16T10:00:00+24:00');
    expect(parsedHourOverflow).toBeInstanceOf(DomainError);
    if (parsedHourOverflow instanceof DomainError) {
      expect(parsedHourOverflow.code).toBe(TIME_ERROR.INVALID_TIME_INPUT);
    }

    const parsedMinuteOverflow = parseTimeInput('2026-03-16T10:00:00+08:60');
    expect(parsedMinuteOverflow).toBeInstanceOf(DomainError);
    if (parsedMinuteOverflow instanceof DomainError) {
      expect(parsedMinuteOverflow.code).toBe(TIME_ERROR.INVALID_TIME_INPUT);
    }
  });

  it('normalizes explicit system event datetime', () => {
    const parsed = parseTimeInput('2026-03-16T10:00:00Z');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeSystemEventTime(parsed);
    expect(normalized).not.toBeInstanceOf(DomainError);
    if (!(normalized instanceof DomainError)) {
      expect(normalized.normalizedKind).toBe('normalized_time');
      expect(normalized.semantic).toBe('system_event_time');
      expect(new Date(normalized.epochMilliseconds).toISOString()).toBe('2026-03-16T10:00:00.000Z');
    }
  });

  it('rejects timezone-less datetime string for system event normalize', () => {
    const parsed = parseTimeInput('2026-03-16 10:00:00');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeSystemEventTime(parsed);
    expect(normalized).toBeInstanceOf(DomainError);
    if (normalized instanceof DomainError) {
      expect(normalized.code).toBe(TIME_ERROR.INVALID_SYSTEM_EVENT_TIME);
    }
  });

  it('normalizes business datetime from timezone-less string', () => {
    const parsed = parseTimeInput('2026-03-16 10:00:00.004');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeBusinessDateTime(parsed);
    expect(normalized).not.toBeInstanceOf(DomainError);
    if (!(normalized instanceof DomainError)) {
      expect(normalized.normalizedKind).toBe('normalized_time');
      expect(normalized.semantic).toBe('business_datetime');
      expect(new Date(normalized.epochMilliseconds).toISOString()).toBe('2026-03-16T10:00:00.004Z');
      expect(formatForDateTime(normalized)).toBe('2026-03-16 10:00:00.004');
    }
  });

  it('rejects timezone-aware value for business datetime normalize', () => {
    const parsed = parseTimeInput('2026-03-16T10:00:00+08:00');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeBusinessDateTime(parsed);
    expect(normalized).toBeInstanceOf(DomainError);
    if (normalized instanceof DomainError) {
      expect(normalized.code).toBe(TIME_ERROR.INVALID_BUSINESS_DATETIME);
    }
  });

  it('rejects absolute instant input for business datetime normalize', () => {
    const parsed = parseTimeInput(new Date('2026-03-16T10:00:00Z'));
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeBusinessDateTime(parsed);
    expect(normalized).toBeInstanceOf(DomainError);
    if (normalized instanceof DomainError) {
      expect(normalized.code).toBe(TIME_ERROR.INVALID_BUSINESS_DATETIME);
    }
  });

  it('rejects epoch input for business datetime normalize', () => {
    const parsed = parseTimeInput(1710583200000);
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeBusinessDateTime(parsed);
    expect(normalized).toBeInstanceOf(DomainError);
    if (normalized instanceof DomainError) {
      expect(normalized.code).toBe(TIME_ERROR.INVALID_BUSINESS_DATETIME);
    }
  });

  it('rejects date-only value for business datetime normalize', () => {
    const parsed = parseTimeInput('2026-03-16');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeBusinessDateTime(parsed);
    expect(normalized).toBeInstanceOf(DomainError);
    if (normalized instanceof DomainError) {
      expect(normalized.code).toBe(TIME_ERROR.INVALID_BUSINESS_DATETIME);
    }
  });

  it('formats timestamp3 output stably', () => {
    const parsed = parseTimeInput('2026-03-16T10:00:00.123Z');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeSystemEventTime(parsed);
    expect(normalized).not.toBeInstanceOf(DomainError);
    if (normalized instanceof DomainError) {
      return;
    }
    expect(formatForTimestamp3(normalized)).toBe('2026-03-16 10:00:00.123');
  });

  it('formats business datetime stably after structured clone', () => {
    const parsed = parseTimeInput('2026-03-16 10:00:00.004');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeBusinessDateTime(parsed);
    expect(normalized).not.toBeInstanceOf(DomainError);
    if (normalized instanceof DomainError) {
      return;
    }
    const copied = structuredClone(normalized);
    expect(formatForDateTime(copied)).toBe('2026-03-16 10:00:00.004');
  });

  it('formats system event timestamp stably after json roundtrip', () => {
    const parsed = parseTimeInput('2026-03-16T10:00:00.123Z');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeSystemEventTime(parsed);
    expect(normalized).not.toBeInstanceOf(DomainError);
    if (normalized instanceof DomainError) {
      return;
    }
    const copied = JSON.parse(JSON.stringify(normalized));
    expect(formatForTimestamp3(copied)).toBe('2026-03-16 10:00:00.123');
  });

  it('rejects direct date misuse for datetime format', () => {
    expect(() => formatForDateTime(new Date('2026-03-16T10:00:00Z') as never)).toThrow(DomainError);
  });

  it('rejects direct date misuse for timestamp3 format', () => {
    expect(() => formatForTimestamp3(new Date('2026-03-16T10:00:00Z') as never)).toThrow(
      DomainError,
    );
  });

  it('validates time range order only', () => {
    const noError = validateTimeRangeOrder({
      start: new Date('2026-03-16T10:00:00Z'),
      end: new Date('2026-03-16T11:00:00Z'),
    });
    expect(noError).toBeUndefined();

    const err = validateTimeRangeOrder({
      start: new Date('2026-03-16T12:00:00Z'),
      end: new Date('2026-03-16T11:00:00Z'),
    });
    expect(err).toBeInstanceOf(DomainError);
    if (err instanceof DomainError) {
      expect(err.code).toBe(TIME_ERROR.INVALID_TIME_RANGE_ORDER);
    }
  });
});
