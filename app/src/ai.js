// AI 底座（P0-3）：阿里百炼 OpenAI 兼容客户端。
// - 配置只从环境变量读：AI_BASE_URL / AI_API_KEY / AI_MODEL（默认 qwen-plus）
// - 密钥只放服务器 .env，不进 git、不下发到 Web/Android
// - 输出强制结构化 JSON：解析失败抛错、不写库、不伪造（调用方 catch 后原样保留旧数据）
// - 每次调用写 ai_calls 记账（成功 / 失败都记；记账失败不影响主流程）
const { nowIso } = require('./tz');

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen-plus';

class AiError extends Error {
  constructor(message, { kind = 'ai_error', status = 0, detail = '' } = {}) {
    super(message);
    this.name = 'AiError';
    this.kind = kind; // no_key / network / http / bad_json / timeout
    this.status = status;
    this.detail = detail;
  }
}

function aiConfig() {
  return {
    baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || DEFAULT_MODEL,
  };
}

function aiAvailable() {
  return Boolean(aiConfig().apiKey);
}

// ---- ai_calls 记账（best effort，绝不抛出）----
async function recordCall(db, rec) {
  if (!db) return;
  try {
    await db.run(
      `INSERT INTO ai_calls (user_id, workflow, action, status, model, prompt_tokens, completion_tokens, total_tokens, duration_ms, detail, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rec.userId ?? null, rec.workflow || '', rec.action || '', rec.status || 'ok', rec.model || '',
        rec.promptTokens || 0, rec.completionTokens || 0, rec.totalTokens || 0, rec.durationMs || 0,
        rec.detail || '', rec.idempotencyKey ?? null, nowIso()]
    );
  } catch (e) { /* 记账失败不影响主流程 */ }
}

// 记一次「整轮跳过」：AI 判断不用改 / 信息不够，没调模型
async function recordSkip(db, { userId, workflow, action, detail = '' }) {
  await recordCall(db, { userId, workflow, action, status: 'skip', detail });
}

// ---- 调模型（原生 fetch，无 SDK 依赖）----
// opts: { messages, tools, json=true, timeoutMs, userId, workflow, action, idempotencyKey, detail, db }
// 返回 { content, toolCalls, usage }
async function chat(db, opts) {
  const cfg = aiConfig();
  const {
    messages, tools = undefined, json = false, timeoutMs = 45000,
    userId = null, workflow = '', action = '', idempotencyKey = null, detail = '',
  } = opts || {};
  if (!cfg.apiKey) throw new AiError('未配置 AI_API_KEY，AI 功能不可用', { kind: 'no_key' });

  const body = { model: cfg.model, messages };
  if (tools && tools.length) body.tools = tools;
  // 结构化 JSON：要求 prompt 里已说明要输出 JSON；失败重试一次，仍失败抛 bad_json
  if (json) body.response_format = { type: 'json_object' };

  const started = Date.now();
  let result = null;
  let lastErr = null;
  const attempts = json ? 2 : 1;
  for (let i = 0; i < attempts; i++) {
    try {
      result = await requestOnce(cfg, body, timeoutMs);
      break;
    } catch (e) {
      lastErr = e;
      // 网络错 / 超时 / HTTP 错不重试（避免烧额度）；只有 JSON 解析错才重试一次
      if (e.kind !== 'bad_json') break;
    }
  }
  const durationMs = Date.now() - started;

  if (!result) {
    await recordCall(db, {
      userId, workflow, action, status: 'fail', model: cfg.model, durationMs,
      detail: JSON.stringify({ error: String(lastErr && lastErr.message), kind: lastErr && lastErr.kind }),
      idempotencyKey,
    });
    throw lastErr;
  }

  await recordCall(db, {
    userId, workflow, action, status: 'ok', model: cfg.model, durationMs,
    promptTokens: result.usage.prompt_tokens, completionTokens: result.usage.completion_tokens,
    totalTokens: result.usage.total_tokens, detail, idempotencyKey,
  });
  return result;
}

async function requestOnce(cfg, body, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AiError('AI 请求超时', { kind: 'timeout' });
    throw new AiError(`AI 网络错误：${e.message}`, { kind: 'network' });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AiError(`AI 接口返回 ${res.status}`, { kind: 'http', status: res.status, detail: text.slice(0, 500) });
  }

  const data = await res.json();
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) throw new AiError('AI 返回结构异常（无 choices）', { kind: 'bad_json' });

  const out = {
    content: msg.content || '',
    toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };

  if (body.response_format) {
    out.parsed = parseJsonLoose(out.content); // 解析失败为 null，由 chat() 重试
    if (!out.parsed) {
      throw new AiError('AI 输出不是合法 JSON', { kind: 'bad_json', detail: out.content.slice(0, 300) });
    }
  }
  return out;
}

// 宽松 JSON 提取：剥掉 ```json 围栏、抓首尾大括号
function parseJsonLoose(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch (e) { /* 继续抓大括号 */ }
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
  }
  return null;
}

module.exports = {
  AiError,
  aiConfig,
  aiAvailable,
  chat,
  recordSkip,
  recordCall,
  parseJsonLoose,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
};
