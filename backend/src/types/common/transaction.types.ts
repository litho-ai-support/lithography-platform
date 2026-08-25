declare const persistenceTransactionContextBrand: unique symbol;

export interface PersistenceTransactionContext {
  readonly [persistenceTransactionContextBrand]: 'PersistenceTransactionContext';
}
