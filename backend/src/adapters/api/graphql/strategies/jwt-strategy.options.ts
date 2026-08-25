export const JWT_STRATEGY_OPTIONS = Symbol('JWT_STRATEGY_OPTIONS');

export interface JwtStrategyOptions {
  readonly secret: string;
  readonly issuer?: string;
  readonly audience?: string[];
}
