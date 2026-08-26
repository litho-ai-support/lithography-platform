import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';

export const TRANSACTION_RUNNER = Symbol('TRANSACTION_RUNNER');

export interface TransactionRunner {
  run<T>(callback: (transactionContext: PersistenceTransactionContext) => Promise<T>): Promise<T>;
}
