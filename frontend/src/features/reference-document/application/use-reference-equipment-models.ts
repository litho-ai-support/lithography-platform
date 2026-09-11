// src/features/reference-document/application/use-reference-equipment-models.ts

import { useCallback, useEffect, useState } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import type { ReferenceDocumentEquipmentModelOption } from '../infrastructure/reference-document.types';
import { fetchReferenceEquipmentModels } from '../infrastructure/reference-document-adapter';

/**
 * 设备型号下拉选项状态（列表筛选与创建/编辑表单共用）。
 * 加载中 / 失败（含重试）/ 就绪三态；auth 错误由共享错误模型归一文案。
 */

export type ReferenceEquipmentModelsState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; models: ReferenceDocumentEquipmentModelOption[] };

function toModelsUserMessage(error: unknown): string {
  return isGraphQLIngressError(error) ? error.userMessage : '设备型号列表加载失败，请稍后重试。';
}

export function useReferenceEquipmentModels() {
  const [state, setState] = useState<ReferenceEquipmentModelsState>({ status: 'loading' });

  const loadModels = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const models = await fetchReferenceEquipmentModels();

      setState({ status: 'ready', models });
    } catch (error) {
      setState({ status: 'failed', message: toModelsUserMessage(error) });
    }
  }, []);

  useEffect(() => {
    // 微任务中发起：effect 同步链路不触发 setState（react-hooks/set-state-in-effect）
    queueMicrotask(() => void loadModels());
  }, [loadModels]);

  return { state, reload: loadModels };
}
