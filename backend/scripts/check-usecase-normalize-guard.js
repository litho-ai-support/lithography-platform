const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();
const USECASES_ROOT = path.join(PROJECT_ROOT, 'src', 'usecases');

const FILE_EXTENSIONS = new Set(['.ts']);
const EXCLUDED_SUFFIXES = ['.normalize.ts', '.input.normalize.ts'];

const CHECKS = [
  {
    id: 'raw-trim-in-usecases',
    description: '禁止在 usecases 非 normalize 文件中直接使用 trim()',
    pattern: /\.trim\s*\(/g,
  },
  {
    id: 'handwritten-limit-clamp',
    description: '禁止手写 Math.min(limit, ...)，请使用统一 normalize policy',
    pattern: /Math\.min\s*\(\s*limit\s*,/g,
  },
  {
    id: 'manual-filter-length',
    description: '禁止手工 filter(...length > 0) 输入收敛',
    pattern: /\.filter\s*\([\s\S]{0,240}?length\s*>\s*0[\s\S]{0,240}?\)/g,
  },
  {
    id: 'manual-set-dedupe',
    description: '禁止手工 new Set(...) 做输入去重',
    pattern: /new\s+Set\s*\(/g,
  },
];

function listFilesRecursively(rootDir) {
  const pending = [rootDir];
  const files = [];
  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name);
      if (FILE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function isExcludedFile(filePath) {
  return EXCLUDED_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
}

function computeLineAndColumn(content, index) {
  const normalizedBefore = content.slice(0, index);
  const lines = normalizedBefore.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

function scanFile(filePath) {
  if (isExcludedFile(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = [];
  for (const check of CHECKS) {
    const matches = content.matchAll(check.pattern);
    for (const match of matches) {
      if (typeof match.index !== 'number') {
        continue;
      }
      const { line, column } = computeLineAndColumn(content, match.index);
      errors.push({
        checkId: check.id,
        description: check.description,
        match: match[0],
        line,
        column,
      });
    }
  }
  return errors;
}

function toRelativePath(absolutePath) {
  return path.relative(PROJECT_ROOT, absolutePath).split(path.sep).join('/');
}

function run() {
  if (!fs.existsSync(USECASES_ROOT)) {
    process.exit(0);
  }
  const files = listFilesRecursively(USECASES_ROOT);
  const violations = [];
  for (const file of files) {
    const issues = scanFile(file);
    for (const issue of issues) {
      violations.push({
        file: toRelativePath(file),
        ...issue,
      });
    }
  }

  if (violations.length === 0) {
    process.stdout.write('usecase normalize guard passed\n');
    process.exit(0);
  }

  process.stderr.write('usecase normalize guard failed\n');
  for (const violation of violations) {
    process.stderr.write(
      `- ${violation.file}:${violation.line}:${violation.column} [${violation.checkId}] ${violation.description}\n`,
    );
    process.stderr.write(`  snippet: ${violation.match}\n`);
  }
  process.exit(1);
}

run();
