const crypto = require('crypto');
const fs = require('fs');

const TYPE_ONLY_FROM_RE =
  /\b(?:import|export)\s+type\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;

module.exports = {
  extract(code, filePath, defaultExtract) {
    const dependencies = defaultExtract(code, filePath);

    for (const match of code.matchAll(TYPE_ONLY_FROM_RE)) {
      dependencies.add(match[1]);
    }

    return dependencies;
  },

  getCacheKey() {
    return crypto.createHash('sha1').update(fs.readFileSync(__filename)).digest('hex');
  },
};
