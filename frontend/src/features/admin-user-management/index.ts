// src/features/admin-user-management/index.ts

/**
 * 管理员用户管理 feature 的公开 API。
 * 跨模块导入只允许走本文件；application / infrastructure 内部实现不对外暴露，
 * pages 不深层 import。
 */

export { AdminUserManagementPanel } from './ui/admin-user-management-panel';
