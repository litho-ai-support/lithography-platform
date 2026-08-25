// src/pages/project-structure/index.tsx

import { Card, Timeline } from 'antd';

import { PageHeader } from '@/shared/ui/page-header';

const layerItems = [
  {
    children: 'app：路由、Provider、应用壳层与导航事实源',
    color: 'blue',
  },
  {
    children: 'pages：路由级页面组合，不承载业务基础设施',
    color: 'blue',
  },
  {
    children: 'widgets / features：跨页面区块与用户动作流程',
    color: 'blue',
  },
  {
    children: 'entities / shared：稳定业务类型与通用基础设施',
    color: 'blue',
  },
  {
    children: 'labs / sandbox：受控实验与一次性原型',
    color: 'gray',
  },
];

const promotionCards = [
  {
    body: '价值已经有方向，但仍需要受控观察和复查。',
    title: 'Labs 实验区',
  },
  {
    body: '一次性 UI 或交互试验只在 dev/test 暴露。',
    title: 'Sandbox 试验区',
  },
  {
    body: '验证通过的能力经评审后迁入最小稳定 owner。',
    title: 'Stable 正式区',
  },
];

export function ProjectStructurePage() {
  return (
    <div className="page-stack">
      <PageHeader
        description="这里保留足够的结构，让 AI agent 能正确放置改动，同时不引入具体产品域。"
        title="项目结构"
      />

      <div className="surface-panel">
        <Timeline items={layerItems} />
      </div>

      <section className="card-grid" aria-label="迁移路径">
        {promotionCards.map((card) => (
          <Card hoverable key={card.title} title={card.title}>
            <p className="m-0 text-text-secondary">{card.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
