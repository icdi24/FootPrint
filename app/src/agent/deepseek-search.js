const { isIP } = require('node:net');
const { AiError, DEFAULT_BASE_URL, throwIfCancelled } = require('../ai');

const SEARCH_URL = `${DEFAULT_BASE_URL}/v1/tools/search`;
const RESULT_COUNT = 4;
const RESPONSE_BYTES = 64 * 1024;
const SEARCH_TIMEOUT_MS = 8000;

function shortText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim().slice(0, maxLength).toWellFormed()
    : '';
}

function publicResultUrl(value) {
  if (typeof value !== 'string' || value.length > 360) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port
      || isIP(hostname) || hostname.startsWith('[') || !hostname.includes('.')
      || /\.(?:localhost|local|internal|test|invalid|example)$/.test(hostname)) return null;
    return url.href.length <= 360 ? url.href : null;
  } catch {
    return null;
  }
}

async function readResponse(response) {
  if (Number(response.headers.get('content-length')) > RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new AiError('DeepSeek 搜索结果超出大小限制', { kind: 'search_response_size' });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.byteLength;
    if (size > RESPONSE_BYTES) throw new AiError('DeepSeek 搜索结果超出大小限制', { kind: 'search_response_size' });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}

function normalizeResults(data) {
  if (!Array.isArray(data?.results)) throw new AiError('DeepSeek 搜索返回结构异常', { kind: 'bad_json' });
  const results = [];
  const seenUrls = new Set();
  for (const item of data.results) {
    const url = publicResultUrl(item?.url);
    const title = shortText(item?.title, 100);
    if (!url || !title || seenUrls.has(url)) continue;
    const result = { title, url, snippet: shortText(item.snippet, 240) };
    if (typeof item.date === 'string' && item.date.length <= 40 && Number.isFinite(Date.parse(item.date))) {
      result.publishedAt = new Date(item.date).toISOString();
    }
    if (JSON.stringify([...results, result]).length > 3500) break;
    seenUrls.add(url);
    results.push(result);
    if (results.length >= RESULT_COUNT) break;
  }
  return { results };
}

async function searchDeepSeek({ apiKey, query, timeoutMs = SEARCH_TIMEOUT_MS, signal: callerSignal }) {
  throwIfCancelled(callerSignal);
  if (!apiKey) throw new AiError('请先配置 DeepSeek API Key', { kind: 'no_key' });
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q || !q.isWellFormed() || /[\u0000-\u001f\u007f-\u009f]/.test(q) || [...q].length > 128) {
    throw new AiError('搜索关键词需要 1–128 个字符', { kind: 'search_query' });
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new AiError('智能搜索超时', { kind: 'timeout' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, SEARCH_TIMEOUT_MS));
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
  try {
    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, count: RESULT_COUNT, need_content: false }),
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      throw new AiError(`DeepSeek 搜索接口返回 ${response.status}`, { kind: 'http', status: response.status });
    }
    const result = normalizeResults(await readResponse(response));
    throwIfCancelled(callerSignal);
    if (controller.signal.aborted) throw new AiError('智能搜索超时', { kind: 'timeout' });
    return result;
  } catch (error) {
    throwIfCancelled(callerSignal);
    if (controller.signal.aborted) throw new AiError('智能搜索超时', { kind: 'timeout' });
    if (error instanceof AiError) throw error;
    if (error instanceof SyntaxError) throw new AiError('DeepSeek 搜索响应不是合法 JSON', { kind: 'bad_json' });
    throw new AiError('连接 DeepSeek 搜索失败', { kind: 'network' });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchDeepSeek };
