import { RECORD_SOURCES, type RecordSource } from '@app-types/common/record-source.types';

export const AI_PROVIDER_CALL_RECORD_SOURCES = RECORD_SOURCES;

export type AiProviderCallRecordSource = RecordSource;

export const AI_PROVIDER_CALL_RECORD_PROVIDER_STATUSES = ['succeeded', 'failed'] as const;

export type AiProviderCallRecordProviderStatus =
  (typeof AI_PROVIDER_CALL_RECORD_PROVIDER_STATUSES)[number];
