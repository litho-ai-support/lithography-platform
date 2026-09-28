// src/features/reference-document/application/use-reference-document-create.ts

import { useCallback, useRef, useState } from 'react';

import type {
  CreateReferenceDocumentInput,
  CreateReferenceDocumentResult,
  CreateReferenceDocumentWithFileInput,
} from '../infrastructure/reference-document.types';
import { createReferenceDocument } from '../infrastructure/reference-document-adapter';
import { createReferenceDocumentWithFile } from '../infrastructure/reference-document-http-adapter';

/**
 * 参考资料创建流程编排（通道分流 + 在途锁 + 结果归一，收束在 feature application）。
 *
 * 从新增页（page）搬出的原因：页面原先直接消费 createReferenceDocument /
 * createReferenceDocumentWithFile 两个 concrete adapter，并自行实现「按表单输出分流 +
 * 在途锁 + 结果归一」，`page` 不应吞掉业务编排（stable-clean architecture §5）。
 * 搬出后页面只消费本 hook 的 `{ createdId, submit }` 并负责装配、展示与导航，
 * concrete 写 adapter 也不再经 barrel 跨层暴露。
 *
 * 行为口径（与搬出前逐字一致）：
 * - 通道分流：表单输出带 file 走 REST multipart 上传（contentText 可空），纯文本走
 *   GraphQL mutation（双空拦截已由表单预检承担，此处不做二次判定）；
 * - 在途锁：以 ref 拦截提交在途期间的重复提交，返回「正在提交中」的业务拒绝而非静默丢弃；
 * - 结果归一：两条通道的业务结果统一收敛为 `{ ok: true } | { ok: false; message }`，
 *   与表单 onSubmit 的返回同形，页面不感知 reason 分支；
 * - createdId 由本层持有，页面据其切换成功态并导航；失败时不做乐观成功。
 */

/** 创建提交输入：与表单输出同形（含创建专属的 file 字段），避免 application 依赖 ui 类型 */
export type ReferenceDocumentCreateInput = {
  title: string;
  documentType: string;
  equipmentModelId: number | null;
  description: string | null;
  contentText: string | null;
  file: File | null;
};

/** 创建提交结果：与表单 onSubmit 的返回同形（结构一致，可直接接到表单 onSubmit 上） */
export type ReferenceDocumentCreateSubmitResult = { ok: true } | { ok: false; message: string };

export function useReferenceDocumentCreate() {
  const [createdId, setCreatedId] = useState<number | null>(null);
  const creatingRef = useRef(false);

  const submit = useCallback(
    async (output: ReferenceDocumentCreateInput): Promise<ReferenceDocumentCreateSubmitResult> => {
      if (creatingRef.current) {
        return { ok: false, message: '正在提交中，请稍候。' };
      }

      creatingRef.current = true;

      try {
        if (output.file !== null) {
          const input: CreateReferenceDocumentWithFileInput = {
            title: output.title,
            documentType: output.documentType,
            equipmentModelId: output.equipmentModelId,
            description: output.description,
            contentText: output.contentText,
            file: output.file,
          };
          const result = await createReferenceDocumentWithFile(input);

          if (result.ok) {
            setCreatedId(result.id);

            return { ok: true };
          }

          return { ok: false, message: result.message };
        }

        // 纯文本通道：双空预检保证 contentText 非空，类型上仍需收窄为 string
        const input: CreateReferenceDocumentInput = {
          title: output.title,
          documentType: output.documentType,
          equipmentModelId: output.equipmentModelId,
          description: output.description,
          contentText: output.contentText ?? '',
        };
        const result: CreateReferenceDocumentResult = await createReferenceDocument(input);

        if (result.ok) {
          setCreatedId(result.id);

          return { ok: true };
        }

        return { ok: false, message: result.message };
      } finally {
        creatingRef.current = false;
      }
    },
    [],
  );

  return { createdId, submit };
}
