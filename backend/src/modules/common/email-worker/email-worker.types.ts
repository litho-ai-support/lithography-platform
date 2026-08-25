// src/modules/common/email-worker/email-worker.types.ts
export interface SendEmailInput {
  readonly to: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly templateId?: string;
  readonly meta?: Readonly<Record<string, string>>;
}

export interface SendEmailResult {
  readonly accepted: boolean;
  readonly providerMessageId: string;
}
