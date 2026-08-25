import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  QM_WORKER_ENTRY_POLICY_KEY,
  type QmWorkerEntryPolicy,
} from '@src/adapters/api/graphql/decorators/qm-worker-entry.decorator';
import { QM_WORKER_ENTRY_OPTIONS, type QmWorkerEntryOptions } from './qm-worker-entry.options';

@Injectable()
export class QmWorkerEntryGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(QM_WORKER_ENTRY_OPTIONS)
    private readonly options: QmWorkerEntryOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<QmWorkerEntryPolicy>(
      QM_WORKER_ENTRY_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) {
      return true;
    }

    if (!this.isEnabled(policy)) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, policy.disabledMessage);
    }

    return true;
  }

  private isEnabled(policy: QmWorkerEntryPolicy): boolean {
    return this.options[policy.enabledFlag] === true;
  }
}
