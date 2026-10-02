// src/pages/reference-documents/index.tsx

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate } from 'react-router';

import { useAuthSession } from '@/features/auth-session';
import { REFERENCE_DOCUMENT_NEW_PATH, ReferenceDocumentList } from '@/features/reference-document';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 参考资料库列表页。
 *
 * 路由 /reference-documents 在 app/router 注册并复用 protectedRouteLoader；
 * 角色路由放行表仅允许 ENGINEER / SUPER_ADMIN（CUSTOMER 被安全跳转回个人主页）。
 * 写入能力按后端口径精确匹配 SUPER_ADMIN（不继承），由页面层判定后以页头主操作区
 * 承载新增入口（PR5 S3-2：明确主操作区，工程师不渲染）；列表组件只负责真实列表本体，
 * 不读取 Session、不判定角色。页头主按钮走通用默认档（基准 §6.5：8px），
 * 不使用知识库页专属的 `.kb-primary-action`。
 *
 * 整页视觉变体（PR5 整页视觉计划 20260929）：本页是精确列表路由，页面根挂
 * `reference-library-page` 承担桌面顶部 48.5px 视觉节奏，页头走 `reference-library`
 * 紧凑变体（20/28、12/16、高 67、下距 20）；工作区纯色铺满由 AppLayout 的
 * `app-workspace--reference-library` 负责。新增（/reference-documents/new）与详情
 * 路由不消费本变体，继续通用渐变工作区与默认页头。
 */
export function ReferenceDocumentsPage() {
  const { session } = useAuthSession();
  const navigate = useNavigate();
  const canManage = session?.role === 'SUPER_ADMIN';

  return (
    <div className="page-stack reference-library-page">
      <PageHeader
        description="查阅光刻机维护知识库：错误代码手册、维护指南、安全规范与检查表。"
        eyebrow="Reference Documents"
        extra={
          canManage ? (
            <Button
              icon={<PlusOutlined />}
              onClick={() => void navigate(REFERENCE_DOCUMENT_NEW_PATH)}
              type="primary"
            >
              新增资料
            </Button>
          ) : null
        }
        title="参考资料库"
        variant="reference-library"
      />
      <ReferenceDocumentList />
    </div>
  );
}
