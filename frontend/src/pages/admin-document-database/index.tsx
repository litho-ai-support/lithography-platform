// src/pages/admin-document-database/index.tsx

import { useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton, Tabs } from 'antd';
import { useNavigate } from 'react-router';

import {
  AdminAiConversationsTab,
  AdminAiReportsTab,
  AdminRepairRequestsTab,
  useAdminDocumentStats,
} from '@/features/admin-document-database';
import { REFERENCE_DOCUMENT_NEW_PATH, ReferenceDocumentList } from '@/features/reference-document';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 文档数据库页（PR3 S3）：页头四类真实统计 + 四标签。
 *
 * - 路由治理复用 protectedRouteLoader 与 /admin/** 角色策略
 * *（SUPER_ADMIN 放行，ENGINEER/CUSTOMER 按角色路径表拒绝）；
 * - 四个标签各自实例化独立的列表 hook（筛选/分页/加载状态互不共享），
 *   Tabs 默认懒挂载、已挂载标签卸载保留，切换不串数据；
 * - 参考资料标签按计划表「复用当前 GraphQL/REST 契约」：直接组合
 *   features/reference-document 公开列表组件（含筛选/分页/四态与
 *   仅 SUPER_ADMIN 的上传、编辑、软删除能力），不制造平行功能；
 * - 统计口径与默认列表过滤一致（不含软删除），来自后端聚合统计查询；
 * - 本页新增的管理员聚合 Query（维修申请 / AI 会话 / AI 报告）全为只读；仅参考资料标签
 *   复用既有、只向 SUPER_ADMIN 开放的管理能力（上传 / 编辑 / 软删），故页面整体非绝对只读。
 */
export function AdminDocumentDatabasePage() {
  const stats = useAdminDocumentStats();
  const navigate = useNavigate();
  // Tabs 受控：右上「新增资料」主操作仅在默认参考资料标签激活时出现（PR3 R7 S4）；
  // 受控不改变 AntD 默认懒挂载与已挂载标签的保留行为。
  const [activeTabKey, setActiveTabKey] = useState('reference-documents');

  return (
    <div className="kb-page">
      <PageHeader
        description="集中管理诊断模型所需的精选手册、维修报告与问题解决报告，及平台 AI 会话与报告。"
        eyebrow="Knowledge Management"
        extra={
          activeTabKey === 'reference-documents' ? (
            <span className="kb-primary-action">
              <Button
                icon={<PlusOutlined />}
                type="primary"
                onClick={() => void navigate(REFERENCE_DOCUMENT_NEW_PATH)}
              >
                新增资料
              </Button>
            </span>
          ) : null
        }
        title="文档数据库"
        variant="knowledge-base"
      />

      {stats.state.status === 'loading' ? (
        <div className="mb-4">
          <Skeleton active paragraph={{ rows: 1 }} />
        </div>
      ) : null}
      {stats.state.status === 'failed' ? (
        <div className="mb-4">
          <Alert
            action={
              <Button onClick={stats.reload} size="small">
                重试
              </Button>
            }
            description="列表功能不受影响。"
            showIcon
            title={`统计加载失败：${stats.state.message}`}
            type="error"
          />
        </div>
      ) : null}
      {stats.state.status === 'ready' ? (
        /* 四分区紧凑汇总条：业务保留四类真实统计（原型为演示元数据，属登记偏差）；
           口径提示以小字附在数值后，不破坏原型 67.5px 行高 */
        <div className="kb-card kb-summary">
          <div className="kb-summary-cell">
            <div className="kb-summary-label">维修申请</div>
            <div className="kb-summary-value">
              {stats.state.stats.repairRequestTotal}
              <span className="kb-summary-hint">不含软删除</span>
            </div>
          </div>
          <div className="kb-summary-cell">
            <div className="kb-summary-label">参考资料</div>
            <div className="kb-summary-value">
              {stats.state.stats.referenceDocumentTotal}
              <span className="kb-summary-hint">不含软删除</span>
            </div>
          </div>
          <div className="kb-summary-cell">
            <div className="kb-summary-label">AI 会话</div>
            <div className="kb-summary-value">
              {stats.state.stats.aiConversationTotal}
              <span className="kb-summary-hint">全部工程师会话</span>
            </div>
          </div>
          <div className="kb-summary-cell">
            <div className="kb-summary-label">AI 报告</div>
            <div className="kb-summary-value">
              {stats.state.stats.aiReportTotal}
              <span className="kb-summary-hint">全部生成报告</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="kb-tabs">
        <Tabs
          activeKey={activeTabKey}
          items={[
            {
              children: <ReferenceDocumentList canManage variant="knowledge-base" />,
              key: 'reference-documents',
              label: '参考资料',
            },
            {
              children: <AdminRepairRequestsTab />,
              key: 'repair-requests',
              label: '维修申请',
            },
            {
              children: <AdminAiConversationsTab />,
              key: 'ai-conversations',
              label: 'AI 会话',
            },
            {
              children: <AdminAiReportsTab />,
              key: 'ai-reports',
              label: 'AI 报告',
            },
          ]}
          onChange={setActiveTabKey}
        />
      </div>
    </div>
  );
}
