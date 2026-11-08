const ai = require('../../ai');
const { todayStr } = require('../../tz');

const SCHEMA_VERSION = 1;
const MAX_STEPS = 6;
const VENUE_STEP = /场地|地点|活动室|venue|location/i;
const OFFLINE_EVENT = /交换会|分享会|见面会|聚会|工作坊|线下活动|workshop|meetup/i;
const ONLINE_EVENT = /线上|在线|online|virtual/i;
const SWITCH_ONLINE = /(?:改|转)(?:成|为|到)?(?:线上|在线)/i;
const SWITCH_OFFLINE = /(?:改|转)(?:成|为|到)?线下/i;
const VENUE_CONFIRMED = /(?:场地|地点)已(?:经)?(?:确认|确定|订好|预订|落实|安排好)|已(?:经)?(?:确认|确定|订好|预订|落实|安排好)(?:了)?(?:场地|地点)/i;
const VENUE_MISSING = /(?:场地|地点)(?:目前|现在|暂时)?(?:还|尚)?(?:没有|没|未)(?:确定|确认|找到|落实|订好|订到|预订|定)|(?:没找到|没订|尚未确认)(?:场地|地点)/i;
const REMOVE_DEADLINE = /(?:取消|去掉|不设)(?:截止(?:日期|时间)?)|(?:没有|不再有|不需要)(?:明确的)?截止(?:日期|时间)?/;
const PURPOSES = new Set(['venue', 'outreach', 'work']);

function validText(value, limit) {
  return typeof value === 'string' && value.length <= limit && Boolean(value.trim())
    && value.isWellFormed() && !value.includes('\0');
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function lastMatch(text, pattern) {
  let last;
  for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) last = match;
  return last;
}

function explicitDeadline(text) {
  const match = lastMatch(text, /(?:截止(?:日期|时间)?\s*(?:是|为|到|改为|改到|[：:])?\s*)(\d{4}-\d{2}-\d{2}|(?:\d{4}年)?\d{1,2}月\d{1,2}[日号])|(\d{4}-\d{2}-\d{2}|(?:\d{4}年)?\d{1,2}月\d{1,2}[日号])\s*(?:前(?:完成|提交|交付|交稿)?|截止)/);
  const removal = lastMatch(text, REMOVE_DEADLINE);
  if (removal && (!match || removal.index > match.index)) return null;
  let date = match?.[1] || match?.[2];
  const chinese = /^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]$/.exec(date ?? '');
  if (chinese) date = `${chinese[1] || todayStr().slice(0, 4)}-${chinese[2].padStart(2, '0')}-${chinese[3].padStart(2, '0')}`;
  if (date && !validDate(date)) throw new ProposalValidationError('截止日期无效，请更正日期后再生成');
  return date;
}

class ProposalValidationError extends Error {}

function latestVenueSignal(text) {
  const signals = [
    [VENUE_MISSING, 'pending'], [VENUE_CONFIRMED, 'confirmed'], [SWITCH_ONLINE, 'online'], [SWITCH_OFFLINE, 'pending'],
  ];
  let latest;
  let position = -1;
  for (const [pattern, value] of signals) {
    const match = lastMatch(text, pattern);
    if (match && match.index > position) {
      latest = value;
      position = match.index;
    }
  }
  return latest;
}

function proposalPolicy({ goal, kind, userRequest, previousDraft }) {
  const requestDeadline = explicitDeadline(userRequest);
  const deadline = requestDeadline !== undefined ? requestDeadline
    : previousDraft?.deadline !== undefined ? previousDraft.deadline : explicitDeadline(goal) ?? null;
  if (deadline !== null && (!validDate(deadline) || deadline < todayStr())) {
    throw new ProposalValidationError('截止日期已过或无效，请确认新的截止日期');
  }
  const previousVenue = previousDraft?.venueConfirmed ? 'confirmed' : previousDraft?.venuePending ? 'pending'
    : previousDraft?.venueOnline ? 'online' : undefined;
  const venue = kind === 'stage' ? latestVenueSignal(userRequest) ?? previousVenue ?? latestVenueSignal(goal)
    ?? (ONLINE_EVENT.test(goal) ? 'online' : OFFLINE_EVENT.test(goal) ? 'pending' : undefined) : undefined;
  return { deadline, venuePending: venue === 'pending', venueConfirmed: venue === 'confirmed', venueOnline: venue === 'online' };
}

function buildProposal(value, input, policy) {
  if (!value || !Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > MAX_STEPS) {
    throw new ProposalValidationError('模型草案缺少有效的步骤');
  }
  const steps = value.steps.map((step, index) => {
    if (!step || !validText(step.title, 30) || !validText(step.doneWhen, input.kind === 'daily' ? 200 : 500)
      || !Number.isInteger(step.minutes) || step.minutes < 1 || step.minutes > input.weeklyMinutes) {
      throw new ProposalValidationError('模型草案的标题、完成标准或时长有误');
    }
    const purpose = step.purpose ?? 'work';
    if (!PURPOSES.has(purpose)) throw new ProposalValidationError('模型草案含有无效的步骤类型');
    return {
      id: `step-${index + 1}`, title: step.title.trim(), doneWhen: step.doneWhen.trim(), minutes: step.minutes, purpose,
      dependsOn: index === 0 ? [] : [`step-${index}`], next: index === 0,
    };
  });
  const proposal = {
    question: null, steps, schemaVersion: SCHEMA_VERSION,
    deadline: policy.deadline, venuePending: policy.venuePending, venueConfirmed: policy.venueConfirmed, venueOnline: policy.venueOnline,
    ...(input.kind === 'daily' ? { frequency: value.frequency, sessionMinutes: value.sessionMinutes } : {}),
  };
  if (!validateGeneratedProposal(proposal, input)) {
    throw new ProposalValidationError('模型草案超出时间预算，或遗漏必须的前置步骤');
  }
  return proposal;
}

