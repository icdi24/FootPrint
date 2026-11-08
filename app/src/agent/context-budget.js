const CONTEXT_LIMIT = 300000;
const HISTORY_BUDGET = 230000;
const PROTOCOL_RESERVE = 8192;
// DeepSeek caps each image at 1024 vision tokens. Reserve extra for message framing.
const IMAGE_BUDGET = 1152;

function estimateContext(messages, tools) {
  // Count UTF-8 bytes as a conservative local estimate, including JSON framing.
  // Inline image bytes are transport, so reserve vision tokens instead.
  const normalized = (messages || []).map((message) => ({ ...message,
    content: Array.isArray(message.content) ? message.content.map((part) => (
      part.type === 'image_url' ? { type: 'image_url', budget: 'x'.repeat(IMAGE_BUDGET) } : part
    )) : message.content,
  }));
  return Buffer.byteLength(JSON.stringify({ messages: normalized, tools: tools || [] }));
}

function assertContextBudget({ messages, tools, outputTokens = 8192 }) {
  if (estimateContext(messages, tools) + outputTokens + PROTOCOL_RESERVE > CONTEXT_LIMIT) {
    throw Object.assign(new Error('本轮上下文超过 30 万 token 的预算，请先摘要上下文或缩小资料范围'), {
      status: 413, code: 'context_budget',
    });
  }
}

function pickRecentHistory(rows) {
  let remaining = HISTORY_BUDGET;
  const history = [];
  for (const row of rows) {
    const message = { role: row.role, content: row.content };
    // Reserve for the additional JSON-encoded history block in deep thinking mode.
    const cost = Buffer.byteLength(JSON.stringify(JSON.stringify(message))) + 16;
    if (cost > remaining) break;
    history.push(message);
    remaining -= cost;
  }
  return history.reverse();
}

module.exports = { CONTEXT_LIMIT, estimateContext, assertContextBudget, pickRecentHistory };
