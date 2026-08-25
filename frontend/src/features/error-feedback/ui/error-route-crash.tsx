// src/features/error-feedback/ui/error-route-crash.tsx

import { BugOutlined } from '@ant-design/icons';

import { ErrorBlock } from './error-block';

export function ErrorRouteCrash() {
  return (
    <ErrorBlock
      actions={[{ label: '返回工作台', to: '/' }]}
      description={'页面在渲染前发生了未预期的错误。\n这通常是临时问题，刷新页面后可能恢复。'}
      icon={<BugOutlined />}
      statusCode="ERR"
      title="路由渲染异常"
      tone="error"
    />
  );
}
