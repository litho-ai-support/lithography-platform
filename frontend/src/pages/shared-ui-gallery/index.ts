// src/pages/shared-ui-gallery/index.ts

// 模块公共 API 出口：跨模块 import 只允许走这里（eslint 架构规则）。

export { canAccessSharedUiGallery } from './access';
export { SharedUiGalleryPage } from './page';
