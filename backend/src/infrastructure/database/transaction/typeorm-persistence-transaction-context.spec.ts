import type { EntityManager } from 'typeorm';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import {
  createTypeOrmPersistenceTransactionContext,
  getTypeOrmEntityManager,
} from './typeorm-persistence-transaction-context';

describe('TypeORM persistence transaction context', () => {
  it('unwraps the EntityManager used to create the context', () => {
    const manager = { id: 'manager-1' } as unknown as EntityManager;

    const transactionContext = createTypeOrmPersistenceTransactionContext(manager);

    expect(getTypeOrmEntityManager(transactionContext)).toBe(manager);
  });

  it('keeps contexts isolated', () => {
    const firstManager = { id: 'manager-1' } as unknown as EntityManager;
    const secondManager = { id: 'manager-2' } as unknown as EntityManager;

    const firstTx = createTypeOrmPersistenceTransactionContext(firstManager);
    const secondTx = createTypeOrmPersistenceTransactionContext(secondManager);

    expect(getTypeOrmEntityManager(firstTx)).toBe(firstManager);
    expect(getTypeOrmEntityManager(secondTx)).toBe(secondManager);
  });

  it('rejects contexts that were not created by the TypeORM helper', () => {
    const transactionContext = Object.freeze({}) as PersistenceTransactionContext;

    expect(() => getTypeOrmEntityManager(transactionContext)).toThrow(
      'Invalid TypeORM persistence transaction context',
    );
  });
});
