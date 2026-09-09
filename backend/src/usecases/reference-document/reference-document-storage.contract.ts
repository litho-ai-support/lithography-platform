// src/usecases/reference-document/reference-document-storage.contract.ts

/**
 * 参考资料文件存储 boundary contract（usecase 层拥有，infrastructure 提供本地实现）。
 *
 * - 存储引用必须由服务端生成：不可猜测且无路径语义，客户端不参与命名（负责人 0909 第二轮要求）；
 * - 引用格式白名单与越界防护属于实现细节，契约只承诺「安全引用 ↔ 字节内容」；
 * - 上传与落库的原子性由调用方编排：先 save 后事务落库，落库失败以 delete 补偿；
 * - 软删除只标记数据库记录，本契约的 delete 仅用于上传/落库失败的补偿清理，不用于业务删除。
 *
 * 接口类型同步 re-export 于相邻 reference-document.types.ts（adapter 层架构规则：
 * 运行时 token 从本契约导入，流程类型从 *.types.ts type-only 导入）。
 */
export const REFERENCE_DOCUMENT_STORAGE = Symbol('REFERENCE_DOCUMENT_STORAGE');

export interface ReferenceDocumentStorage {
  /**
   * 保存文件内容，返回服务端生成的存储引用。
   * 引用由密码学随机字节生成并写前查重，同名覆盖不可能发生。
   */
  save(content: Buffer, fileExtension: string): Promise<string>;

  /**
   * 校验引用格式与越界防护后返回文件绝对路径。
   * 引用格式非法或解析结果越出存储目录时抛错，绝不返回路径。
   */
  resolve(storageReference: string): string;

  /** 删除引用对应文件；文件不存在时静默成功（幂等） */
  delete(storageReference: string): Promise<void>;
}
