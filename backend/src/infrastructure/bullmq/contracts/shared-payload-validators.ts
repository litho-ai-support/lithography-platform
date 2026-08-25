// src/infrastructure/bullmq/contracts/shared-payload-validators.ts
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

export const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === 'boolean';

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const isOptionalNonEmptyString = (value: unknown): value is string | undefined =>
  value === undefined || isNonEmptyString(value);

export const isOptionalRecordOfString = (
  value: unknown,
): value is Readonly<Record<string, string>> => {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === 'string');
};
