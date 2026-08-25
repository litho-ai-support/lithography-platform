export const AI_PROVIDER_REGISTRY_OPTIONS = Symbol('AI_PROVIDER_REGISTRY_OPTIONS');

export interface AiProviderRegistryOptions {
  readonly providerMode: string;
}
