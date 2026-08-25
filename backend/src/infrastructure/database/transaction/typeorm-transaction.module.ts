import { TRANSACTION_RUNNER } from '@src/usecases/common/ports/transaction-runner.contract';
import { Global, Module } from '@nestjs/common';
import { TypeOrmTransactionRunner } from './typeorm-transaction.runner';

@Global()
@Module({
  providers: [
    TypeOrmTransactionRunner,
    { provide: TRANSACTION_RUNNER, useExisting: TypeOrmTransactionRunner },
  ],
  exports: [TRANSACTION_RUNNER],
})
export class TypeOrmTransactionModule {}
