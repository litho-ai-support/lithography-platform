// test/register-graphql-schema.ts
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * 手动配置的 GraphQL 目录（用于不符合自动发现规则的特殊目录）
 * 可以添加任何自定义路径，支持相对路径和绝对路径
 */
const GRAPHQL_DIRS: string[] = [
  // 示例：添加特殊的 GraphQL 目录
  'src/cats',
];

/**
 * 自动发现所有模块的 dto 和 graphql 目录
 * @returns GraphQL 相关目录路径数组
 */
async function discoverGraphqlDirs(): Promise<string[]> {
  const modulesPath = path.resolve(__dirname, '..', 'src/modules');
  const graphqlDirs: string[] = [];

  try {
    const modules = await readdir(modulesPath);
    console.log(`📂 发现 ${modules.length} 个模块:`, modules);

    for (const module of modules) {
      // 跳过非目录文件（如 modules.module.ts）
      const modulePath = path.join(modulesPath, module);
      const moduleStats = await stat(modulePath).catch(() => null);

      if (!moduleStats?.isDirectory()) {
        continue;
      }

      // 检查 dto 目录
      const dtoPath = path.join(modulePath, 'dto');
      try {
        const dtoStats = await stat(dtoPath);
        if (dtoStats.isDirectory()) {
          graphqlDirs.push(`src/modules/${module}/dto`);
          console.log(`✅ 发现 DTO 目录: ${module}/dto`);
        }
      } catch {
        // dto 目录不存在，跳过
        console.log(`⚪ 模块 ${module} 没有 dto 目录`);
      }

      // 检查 graphql 目录
      const graphqlPath = path.join(modulePath, 'graphql');
      try {
        const graphqlStats = await stat(graphqlPath);
        if (graphqlStats.isDirectory()) {
          graphqlDirs.push(`src/modules/${module}/graphql`);
          console.log(`✅ 发现 GraphQL 目录: ${module}/graphql`);
        }
      } catch {
        // graphql 目录不存在，跳过
        console.log(`⚪ 模块 ${module} 没有 graphql 目录`);
      }
    }
  } catch (err) {
    console.warn('⚠️ 无法扫描 modules 目录:', err);
  }

  return graphqlDirs;
}

/**
 * 递归扫描目录并注册 GraphQL 类型
 * @param dirPath 目录路径
 */
async function scanAndRegisterTypes(dirPath: string): Promise<void> {
  let files: string[];

  try {
    files = await readdir(dirPath);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    console.warn(`⚠️ 无法读取目录: ${dirPath}`);
    return;
  }

  for (const file of files) {
    const fullPath = path.join(dirPath, file);

    try {
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        // 递归扫描子目录
        await scanAndRegisterTypes(fullPath);
      } else if (stats.isFile()) {
        // 跳过 index 文件避免二次注册
        if (file === 'index.ts' || file === 'index.js') continue;
        // 使用明确的目录类型判断
        let isValidFile = false;

        if (dirPath.includes('/dto')) {
          isValidFile = /\.(input|args|dto|list|object)\.(ts|js)$/.test(file);
        } else if (dirPath.includes('/graphql')) {
          isValidFile = /\.(enum|types|object|interface)\.(ts|js)$/.test(file);
        } else {
          // 可选：对未知目录类型的处理
          console.warn(`⚠️ 未识别的目录类型: ${dirPath}，跳过文件: ${file}`);
          continue;
        }

        if (isValidFile) {
          const fileUrl = pathToFileURL(fullPath).href;
          console.log(`📝 注册 GraphQL 类型: ${path.relative(process.cwd(), fullPath)}`);
          await import(fileUrl);
        }
      }
    } catch (err) {
      console.warn(`⚠️ 处理文件失败: ${fullPath}`, err);
    }
  }
}

/**
 * 注册所有 GraphQL 类型
 */
export async function registerGraphqlTypes(): Promise<void> {
  console.log('🔄 开始自动发现并注册 GraphQL 类型...');

  // 1. 自动发现所有模块的 dto 和 graphql 目录
  const autoDiscoveredDirs = await discoverGraphqlDirs();

  // 2. 合并自动发现的目录和手动配置的目录
  const allGraphqlDirs = [...autoDiscoveredDirs, ...GRAPHQL_DIRS];

  // 3. 去重（防止重复目录）
  const uniqueGraphqlDirs = [...new Set(allGraphqlDirs)];

  if (uniqueGraphqlDirs.length === 0) {
    console.log('⚪ 未发现任何 GraphQL 目录');
    return;
  }

  console.log(`📂 自动发现: ${autoDiscoveredDirs.length} 个目录`);
  console.log(`📝 手动配置: ${GRAPHQL_DIRS.length} 个目录`);
  console.log(`📂 总共处理: ${uniqueGraphqlDirs.length} 个 GraphQL 目录`);

  for (const dir of uniqueGraphqlDirs) {
    const absPath = path.resolve(__dirname, '..', dir);
    console.log(`🔍 扫描目录: ${dir}`);
    await scanAndRegisterTypes(absPath);
  }

  console.log('✅ GraphQL 类型注册完成');
}
