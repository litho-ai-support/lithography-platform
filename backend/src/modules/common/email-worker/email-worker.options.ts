export const EMAIL_DELIVERY_OPTIONS = Symbol('EMAIL_DELIVERY_OPTIONS');

export interface EmailDeliveryOptions {
  readonly runAsUser?: string;
  readonly sendmailPath: string;
}
