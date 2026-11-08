// DeepSeek 官方客户端。密钥和模型由服务端环境或账号配置提供。
const { nowIso } = require('./tz');
const { assertContextBudget } = require('./agent/context-budget');

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const COMPLETIONS_URL = `${DEFAULT_BASE_URL}/chat/completions`;
const DEFAULT_MODEL = 'deepseek-flash';
const DEEPSEEK_MODELS = Object.freeze([DEFAULT_MODEL, 'deepseek-v4-pro']);

class AiError extends Error {
  constructor(message, { kind = 'ai_error', status = 0, detail = '' } = {}) {
    super(message);
    this.name = 'AiError';
    this.kind = kind; // no_key / network / http / bad_json / timeout
    this.status = status;
    this.detail = detail;
  }
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw new AiError('本轮已停止', { kind: 'cancelled', status: 409 });
}

function aiConfig() {
  return {
    apiKey: (process.env.DEEPSEEK_API_KEY || '').trim(),
    model: (process.env.DEEPSEEK_MODEL || '').trim() || DEFAULT_MODEL,
  };
}

function aiAvailable() {
  const cfg = aiConfig();
  return Boolean(cfg.apiKey) && DEEPSEEK_MODELS.includes(cfg.model);
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
// providerConfig 由服务端传入。未提供时使用旧工作流的部署者配置。
// 返回 { content, toolCalls, usage }
async function chat(db, opts = {}) {
  const cfg = Object.hasOwn(opts, 'providerConfig') ? opts.providerConfig : aiConfig();
  const {
    messages, tools = undefined, json = false, timeoutMs = 45000, maxTokens = 8192, deepThinking = false, signal,
    userId = null, workflow = '', action = '', idempotencyKey = null, detail = '',
  } = opts;
  throwIfCancelled(signal);
  if (!cfg?.apiKey) throw new AiError('请先配置 DeepSeek API Key', { kind: 'no_key' });
  if (!DEEPSEEK_MODELS.includes(cfg.model)) throw new AiError('DeepSeek 模型配置无效', { kind: 'invalid_model' });
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new AiError('输出 token 预算无效', { kind: 'invalid_budget' });

  const thinking = deepThinking === true;
  const body = { model: cfg.model, messages, thinking: { type: thinking ? 'enabled' : 'disabled' } };
  if (thinking) body.reasoning_effort = 'high';
  body.max_tokens = maxTokens;
  if (tools && tools.length) body.tools = tools;
  // 结构化 JSON：要求 prompt 里已说明要输出 JSON；失败重试一次，仍失败抛 bad_json
  if (json) body.response_format = { type: 'json_object' };

  const started = Date.now();
  const deadline = started + timeoutMs;
  let result = null;
  let lastErr = null;
  const attempts = json ? 2 : 1;
  for (let i = 0; i < attempts; i++) {
    try {
      throwIfCancelled(signal);
      assertContextBudget({ messages: body.messages, tools: body.tools, outputTokens: body.max_tokens });
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new AiError('DeepSeek 请求超时', { kind: 'timeout' });
      result = await requestOnce(cfg, body, remainingMs, signal);
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
  throwIfCancelled(signal);
  return result;
}

async function requestOnce(cfg, body, timeoutMs, callerSignal) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, ac.signal]) : ac.signal;
  try {
    const res = await fetch(COMPLETIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      redirect: 'error',
    });
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      throw new AiError(`DeepSeek 接口返回 ${res.status}`, { kind: 'http', status: res.status });
    }

    const data = await res.json();
    throwIfCancelled(callerSignal);
    if (ac.signal.aborted) throw new AiError('DeepSeek 请求超时', { kind: 'timeout' });
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new AiError('DeepSeek 在答复完成前达到输出上限，请缩小问题后再试', { kind: 'length' });
    }
    if (choice?.finish_reason === 'content_filter') {
      throw new AiError('DeepSeek 中止了这次答复，请调整问题后再试', { kind: 'content_filter' });
    }
    if (choice?.finish_reason === 'aborted' || choice?.finish_reason === 'insufficient_system_resource') {
      throw new AiError('DeepSeek 未完成答复，请稍后重试', { kind: 'interrupted' });
    }
    const msg = choice?.message;
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new AiError('DeepSeek 返回结构异常', { kind: 'bad_json' });

    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (choice.finish_reason === 'tool_calls' && !toolCalls.length) {
      throw new AiError('DeepSeek 返回了不完整的工具调用', { kind: 'bad_json' });
    }
    if (toolCalls.some((call) => typeof call?.id !== 'string' || !call.id || call.type !== 'function')
      || new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length) {
      throw new AiError('DeepSeek 返回了无效的工具调用', { kind: 'bad_json' });
    }

    const out = {
      content: typeof msg.content === 'string' ? msg.content : '',
      toolCalls,
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };

    if (body.thinking.type === 'enabled' && toolCalls.length) {
      if (typeof msg.reasoning_content !== 'string') {
        throw new AiError('DeepSeek 返回了不完整的深度思考结果', { kind: 'bad_json' });
      }
      // 仅用于当前请求内部的工具子轮回传。序列化结果时排除此字段。
      Object.defineProperty(out, 'reasoningContent', { value: msg.reasoning_content });
    }

    if (body.response_format) {
      out.parsed = parseJsonLoose(out.content);
      if (!out.parsed) throw new AiError('DeepSeek 输出不是合法 JSON', { kind: 'bad_json' });
    }
    return out;
  } catch (error) {
    throwIfCancelled(callerSignal);
    if (ac.signal.aborted) throw new AiError('DeepSeek 请求超时', { kind: 'timeout' });
    if (error instanceof AiError) throw error;
    if (error instanceof SyntaxError) throw new AiError('DeepSeek 响应不是合法 JSON', { kind: 'bad_json' });
    throw new AiError('连接 DeepSeek 失败', { kind: 'network' });
  } finally {
    clearTimeout(timer);
  }
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
  throwIfCancelled,
  aiConfig,
  aiAvailable,
  chat,
  recordSkip,
  recordCall,
  parseJsonLoose,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEEPSEEK_MODELS,
};
