// src/features/repair-request/ui/engineer-repair-request-paths.ts

/**
 * 工程师维修申请切片路由路径的唯一真源（列表、详情与首页入口共用），
 * 不在多个组件里各写一份字面量。路由注册见 app/router。
 */
export const ENGINEER_REPAIR_REQUEST_LIST_PATH = '/engineer/repair-requests';

/** 详情路径以 / 结尾，与申请 ID 拼接得到 /engineer/repair-requests/:requestId */
export const ENGINEER_REPAIR_REQUEST_DETAIL_PATH = '/engineer/repair-requests/';
