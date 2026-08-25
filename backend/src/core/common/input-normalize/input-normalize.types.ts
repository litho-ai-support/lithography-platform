export type EmptyPolicy = 'to_undefined' | 'to_null' | 'reject' | 'keep_empty_string';

export interface ListPolicy {
  readonly filter_empty: boolean;
  readonly reject_invalid_item: boolean;
  readonly dedupe: boolean;
  readonly empty_result: 'keep' | 'to_undefined' | 'to_null' | 'reject';
}

export interface LimitRange {
  readonly fallback: number;
  readonly min: number;
  readonly max: number;
}
