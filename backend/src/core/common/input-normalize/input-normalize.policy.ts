import { DomainError, INPUT_NORMALIZE_ERROR } from '@core/common/errors/domain-error';
import { EmptyPolicy, LimitRange, ListPolicy } from './input-normalize.types';

export function normalizeRequiredText(
  input: unknown,
  options?: { readonly fieldName?: string },
): string {
  const fieldName = options?.fieldName ?? '字段';
  if (typeof input !== 'string') {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_TEXT, `${fieldName} 必须是字符串`);
  }
  const normalized = input.trim();
  if (normalized.length === 0) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY, `${fieldName} 不能为空`);
  }
  return normalized;
}

export function normalizeOptionalText(
  input: unknown,
  policy: EmptyPolicy,
  options?: { readonly fieldName?: string },
): string | null | undefined {
  const fieldName = options?.fieldName ?? '字段';
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  if (typeof input !== 'string') {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_TEXT, `${fieldName} 必须是字符串`);
  }
  const normalized = input.trim();
  if (normalized.length > 0) {
    return normalized;
  }
  return resolveEmptyPolicy(policy, fieldName);
}

export function normalizeTextList(
  input: unknown,
  policy: ListPolicy,
  options?: { readonly fieldName?: string },
): ReadonlyArray<string> | null | undefined {
  const fieldName = options?.fieldName ?? '字段';
  if (input === undefined || input === null) {
    return resolveEmptyListResult(policy.empty_result, fieldName);
  }
  if (!Array.isArray(input)) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_TEXT_LIST, `${fieldName} 必须是字符串列表`);
  }

  const items: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') {
      if (policy.reject_invalid_item) {
        throw new DomainError(
          INPUT_NORMALIZE_ERROR.INVALID_TEXT_LIST_ITEM,
          `${fieldName} 包含非法元素类型`,
        );
      }
      continue;
    }
    const normalized = item.trim();
    if (normalized.length === 0 && policy.filter_empty) {
      continue;
    }
    items.push(normalized);
  }

  const output = policy.dedupe ? dedupeKeepOrder(items) : items;
  if (output.length === 0) {
    return resolveEmptyListResult(policy.empty_result, fieldName);
  }
  return output;
}

export function normalizeLimit(
  input: unknown,
  range: LimitRange,
  options?: { readonly fieldName?: string },
): number {
  const fieldName = options?.fieldName ?? 'limit';
  if (
    !Number.isFinite(range.fallback) ||
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    !Number.isInteger(range.fallback) ||
    !Number.isInteger(range.min) ||
    !Number.isInteger(range.max) ||
    range.min > range.max
  ) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_LIMIT_RANGE, `${fieldName} 范围策略非法`);
  }

  if (input === undefined || input === null) {
    return clamp(range.fallback, range.min, range.max);
  }
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_LIMIT_VALUE, `${fieldName} 必须是数字`);
  }

  const normalized = Math.trunc(input);
  return clamp(normalized, range.min, range.max);
}

export function normalizeEnumValue<T extends string>(
  input: unknown,
  allowed: readonly T[],
  options?: { readonly fieldName?: string; readonly caseInsensitive?: boolean },
): T {
  const fieldName = options?.fieldName ?? '字段';
  const caseInsensitive = options?.caseInsensitive ?? false;
  if (typeof input !== 'string') {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_ENUM_VALUE, `${fieldName} 取值非法`);
  }
  const normalized = input.trim();
  if (normalized.length === 0) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_ENUM_VALUE, `${fieldName} 取值非法`);
  }
  if (!caseInsensitive) {
    if (allowed.includes(normalized as T)) {
      return normalized as T;
    }
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_ENUM_VALUE, `${fieldName} 取值非法`);
  }
  const target = normalized.toLowerCase();
  for (const candidate of allowed) {
    if (candidate.toLowerCase() === target) {
      return candidate;
    }
  }
  throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_ENUM_VALUE, `${fieldName} 取值非法`);
}

function resolveEmptyPolicy(policy: EmptyPolicy, fieldName: string): string | null | undefined {
  if (policy === 'to_undefined') {
    return undefined;
  }
  if (policy === 'to_null') {
    return null;
  }
  if (policy === 'keep_empty_string') {
    return '';
  }
  throw new DomainError(
    INPUT_NORMALIZE_ERROR.OPTIONAL_TEXT_EMPTY_REJECTED,
    `${fieldName} 不能为空白`,
  );
}

function resolveEmptyListResult(
  policy: ListPolicy['empty_result'],
  fieldName: string,
): ReadonlyArray<string> | null | undefined {
  if (policy === 'keep') {
    return [];
  }
  if (policy === 'to_undefined') {
    return undefined;
  }
  if (policy === 'to_null') {
    return null;
  }
  throw new DomainError(INPUT_NORMALIZE_ERROR.EMPTY_LIST_REJECTED, `${fieldName} 不能为空白`);
}

function dedupeKeepOrder(input: ReadonlyArray<string>): ReadonlyArray<string> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
