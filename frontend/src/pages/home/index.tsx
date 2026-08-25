// src/pages/home/index.tsx

import { Button, Card, Descriptions, Tag } from 'antd';
import { useNavigate } from 'react-router';

import { getAppEnv, getGraphQLEndpoint, getHealthEndpoint } from '@/shared/env';
import { PageHeader } from '@/shared/ui/page-header';

const workflowCards = [
  {
    description: '路由、导航事实源、全局 Provider 和 AI 侧栏入口都已经拆开。',
    title: '应用壳层',
  },
  {
    description: '新增 Stable 能力先找最小归属模块，跨模块引用走公开出口。',
    title: '模块归属',
  },
  {
    description: '新功能先在 Lab 落地观察，Sandbox 承接一次性试验，避免污染正式区。',
    title: '实验路径',
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const healthEndpoint = getHealthEndpoint();

  return (
    <div className="page-stack">
      <PageHeader
        description={<>一个小而清晰的 AI 友好前端基线，方便后续稳定扩展。</>}
        title="AIGC 工作台"
      />

      <div className="surface-panel">
        <Descriptions
          bordered
          column={{ lg: 3, md: 2, sm: 1, xs: 1 }}
          items={[
            {
              key: 'env',
              label: '应用环境',
              children: <Tag>{getAppEnv()}</Tag>,
            },
            {
              key: 'graphql',
              label: 'GraphQL',
              children: getGraphQLEndpoint(),
            },
            {
              key: 'health',
              label: '健康检查',
              children: healthEndpoint || '未配置',
            },
          ]}
          size="small"
        />
        <div className="page-action-row">
          <Button type="primary" onClick={() => navigate('/project-structure')}>
            查看项目结构
          </Button>
        </div>
      </div>

      <section className="card-grid" aria-label="工作流切片">
        {workflowCards.map((card) => (
          <Card hoverable key={card.title} title={card.title}>
            <p className="m-0 text-text-secondary">{card.description}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
