// src/pages/shared-ui-gallery/page.tsx

import { Button, Input, Select, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { DataCard } from '@/shared/ui/data-card';
import { EmptyState } from '@/shared/ui/empty-state';
import { ErrorState } from '@/shared/ui/error-state';
import { FilterBar } from '@/shared/ui/filter-bar';
import { LoadingState } from '@/shared/ui/loading-state';
import { PageHeader } from '@/shared/ui/page-header';
import { StatCard } from '@/shared/ui/stat-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { TableContainer } from '@/shared/ui/table-container';

// 开发/试验入口（仅 dev/test 环境经导航与路由 loader 暴露，见 catalog 与 app 路由）：
// 共享视觉 primitives 的真实渲染组合场景，供浏览器截图与 computed-style 断言使用。
// 此处渲染的是组件演示排版，不是业务数据；不新增任何生产假业务页面。

type GalleryRow = {
  key: string;
  component: string;
  purpose: string;
  tone: 'critical' | 'neutral' | 'ok' | 'warn';
};

const GALLERY_ROWS: GalleryRow[] = [
  { component: 'StatusPill', key: 'pill', purpose: '状态胶囊（三态 + 中性）', tone: 'ok' },
  { component: 'DataCard', key: 'card', purpose: '内容卡片容器', tone: 'neutral' },
  { component: 'TableContainer', key: 'table', purpose: '表格容器卡片', tone: 'warn' },
  { component: 'PageHeader', key: 'header', purpose: '页头标题与说明', tone: 'critical' },
];

const COLUMNS: ColumnsType<GalleryRow> = [
  {
    dataIndex: 'component',
    key: 'component',
    title: '组件',
  },
  {
    dataIndex: 'purpose',
    key: 'purpose',
    title: '用途',
  },
  {
    key: 'tone',
    render: (_, record) => <StatusPill tone={record.tone}>{record.tone}</StatusPill>,
    title: '胶囊',
  },
];

export function SharedUiGalleryPage() {
  return (
    <div className="page-stack">
      {/* eyebrow 为可选 API，组合页同屏取证其 computed style（gkj .atta-eyebrow 语言） */}
      <PageHeader
        description="共享视觉 primitives 的真实渲染组合，仅用于开发与验收取证。"
        eyebrow="Shared UI Evidence"
        title="共享组件组合"
      />

      <div className="card-grid">
        <StatCard
          hint="白→淡蓝渐变 + stat-card-border 描边、无投影"
          label="metric-tile 语言"
          value="14px 圆角"
        />
        <StatCard
          hint="三态底色与文字均为语义变量"
          label="StatusPill 状态"
          value="ok / warn / critical"
        />
      </div>

      <DataCard extra={<StatusPill tone="ok">正常</StatusPill>} title="状态胶囊全 tone">
        <div className="filter-bar">
          <StatusPill tone="ok">正常</StatusPill>
          <StatusPill tone="warn">警告</StatusPill>
          <StatusPill tone="critical">严重</StatusPill>
          <StatusPill tone="neutral">中性</StatusPill>
        </div>
      </DataCard>

      {/* FilterBar：gkj .platform-search 容器语言映射（负责人 0916 裁定），
          内含真实 AntD 筛选控件以取得实际 computed style */}
      <DataCard title="筛选栏容器语言（platform-search 映射）">
        <FilterBar>
          <Input placeholder="搜索关键字" style={{ width: 200 }} />
          <Select
            placeholder="状态"
            style={{ width: 140 }}
            options={[
              { value: 'open', label: '待处理' },
              { value: 'closed', label: '已关闭' },
            ]}
          />
          <Button type="primary">查询</Button>
        </FilterBar>
      </DataCard>

      {/* 主/次/危险按钮：AntD token 已对齐 gkj 基准（colorPrimary 与 8px 圆角 Token），
          此处实际渲染供 Chromium 采集（任务书要求三类按钮例证） */}
      <DataCard title="按钮三类">
        <div className="filter-bar">
          <Button type="primary">主按钮</Button>
          <Button>次按钮</Button>
          <Button danger type="primary">
            危险按钮
          </Button>
          <Button type="text">文本按钮</Button>
        </div>
      </DataCard>

      <div className="card-grid">
        <EmptyState description="演示文本：列表没有数据时的容器语言。" title="暂无数据" />
        <ErrorState description="演示文本：加载失败时的容器语言。" title="加载失败" />
        <LoadingState label="演示文本：加载中状态。" />
      </div>

      <TableContainer extra={<StatusPill tone="neutral">4 项</StatusPill>} title="容器卡片内的表格">
        <Table<GalleryRow>
          columns={COLUMNS}
          dataSource={GALLERY_ROWS}
          pagination={false}
          size="small"
        />
      </TableContainer>
    </div>
  );
}
