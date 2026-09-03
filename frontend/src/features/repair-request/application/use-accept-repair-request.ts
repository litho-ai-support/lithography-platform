// src/features/repair-request/application/use-accept-repair-request.ts

import { useCallback, useRef, useState } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import type {
  AcceptRepairRequestResult,
  EngineerRepairRequestDetail,
} from '../infrastructure/engineer-repair-request.types';
import { acceptRepairRequest } from '../infrastructure/engineer-repair-request-adapter';

import { invalidateEngineerRepairLists } from './engineer-repair-list-refresh';

/**
 * 工程师接单流程（command 状态，收束在 feature application）。
 *
 * - 进行中防重复提交：按钮禁用之外，ref 锁保证连点不会产生并行 Mutation；
 *   accept 返回 null 表示“上一次接单仍在进行中，本次请求被拒绝”，调用方必须处理；
 * - 业务拒绝（已被接单 / 不可访问 / 无权限 / 系统失败）以显式结果返回，
 *   大类 CONFLICT 是稳定运行时分支，提示文案不依赖生产可能隐藏的细节码；
 * - 接单成功、冲突（申请已被接单）与 accept-failed（接单结果不确定：
 *   事务可能已提交但事务外详情读取或传输失败）后宣告工程师两个范围的列表失效，
 *   挂载中的列表自动刷新，不保留“仍可接单”的过期假象
 *   （Mutation no-cache，Apollo 不会自动同步）；
 *   无权限 / 不可访问属于确定的拒绝结果，申请数据未变，不宣告失效；
 * - transport 失败转为共享错误模型的用户文案；
 * - accept-failed 后由编排层重查确认（见 use-engineer-repair-request-detail-flow）：
 *   确认已接单时用 convergeToAccepted 将展示反馈收敛为成功，
 *   不保留与「已接单」状态矛盾的失败提示；
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

        // 成功 / 已被接单（冲突）/ 接单结果不确定（accept-failed）时，
        // 两个范围的列表数据都可能已变化；无权限 / 不可访问是确定的拒绝，申请数据未变
        if (
          acceptResult.ok ||
          acceptResult.reason === 'already-accepted' ||
          acceptResult.reason === 'accept-failed'
        ) {
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
        // transport 失败同样视为接单结果不确定（请求可能已在服务端生效），
        // 与显式 accept-failed 结果一致宣告列表失效
        invalidateEngineerRepairLists();
        return transportResult;
      } finally {
        acceptingRef.current = false;
        setAccepting(false);
      }
    },
    [],
  );

  /**
   * accept-failed 重查确认已接单后的反馈收敛（application 编排层专用）：
   * 重查结果与查询状态机同一数据源，确认已接单后把最近一次结果改写为成功。
   */
  const convergeToAccepted = useCallback((detail: EngineerRepairRequestDetail) => {
    setResult({ ok: true, detail });
  }, []);

  return { accept, accepting, result, convergeToAccepted };
}
