// src/core/common/time/time-parse.policy.ts
import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';
import type { ParsedDateTimeParts, ParsedTimeInput } from './time.types';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:\s?(Z|([+-])(\d{2}):?(\d{2})))?$/i;

export function parseTimeInput(input: unknown): ParsedTimeInput | DomainError {
  if (input instanceof Date) {
    return parseFromDate(input);
  }
  if (typeof input === 'number') {
    return parseFromEpochNumber(input, input);
  }
  if (typeof input === 'string') {
    return parseFromString(input);
  }
  return invalidTimeInput(input);
}

function parseFromDate(input: Date): ParsedTimeInput | DomainError {
  if (!isValidDate(input)) {
    return invalidTimeInput(input);
  }
  return {
    raw: input,
    source: 'date_object',
    kind: 'datetime',
    parts: extractUtcDateTimeParts(input),
    instant: new Date(input.getTime()),
    hasTimezone: false,
    timezoneOffsetMinutes: null,
    hasMilliseconds: input.getUTCMilliseconds() > 0,
  };
}

function parseFromEpochNumber(input: number, raw: unknown): ParsedTimeInput | DomainError {
  if (!Number.isFinite(input)) {
    return invalidTimeInput(raw);
  }
  const value = new Date(input);
  if (!isValidDate(value)) {
    return invalidTimeInput(raw);
  }
  return {
    raw,
    source: 'epoch_ms',
    kind: 'datetime',
    parts: extractUtcDateTimeParts(value),
    instant: value,
    hasTimezone: false,
    timezoneOffsetMinutes: null,
    hasMilliseconds: value.getUTCMilliseconds() > 0,
  };
}

function parseFromString(raw: string): ParsedTimeInput | DomainError {
  const text = raw.trim();
  if (text.length === 0) {
    return invalidTimeInput(raw);
  }

  const dateMatch = text.match(DATE_ONLY_PATTERN);
  if (dateMatch) {
    const [year, month, day] = parseDateParts(dateMatch);
    if (!isValidCalendarDate(year, month, day)) {
      return invalidTimeInput(raw);
    }
    return {
      raw,
      source: 'string',
      kind: 'date',
      parts: { year, month, day },
      instant: null,
      hasTimezone: false,
      timezoneOffsetMinutes: null,
      hasMilliseconds: false,
    };
  }

  const datetimeMatch = text.match(DATETIME_PATTERN);
  if (!datetimeMatch) {
    return invalidTimeInput(raw);
  }

  const parts = parseDateTimeParts(datetimeMatch);
  if (!isValidDateTimeParts(parts)) {
    return invalidTimeInput(raw);
  }

  const timezoneToken = datetimeMatch[8] ?? null;
  const timezoneOffsetMinutes = timezoneToken ? parseTimezoneOffsetMinutes(datetimeMatch) : null;
  if (timezoneToken && timezoneOffsetMinutes === null) {
    return invalidTimeInput(raw);
  }
  const instant =
    timezoneOffsetMinutes === null
      ? null
      : new Date(
          Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second,
            parts.millisecond,
          ) -
            timezoneOffsetMinutes * 60_000,
        );
  if (instant && !isValidDate(instant)) {
    return invalidTimeInput(raw);
  }
  return {
    raw,
    source: 'string',
    kind: 'datetime',
    parts,
    instant,
    hasTimezone: timezoneToken !== null,
    timezoneOffsetMinutes,
    hasMilliseconds: typeof datetimeMatch[7] === 'string',
  };
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function extractUtcDateTimeParts(value: Date): ParsedDateTimeParts {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes(),
    second: value.getUTCSeconds(),
    millisecond: value.getUTCMilliseconds(),
  };
}

function parseDateParts(match: RegExpMatchArray): [number, number, number] {
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseDateTimeParts(match: RegExpMatchArray): ParsedDateTimeParts {
  const [year, month, day] = parseDateParts(match);
  return {
    year,
    month,
    day,
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
    millisecond: match[7] ? normalizeMilliseconds(match[7]) : 0,
  };
}

function normalizeMilliseconds(raw: string): number {
  return Number(raw.padEnd(3, '0'));
}

function parseTimezoneOffsetMinutes(match: RegExpMatchArray): number | null {
  const token = match[8];
  if (!token) {
    return null;
  }
  if (token.toUpperCase() === 'Z') {
    return 0;
  }
  const sign = match[9] === '-' ? -1 : 1;
  const hours = Number(match[10]);
  const minutes = Number(match[11]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  if (hours < 0 || hours > 23) {
    return null;
  }
  if (minutes < 0 || minutes > 59) {
    return null;
  }
  return sign * (hours * 60 + minutes);
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() + 1 === month && utc.getUTCDate() === day
  );
}

function isValidDateTimeParts(parts: ParsedDateTimeParts): boolean {
  if (!isValidCalendarDate(parts.year, parts.month, parts.day)) {
    return false;
  }
  if (parts.hour < 0 || parts.hour > 23) return false;
  if (parts.minute < 0 || parts.minute > 59) return false;
  if (parts.second < 0 || parts.second > 59) return false;
  if (parts.millisecond < 0 || parts.millisecond > 999) return false;
  return true;
}

function invalidTimeInput(raw: unknown): DomainError {
  return new DomainError(TIME_ERROR.INVALID_TIME_INPUT, '时间输入非法', { raw });
}
