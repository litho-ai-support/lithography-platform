import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import type { EntityManager } from 'typeorm';

const typeOrmEntityManagers = new WeakMap<PersistenceTransactionContext, EntityManager>();

export function createTypeOrmPersistenceTransactionContext(
  manager: EntityManager,
): PersistenceTransactionContext {
  const transactionContext = Object.freeze({}) as PersistenceTransactionContext;
  typeOrmEntityManagers.set(transactionContext, manager);
  return transactionContext;
}

export function getTypeOrmEntityManager(
  transactionContext: PersistenceTransactionContext,
): EntityManager {
  const manager = typeOrmEntityManagers.get(transactionContext);
  if (!manager) {
    throw new Error('Invalid TypeORM persistence transaction context');
  }
  return manager;
}
