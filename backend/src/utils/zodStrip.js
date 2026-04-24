// Zod v4 throws by default on unknown keys (changed from v3 which stripped them).
// Monkey-patch z.object to always use strip mode so existing schemas keep working.
const { z } = require("zod");

const _originalObject = z.object.bind(z);
z.object = function (...args) {
  return _originalObject(...args).strip();
};

// Export z for convenience (same instance, now patched)
module.exports = { z };
