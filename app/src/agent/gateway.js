// agent/gateway.js —— zoowy 统一网关（P0-4）
// 一个网关 + 4 个专业工作流（plan/progress/daily/chat），不搞多个独立 agent。
// 网关只负责三件事：
//  1. loop 控制：单次工作流最多 3 轮和 6 个工具调用，总超时 60 秒。
//  2. 白名单执行：模型要的工具必须在 WHITELIST[workflow] 内，userId 由服务端注入
//  3. ai_calls 记账：模型调用在 ai.js 里记，网关中断/失败在这里补记
const ai = require('../ai');
const { toolsFor, executeTool } = require('./tools');
const { recordCall } = require('../ai');
const { runWithSignal } = require('./turn-cancel');

const MAX_TOOL_ROUNDS = 3;
const TOTAL_TIMEOUT_MS = 60000;

// 跑一轮 agent loop。messages 需含 system 提示词；返回 { content, toolRounds, toolLog, messages }
async function runAgentLoop({ db, userId, workflow, action, messages, idempotencyKey = null, providerConfig, tools: scopedTools, runTool, deepThinking = false, signal }) {
  const started = Date.now();
  const remainingTime = () => TOTAL_TIMEOUT_MS - (Date.now() - started);
  const deadline = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  const toolSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const tools = scopedTools ?? toolsFor(workflow);
  const convo = [...messages];
  const toolLog = [];
  let toolRounds = 0;
  let finalContent = '';

  for (;;) {
    ai.throwIfCancelled(signal);
    // 总超时检查：超了中断并记失败原因
    if (remainingTime() <= 0) {
      await recordCall(db, {
        userId, workflow, action, status: 'fail',
        detail: JSON.stringify({ reason: 'total_timeout', toolRounds }),
        idempotencyKey,
      });
      throw new ai.AiError(`${workflow} 工作流总超时（${TOTAL_TIMEOUT_MS / 1000}s），已中断`, { kind: 'timeout' });
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
      ...(providerConfig !== undefined ? { providerConfig } : {}),
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

    // assistant 消息必须原样回填（OpenAI 格式要求 tool 结果跟在带 tool_calls 的 assistant 消息后）
    const assistantMessage = { role: 'assistant', content: resp.content || '', tool_calls: calls };
    if (deepThinking === true) assistantMessage.reasoning_content = resp.reasoningContent;
    convo.push(assistantMessage);
    toolRounds += 1;
    if (toolRounds > MAX_TOOL_ROUNDS) {
      await recordCall(db, {
        userId, workflow, action, status: 'fail',
        detail: JSON.stringify({ reason: 'max_tool_rounds', limit: MAX_TOOL_ROUNDS }),
        idempotencyKey,
      });
      throw new ai.AiError(`${workflow} 工作流工具调用超过 ${MAX_TOOL_ROUNDS} 轮上限，已中断`, { kind: 'loop_limit' });
    }

    if (toolLog.length + calls.length > 6) throw new ai.AiError('本次消息的工具请求过多', { kind: 'loop_limit' });
    for (const call of calls) {
      const remainingMs = remainingTime();
      if (remainingMs <= 0) throw new ai.AiError('本次消息处理超时，请稍后重试', { kind: 'timeout' });
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
          if (deadline.aborted) throw new ai.AiError('本次消息处理超时，请稍后重试', { kind: 'timeout' });
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

module.exports = { runAgentLoop, MAX_TOOL_ROUNDS, TOTAL_TIMEOUT_MS };
