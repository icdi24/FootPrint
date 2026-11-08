// agent/gateway.js —— zoowy 统一网关（zoowy v2）
// 单一聊天主线：负责 loop 控制、工具执行与记账。
//  1. loop 控制：最多 6 轮 / 12 个工具调用、总超时 60s；轮次超限与超时都**降级返回**，不抛 500。
//  2. 工具执行：runTool 动态注入（owner-scoped），白名单外一律拒绝；userId 由服务端注入。
//  3. 记账：模型调用在 ai.js 里记，网关中断/降级在这里补记。
const ai = require('../ai');
const { toolsFor, executeTool } = require('./tools');
const { recordCall } = require('../ai');
const { runWithSignal } = require('./turn-cancel');

const MAX_TOOL_ROUNDS = 6;
const MAX_TOOL_CALLS = 12;
const TOTAL_TIMEOUT_MS = 60000;

const HINT_LIMIT = '这轮查得有点多，先说到这儿。';
const HINT_TIMEOUT = '这轮想得太久，先说到这儿。';

// 跑一轮 agent loop。返回 { content, toolRounds, toolLog, messages, degraded?, reason? }
async function runAgentLoop({ db, userId, workflow, action, messages, idempotencyKey = null, tools: scopedTools, runTool, deepThinking = false, signal }) {
  const started = Date.now();
  const remainingTime = () => TOTAL_TIMEOUT_MS - (Date.now() - started);
  const deadline = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  const toolSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const tools = scopedTools ?? toolsFor(workflow);
  const convo = [...messages];
  const toolLog = [];
  let toolRounds = 0;
  let finalContent = '';

  function done(reason, hint, partial = '') {
    finalContent = [String(partial || '').trim(), hint].filter(Boolean).join('\n\n');
    convo.push({ role: 'assistant', content: finalContent });
    return {
      content: finalContent,
      toolRounds: Math.min(toolRounds, MAX_TOOL_ROUNDS),
      toolLog,
      messages: convo.map(({ reasoning_content, ...message }) => message),
      degraded: true,
      reason,
    };
  }

  for (;;) {
    ai.throwIfCancelled(signal);
    if (remainingTime() <= 0) {
      await recordCall(db, {
        userId, workflow, action, status: 'fail',
        detail: JSON.stringify({ reason: 'total_timeout', toolRounds, degraded: true }),
        idempotencyKey,
      });
      return done('total_timeout', HINT_TIMEOUT);
    }

    const resp = await ai.chat(db, {
      messages: convo,
      tools,
      workflow,
      action,
      userId,
      idempotencyKey,
      deepThinking,
      signal,
      maxTokens: deepThinking === true ? 8192 : 1200,
      // 单次模型调用留 45s，给 loop 总超时留余量
      timeoutMs: Math.min(45000, remainingTime()),
    });
    ai.throwIfCancelled(signal);

    const calls = resp.toolCalls || [];
    if (!calls.length) {
      finalContent = resp.content;
      convo.push({ role: 'assistant', content: resp.content });
      break;
    }

    toolRounds += 1;
    if (toolRounds > MAX_TOOL_ROUNDS) {
      await recordCall(db, {
        userId, workflow, action, status: 'fail',
        detail: JSON.stringify({ reason: 'max_tool_rounds', limit: MAX_TOOL_ROUNDS, degraded: true }),
        idempotencyKey,
      });
      // 降级：不抛 500，把本轮已有内容 + 提示正常返回，该轮工具不再执行。
      return done('max_tool_rounds', HINT_LIMIT, resp.content);
    }

    // assistant 消息必须原样回填（OpenAI 格式要求 tool 结果跟在带 tool_calls 的 assistant 消息后）
    const assistantMessage = { role: 'assistant', content: resp.content || '', tool_calls: calls };
    if (deepThinking === true) assistantMessage.reasoning_content = resp.reasoningContent;
    convo.push(assistantMessage);

    if (toolLog.length + calls.length > MAX_TOOL_CALLS) {
      await recordCall(db, {
        userId, workflow, action, status: 'fail',
        detail: JSON.stringify({ reason: 'max_tool_calls', limit: MAX_TOOL_CALLS, degraded: true }),
        idempotencyKey,
      });
      return done('max_tool_calls', HINT_LIMIT, resp.content);
    }
    for (const call of calls) {
      const remainingMs = remainingTime();
      if (remainingMs <= 0) {
        await recordCall(db, {
          userId, workflow, action, status: 'fail',
          detail: JSON.stringify({ reason: 'total_timeout', toolRounds, degraded: true }),
          idempotencyKey,
        });
        return done('total_timeout', HINT_TIMEOUT, resp.content);
      }
      const fn = call.function || {};
      let parsedArgs;
      try {
        if (typeof fn.arguments === 'string' && fn.arguments.length <= 8000) parsedArgs = JSON.parse(fn.arguments);
      } catch { /* Reject malformed model arguments below. */ }
      const validArgs = parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs);
      let result = { ok: false, error: '工具参数必须是 JSON 对象' };
      if (validArgs) {
        try {
          result = await runWithSignal(toolSignal, () => (runTool
            ? runTool(fn.name, parsedArgs, remainingMs, toolSignal)
            : executeTool(db, workflow, userId, fn.name, parsedArgs)));
        } catch (error) {
          ai.throwIfCancelled(signal);
          if (deadline.aborted) {
            await recordCall(db, {
              userId, workflow, action, status: 'fail',
              detail: JSON.stringify({ reason: 'total_timeout', toolRounds, degraded: true }),
              idempotencyKey,
            });
            return done('total_timeout', HINT_TIMEOUT, resp.content);
          }
          throw error;
        }
      }
      ai.throwIfCancelled(signal);
      toolLog.push({ name: fn.name, args: parsedArgs, result });
      const serialized = JSON.stringify(result);
      convo.push({
        role: 'tool',
        tool_call_id: call.id,
        content: serialized && serialized.length <= 4000 ? serialized : JSON.stringify({ ok: false, error: '工具结果超出大小限制' }),
      });
    }
  }

  return {
    content: finalContent,
    toolRounds,
    toolLog,
    messages: convo.map(({ reasoning_content, ...message }) => message),
  };
}

module.exports = { runAgentLoop, MAX_TOOL_ROUNDS, MAX_TOOL_CALLS, TOTAL_TIMEOUT_MS };
