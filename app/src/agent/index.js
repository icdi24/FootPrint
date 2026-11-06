// agent/index.js —— zoowy 网关统一入口（P0-4）
// 拓扑：一个 zoowy 网关 + 4 个专业工作流（plan/progress/daily/chat）。
// 「专业」体现在：每个工作流有自己的提示词、工具白名单、输出 schema。
const { runAgentLoop, MAX_TOOL_ROUNDS, TOTAL_TIMEOUT_MS } = require('./gateway');
const { IMPLEMENTATIONS, WHITELIST, toolsFor, executeTool, applyProfilePatch, snapshotPlan } = require('./tools');
const plan = require('./workflows/plan');
const progress = require('./workflows/progress');
const daily = require('./workflows/daily');
const chat = require('./workflows/chat');
const session = require('./session');

module.exports = {
  runAgentLoop,
  MAX_TOOL_ROUNDS,
  TOTAL_TIMEOUT_MS,
  tools: { IMPLEMENTATIONS, WHITELIST, toolsFor, executeTool, applyProfilePatch, snapshotPlan },
  session,
  workflows: { plan, progress, daily, chat },
};
