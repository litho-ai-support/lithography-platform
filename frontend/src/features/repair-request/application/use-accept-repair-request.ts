// src/features/repair-request/application/use-accept-repair-request.ts

import { useCallback, useRef, useState } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import type { AcceptRepairRequestResult } from '../infrastructure/engineer-repair-request.types';
import { acceptRepairRequest } from '../infrastructure/engineer-repair-request-adapter';

import { invalidateEngineerRepairLists } from './engineer-repair-list-refresh';

/**
 * 工程师接单流程（command 状态，收束在 feature application）。
 *
 * - 进行中防重复提交：按钮禁用之外，ref 锁保证连点不会产生并行 Mutation；
 *   accept 返回 null 表示“上一次接单仍在进行中，本次请求被拒绝”，调用方必须处理；
 * - 业务拒绝（已被接单 / 不可访问 / 无权限 / 系统失败）以显式结果返回，
 *   大类 CONFLICT 是稳定运行时分支，提示文案不依赖生产可能隐藏的细节码；
 * - 接单成功或冲突后宣告工程师两个范围的列表失效，挂载中的列表自动刷新，
 *   不保留“仍可接单”的过期假象（Mutation no-cache，Apollo 不会自动同步）；
 * - transport 失败转为共享错误模型的用户文案；
 * - auth 错误不在这里特殊处理，仍由共享 GraphQL + auth-session 全局链路负责。
 */

export function useAcceptRepairRequest() {
  const [accepting, setAccepting] = useState(false);
  const [result, setResult] = useState<AcceptRepairRequestResult | null>(null);
  const acceptingRef = useRef(false);

  const accept = useCallback(
    async (requestId: number): Promise<AcceptRepairRequestResult | null> => {
      if (acceptingRef.current) {
        return null;
      }

      acceptingRef.current = true;
      setAccepting(true);
      setResult(null);

      try {
        const acceptResult = await acceptRepairRequest(requestId);
        setResult(acceptResult);

        // 无论成功还是已被接单（冲突），两个范围的列表数据都可能已变化
        if (acceptResult.ok || acceptResult.reason === 'already-accepted') {
          invalidateEngineerRepairLists();
        }

        return acceptResult;
      } catch (error) {
        const message = isGraphQLIngressError(error) ? error.userMessage : '接单失败，请稍后重试。';
        const transportResult: AcceptRepairRequestResult = {
          ok: false,
          reason: 'accept-failed',
          message,
        };
        setResult(transportResult);
        return transportResult;
      } finally {
        acceptingRef.current = false;
        setAccepting(false);
      }
    },
    [],
  );

  return { accept, accepting, result };
}
