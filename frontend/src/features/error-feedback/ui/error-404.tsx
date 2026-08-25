// src/features/error-feedback/ui/error-404.tsx

import { CompassOutlined } from '@ant-design/icons';

import { ErrorBlock } from './error-block';

export function Error404() {
  return (
    <ErrorBlock
      actions={[{ label: '返回工作台', to: '/' }]}
      description={'你访问的页面已被移除、重命名，\n或在当前环境中不可用。'}
      icon={<CompassOutlined />}
      statusCode={404}
      title="路由不存在"
      tone="neutral"
    />
  );
}
