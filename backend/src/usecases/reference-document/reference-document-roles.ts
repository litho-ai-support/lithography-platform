// src/usecases/reference-document/reference-document-roles.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import {
  DomainError,
  PERMISSION_ERROR,
  REFERENCE_DOCUMENT_ERROR,
} from '@core/common/errors/domain-error';
import { hasRole } from '@core/account/policy/role-access.policy';

/**
 * 读角色兜底决策：ENGINEER 可读，SUPER_ADMIN 按角色继承规则准入（hasRole 层级展开），
 * CUSTOMER 一律拒绝（负责人 0907.docx 任务二角色权限建议）。
 * 守卫层 @Roles(ENGINEER, SUPER_ADMIN) 已拦截，此处兜底防止守卫被绕过或角色数据漂移。
 */
export function assertReferenceDocumentReadRole(roles: readonly string[]): void {
  if (!hasRole(roles, IdentityTypeEnum.ENGINEER)) {
    throw new DomainError(
      PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
      '仅工程师与管理员账号可以访问参考资料',
      { roles: [...roles] },
    );
  }
}

/**
 * 写角色兜底决策：仅真实 SUPER_ADMIN 可写（精确匹配，不层级展开——
 * docx 第一版工程师不负责增删资料，避免任何工程师污染 AI 知识来源）。
 * 与维修申请删除用例的精确角色口径一致：session.roles 已在 adapter 边界归一化为大写。
 */
export function assertReferenceDocumentWriteRole(roles: readonly string[]): void {
  const requiredRole = String(IdentityTypeEnum.SUPER_ADMIN);
  if (!roles.includes(requiredRole)) {
    throw new DomainError(
      PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
      '仅管理员账号可以维护参考资料',
      { roles: [...roles] },
    );
  }
}

/** 资料 ID 输入校验：必须为正整数 */
export function assertDocumentIdValid(documentId: number): void {
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new DomainError(REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS, '参考资料 ID 无效', {
      documentId,
    });
  }
}

/** 设备型号 ID 输入校验：必须为正整数（调用方保证已区分「未提供/清空」与「提供」） */
export function assertEquipmentModelIdValid(equipmentModelId: number): void {
  if (!Number.isInteger(equipmentModelId) || equipmentModelId <= 0) {
    throw new DomainError(REFERENCE_DOCUMENT_ERROR.INVALID_PARAMS, '设备型号 ID 无效', {
      equipmentModelId,
    });
  }
}
