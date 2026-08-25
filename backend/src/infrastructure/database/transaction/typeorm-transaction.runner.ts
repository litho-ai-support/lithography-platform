import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import type { TransactionRunner } from '@src/usecases/common/ports/transaction-runner.contract';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createTypeOrmPersistenceTransactionContext } from './typeorm-persistence-transaction-context';

@Injectable()
export class TypeOrmTransactionRunner implements TransactionRunner {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async run<T>(
    callback: (transactionContext: PersistenceTransactionContext) => Promise<T>,
  ): Promise<T> {
    return await this.dataSource.manager.transaction(async (manager) => {
      const transactionContext = createTypeOrmPersistenceTransactionContext(manager);
      return await callback(transactionContext);
    });
  }
}
