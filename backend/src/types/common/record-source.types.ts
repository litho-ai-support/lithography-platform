// src/types/common/record-source.types.ts

export const RECORD_SOURCES = [
  'user_action',
  'admin_action',
  'system',
  'cron',
  'domain_event',
  'webhook',
] as const;

export type RecordSource = (typeof RECORD_SOURCES)[number];
