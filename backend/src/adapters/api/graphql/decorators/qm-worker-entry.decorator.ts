import { IdentityTypeEnum } from '@app-types/models/account.types';
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@src/adapters/api/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/api/graphql/guards/roles.guard';
import { QmWorkerEntryGuard } from '../guards/qm-worker-entry.guard';
import type { QmWorkerEntryFlag } from '../guards/qm-worker-entry.options';
import { Roles } from './roles.decorator';

export const QM_WORKER_ENTRY_POLICY_KEY = 'qmWorkerEntryPolicy';

export type QmWorkerEntryPreset = 'AI_STRICT' | 'EMAIL_RELAXED';

export interface QmWorkerEntryPolicy {
  readonly enabledFlag: QmWorkerEntryFlag;
  readonly disabledMessage: string;
}

const QM_WORKER_ENTRY_POLICIES: Record<QmWorkerEntryPreset, QmWorkerEntryPolicy> = {
  AI_STRICT: {
    enabledFlag: 'aiEnabled',
    disabledMessage: 'AI 队列入口未启用，请设置 AI_QUEUE_DEBUG_ENABLED=true',
  },
  EMAIL_RELAXED: {
    enabledFlag: 'emailEnabled',
    disabledMessage: '邮件队列入口未启用，请设置 EMAIL_QUEUE_DEBUG_ENABLED=true',
  },
};

export function qmWorkerEntry(preset: QmWorkerEntryPreset): MethodDecorator & ClassDecorator {
  const policy = QM_WORKER_ENTRY_POLICIES[preset];

  if (preset === 'AI_STRICT') {
    return applyDecorators(
      SetMetadata(QM_WORKER_ENTRY_POLICY_KEY, policy),
      UseGuards(JwtAuthGuard, RolesGuard, QmWorkerEntryGuard),
      Roles(IdentityTypeEnum.STAFF, IdentityTypeEnum.ADMIN),
    );
  }

  return applyDecorators(
    SetMetadata(QM_WORKER_ENTRY_POLICY_KEY, policy),
    UseGuards(QmWorkerEntryGuard),
  );
}
