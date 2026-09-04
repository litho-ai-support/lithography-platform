// src/features/repair-request/application/use-create-engineer-response.ts

import { useCallback, useRef, useState } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import type {
  CreateEngineerResponseInput,
  CreateEngineerResponseResult,
  EngineerRepairRequestResponseItem,
} from '../infrastructure/engineer-repair-request.types';
import { createEngineerResponse } from '../infrastructure/engineer-repair-request-adapter';

import { invalidateEngineerRepairLists } from './engineer-repair-list-refresh';

/**
 * 工程师追加处理回复流程（command 状态，收束在 feature application）。
 *
 * - 进行中防重复提交：按钮禁用之外，ref 锁保证连点不会产生并行 Mutation；
 *   submit 返回 null 表示“上一次回复仍在进行中，本次请求被拒绝”，调用方必须处理；
 * - 只调用 feature infrastructure adapter，不触碰 shared/graphql 之外的任何入口；
 * - 成功后宣告工程师两个范围的列表失效，使 MINE 列表中的
 *   latestResolutionStatus 可刷新（Mutation no-cache，Apollo 不会自动同步）；
 *   not-accepted / not-accessible / insufficient-permission / invalid-input 是
 *   确定的拒绝结果，申请数据未变，不宣告失效；
 * - response-failed（后端落库失败）与 transport 失败统一视为“结果可能不确定”
 *   （Mutation 可能已在服务端生效），同样宣告列表失效；
 *   是否已写入只能由编排层重查详情确认（见 use-engineer-repair-request-detail-flow），
 *   这里绝不自动重试 Mutation（Plan §7.1）；
 * - auth 错误不在这里特殊处理，仍由共享 GraphQL + auth-session 全局链路负责。
 */

export function useCreateEngineerResponse() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateEngineerResponseResult | null>(null);
  const submittingRef = useRef(false);

  const submit = useCallback(
    async (input: CreateEngineerResponseInput): Promise<CreateEngineerResponseResult | null> => {
      if (submittingRef.current) {
        return null;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setResult(null);

      try {
        const submitResult = await createEngineerResponse(input);
        setResult(submitResult);

        // 成功或结果不确定（response-failed）时列表可能已变化；确定拒绝不宣告
        if (submitResult.ok || submitResult.reason === 'response-failed') {
          invalidateEngineerRepairLists();
        }

        return submitResult;
      } catch (error) {
        const message = isGraphQLIngressError(error)
          ? error.userMessage
          : '处理回复失败，请稍后重试';
        const transportResult: CreateEngineerResponseResult = {
          ok: false,
          reason: 'response-failed',
          message,
        };
        setResult(transportResult);
        // transport 失败同样视为回复结果不确定（请求可能已在服务端生效），
        // 与显式 response-failed 结果一致宣告列表失效
        invalidateEngineerRepairLists();
        return transportResult;
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [],
  );

  /**
   * response-failed 重查确认回复已写入后的反馈收敛（application 编排层专用）：
   * 以重查详情中匹配到的服务端新回复改写最近一次结果为成功。
   */
  const convergeToSubmitted = useCallback((response: EngineerRepairRequestResponseItem) => {
    setResult({ ok: true, response });
  }, []);

  return { submit, submitting, result, convergeToSubmitted };
}
