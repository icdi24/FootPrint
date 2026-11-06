// agent/gateway.js —— zoowy 统一网关（P0-4）
// 一个网关 + 4 个专业工作流（plan/progress/daily/chat），不搞多个独立 agent。
// 网关只负责三件事：
//  1. loop 控制：单次工作流最多 6 轮工具调用、总超时 60s，超了中断并记失败原因
//  2. 白名单执行：模型要的工具必须在 WHITELIST[workflow] 内，userId 由服务端注入
//  3. ai_calls 记账：模型调用在 ai.js 里记，网关中断/失败在这里补记
const ai = require('../ai');
const { toolsFor, executeTool } = require('./tools');
const { recordCall } = require('../ai');
const { nowIso } = require('../tz');

const MAX_TOOL_ROUNDS = 6;
const TOTAL_TIMEOUT_MS = 60000;

// 跑一轮 agent loop。messages 需含 system 提示词；返回 { content, toolRounds, toolLog, messages }
async function runAgentLoop({ db, userId, workflow, action, messages, idempotencyKey = null }) {
  const started = Date.now();
  const tools = toolsFor(workflow);
  const convo = [...messages];
  const toolLog = [];
  let toolRounds = 0;
  let finalContent = '';

  for (;;) {
    // 总超时检查：超了中断并记失败原因
    if (Date.now() - started > TOTAL_TIMEOUT_MS) {
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
      // 单次模型调用留 45s，给 loop 总超时留余量
      timeoutMs: Math.min(45000, TOTAL_TIMEOUT_MS - (Date.now() - started) + 1000),
    });

    const calls = resp.toolCalls || [];
    if (!calls.length) {
      finalContent = resp.content;
      convo.push({ role: 'assistant', content: resp.content });
      break;
    }

    // assistant 消息必须原样回填（OpenAI 格式要求 tool 结果跟在带 tool_calls 的 assistant 消息后）
    convo.push({ role: 'assistant', content: resp.content || '', tool_calls: calls });
    toolRounds += 1;
    if (toolRounds > MAX_TOOL_ROUNDS) {
      await recordCall(db, {
        userId, workflow, action, status: 'fail',
        detail: JSON.stringify({ reason: 'max_tool_rounds', limit: MAX_TOOL_ROUNDS }),
        idempotencyKey,
      });
      throw new ai.AiError(`${workflow} 工作流工具调用超过 ${MAX_TOOL_ROUNDS} 轮上限，已中断`, { kind: 'loop_limit' });
    }

    for (const call of calls) {
      const fn = call.function || {};
      let parsedArgs = {};
      try { parsedArgs = fn.arguments ? JSON.parse(fn.arguments) : {}; } catch (e) { /* 空参继续 */ }
      const result = await executeTool(db, workflow, userId, fn.name, parsedArgs);
      toolLog.push({ name: fn.name, args: parsedArgs, result });
      convo.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 4000),
      });
    }
  }

  return { content: finalContent, toolRounds: toolRounds > MAX_TOOL_ROUNDS ? MAX_TOOL_ROUNDS : toolRounds, toolLog, messages: convo };
}

module.exports = { runAgentLoop, MAX_TOOL_ROUNDS, TOTAL_TIMEOUT_MS };
