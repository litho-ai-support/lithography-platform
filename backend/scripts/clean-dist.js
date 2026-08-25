const fs = require('node:fs');
const path = require('node:path');

const distPath = path.join(process.cwd(), 'dist');

try {
  fs.rmSync(distPath, {
    force: true,
    maxRetries: 5,
    recursive: true,
    retryDelay: 100,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`failed to clean dist: ${message}\n`);
  process.exit(1);
}
