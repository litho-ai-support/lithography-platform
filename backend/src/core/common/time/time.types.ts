// src/core/common/time/time.types.ts
export type ParsedTimeKind = 'date' | 'datetime';
export type ParsedTimeSource = 'string' | 'date_object' | 'epoch_ms';

export interface ParsedDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface ParsedDateTimeParts extends ParsedDateParts {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

interface ParsedTimeInputBase {
  readonly raw: unknown;
  readonly source: ParsedTimeSource;
  readonly hasTimezone: boolean;
  readonly timezoneOffsetMinutes: number | null;
  readonly hasMilliseconds: boolean;
}

export interface ParsedDateInput extends ParsedTimeInputBase {
  readonly kind: 'date';
  readonly parts: ParsedDateParts;
  readonly instant: null;
  readonly hasTimezone: false;
  readonly timezoneOffsetMinutes: null;
  readonly hasMilliseconds: false;
}

export interface ParsedDateTimeInput extends ParsedTimeInputBase {
  readonly kind: 'datetime';
  readonly parts: ParsedDateTimeParts;
  readonly instant: Date | null;
}

export type ParsedTimeInput = ParsedDateInput | ParsedDateTimeInput;

export type TimeSemantic = 'system_event_time' | 'business_datetime';

interface NormalizedTimeBase {
  readonly normalizedKind: 'normalized_time';
  readonly semantic: TimeSemantic;
  readonly epochMilliseconds: number;
}

export type SystemEventTime = NormalizedTimeBase & { readonly semantic: 'system_event_time' };
export type BusinessDateTime = NormalizedTimeBase & { readonly semantic: 'business_datetime' };

export interface TimeRangeOrderInput {
  readonly start?: Date;
  readonly end?: Date;
}