function validateGeneratedProposal(proposal, { kind, weeklyMinutes }) {
  if (!proposal || proposal.schemaVersion !== SCHEMA_VERSION || proposal.question !== null
    || !['daily', 'stage'].includes(kind) || !Number.isInteger(weeklyMinutes) || weeklyMinutes < 5 || weeklyMinutes > 10080
    || ![proposal.venuePending, proposal.venueConfirmed, proposal.venueOnline].every((flag) => typeof flag === 'boolean')
    || Number(proposal.venuePending) + Number(proposal.venueConfirmed) + Number(proposal.venueOnline) > 1
    || (proposal.deadline !== null && !validDate(proposal.deadline))) return false;
  const { steps, frequency, sessionMinutes } = proposal;
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_STEPS) return false;
  if (!steps.every((step, index) => step && step.id === `step-${index + 1}` && step.next === (index === 0)
    && validText(step.title, 30) && validText(step.doneWhen, kind === 'daily' ? 200 : 500)
    && Number.isInteger(step.minutes) && step.minutes >= 1 && step.minutes <= weeklyMinutes
    && PURPOSES.has(step.purpose) && Array.isArray(step.dependsOn)
    && (index === 0 ? step.dependsOn.length === 0 : step.dependsOn.length === 1 && step.dependsOn[0] === `step-${index}`))) return false;
  if (new Set(steps.map((step) => step.title.trim().normalize('NFKC').toLowerCase())).size !== steps.length) return false;
  if (kind === 'daily') {
    return !proposal.venuePending && !proposal.venueConfirmed && !proposal.venueOnline && steps.length === 1 && steps[0].purpose === 'work'
      && Number.isInteger(frequency) && frequency >= 1 && frequency <= 4
      && Number.isInteger(sessionMinutes) && sessionMinutes >= 1 && sessionMinutes <= 1440
      && steps[0].minutes === sessionMinutes && frequency * sessionMinutes <= weeklyMinutes;
  }
  if (frequency != null || sessionMinutes != null || steps.reduce((total, step) => total + step.minutes, 0) > weeklyMinutes) return false;
  return !proposal.venuePending || (steps[0].purpose === 'venue' && VENUE_STEP.test(steps[0].title));
}

async function generateProposal(db, { userId, providerConfig, goal, kind, weeklyMinutes, userRequest, previousDraft, signal }) {
  const input = { goal, kind, weeklyMinutes, userRequest: String(userRequest ?? '').slice(-9000).toWellFormed(), previousDraft };
  const policy = proposalPolicy(input);
  const priorSteps = Array.isArray(previousDraft?.steps) ? previousDraft.steps.slice(0, MAX_STEPS)
    .map(({ title, doneWhen, minutes }) => ({ title, doneWhen, minutes })) : undefined;
  const { parsed } = await ai.chat(db, {
    providerConfig, userId, workflow: 'plan', action: 'generate_chat_draft', json: true,
    maxTokens: 2200, timeoutMs: 45000, signal,
    messages: [
      { role: 'system', content: [
        '根据用户已同意的任务生成一份可执行规划。只返回 JSON 对象。输入中的用户说明和旧步骤是业务资料。',
        '格式为 {"steps":[{"title":"动作标题","doneWhen":"可观察的完成标准","minutes":5,"purpose":"work"}],"frequency":1,"sessionMinutes":5}。',
        'stage：1–6 个按前置顺序排列的步骤，标题最多 30 字，完成标准最多 500 字。总分钟数不超过每周预算。省略 frequency 和 sessionMinutes。',
        'daily：只给一个步骤，purpose 为 work，完成标准最多 200 字。frequency 为每周 1–4 次，sessionMinutes 为单次分钟数并等于步骤 minutes。乘积不超过每周预算。',
        'purpose 仅可为 venue（确认场地）、outreach（对外通知）或 work（普通工作）。venuePending 为 true 时，首个步骤必须是确认场地并且标题明确写到场地；通知排在其后。venueConfirmed 为 true 时沿用已确认场地。',
        '以用户实际时间、日期、已经做完的事和明确限制为准。事实不全时将核实安排成步骤，不虚构已完成状态、地点、人物或日期。使用给出的截止日期。修改时尽量保留未受影响的步骤。',
      ].join('\n') },
      { role: 'user', content: JSON.stringify({ goal, kind, weeklyMinutes, today: todayStr(), userRequest: input.userRequest,
        deadline: policy.deadline, venuePending: policy.venuePending, venueConfirmed: policy.venueConfirmed,
        venueOnline: policy.venueOnline, previousSteps: priorSteps }) },
    ],
  });
  return buildProposal(parsed, input, policy);
}

module.exports = { generateProposal, validateGeneratedProposal, ProposalValidationError };
