const VENUE_GOAL = /场地|交换会|分享会|见面会|聚会|工作坊|线下|workshop|meetup/i;
const ONLINE_GOAL = /线上|在线|online|virtual/i;

const EXPLORATION = [
  {
    id: 'explore',
    title: '写下一个现在能做的动作',
    doneWhen: '围绕这个目标，写下一个五分钟内能开始的动作和所需的一项准备。',
    maxMinutes: 5,
  },
];

const VENUE_PLAN = [
  {
    id: 'venue',
    title: '确认场地与可用时段',
    doneWhen: '记录场地联系人确认的可用时段与使用条件。尚未收到回复时，保留为未完成。',
    maxMinutes: 20,
  },
  {
    id: 'notice',
    title: '起草并核对活动通知',
    doneWhen: '按已确认的场地和时段写好通知，核对时间、地点和参与方式。',
    maxMinutes: 20,
  },
  {
    id: 'publish',
    title: '发布通知并记录发布位置',
    doneWhen: '将核对后的通知发给参与者，保存发布位置或发送记录。',
    maxMinutes: 15,
  },
];

const DELIVERABLE_PLAN = [
  {
    id: 'criteria',
    title: '明确首个可交付成果',
    doneWhen: '用一句话写清本周要交付的一项小成果，并列出一个可以检查的完成标准。',
    maxMinutes: 15,
  },
  {
    id: 'draft',
    title: '完成可检查的小样',
    doneWhen: '做出一小部分可检查的成果，例如提纲、草图或最小示例，并保留该版本。',
    maxMinutes: 25,
  },
  {
    id: 'review',
    title: '检查小样并记录下一步',
    doneWhen: '对照完成标准，记下已满足的要求和接下来要补做的一项工作。',
    maxMinutes: 15,
  },
];

function stageTemplate(goal, weeklyMinutes) {
  if (weeklyMinutes < 15) return EXPLORATION;
  return VENUE_GOAL.test(goal) && !ONLINE_GOAL.test(goal) ? VENUE_PLAN : DELIVERABLE_PLAN;
}

function makeStageSteps(goal, weeklyMinutes) {
  const template = stageTemplate(goal, weeklyMinutes);
  let remaining = weeklyMinutes;
  return template.map(({ id, title, doneWhen, maxMinutes }, index) => {
    const stepsLeft = template.length - index;
    const minutes = Math.min(maxMinutes, Math.ceil(remaining / stepsLeft));
    remaining -= minutes;
    return {
      id,
      title,
      doneWhen,
      minutes,
      dependsOn: index === 0 ? [] : [template[index - 1].id],
      next: index === 0,
    };
  });
}

function makeDailyProposal(goal, weeklyMinutes) {
  const title = goal.trim().replace(/\s+/g, ' ');
  const frequency = Math.max(1, Math.min(4, Math.floor(weeklyMinutes / 10)));
  const sessionMinutes = Math.min(30, Math.floor(weeklyMinutes / frequency));
  return {
    question: null,
    frequency,
    sessionMinutes,
    steps: [{
      id: 'habit',
      title: title.length <= 30 ? title : `${title.slice(0, 29).replace(/[\uD800-\uDBFF]$/, '')}…`,
      doneWhen: `围绕目标实际做满 ${sessionMinutes} 分钟，并打卡记下一项做过的事。`,
      minutes: sessionMinutes,
      dependsOn: [],
      next: true,
    }],
  };
}

function makeProposal({ goal, kind, weeklyMinutes }) {
  if (weeklyMinutes == null) {
    return { question: '接下来一周，你大概能为这个目标留出多少分钟？', steps: [] };
  }

  if (kind === 'daily') return makeDailyProposal(goal, weeklyMinutes);
  return { question: null, steps: makeStageSteps(goal, weeklyMinutes) };
}

function hasText(value, maxLength) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= maxLength;
}

function matchesChain(steps, template) {
  if (steps.length !== template.length) return false;

  return steps.every((step, index) => {
    if (step.id !== template[index].id || step.next !== (index === 0)) return false;
    if (index === 0) return step.dependsOn.length === 0;
    return step.dependsOn.length === 1 && step.dependsOn[0] === template[index - 1].id;
  });
}

function validateProposal(proposal, { goal, kind, weeklyMinutes }) {
  if (kind !== 'stage' && kind !== 'daily') return false;
  if (!proposal || !Array.isArray(proposal.steps)) return false;
  const { question, steps, frequency, sessionMinutes } = proposal;

  if (weeklyMinutes == null) {
    return hasText(question, 200) && steps.length === 0 && frequency == null && sessionMinutes == null;
  }
  if (!Number.isSafeInteger(weeklyMinutes) || weeklyMinutes < 5 || question !== null) return false;
  if (steps.length === 0 || steps.length > 3) return false;

  for (const step of steps) {
    if (!step || !hasText(step.title, 30) || !hasText(step.doneWhen, 500)) return false;
    if (!Number.isSafeInteger(step.minutes) || step.minutes < 1 || !Array.isArray(step.dependsOn)) return false;
  }

  if (kind === 'daily') {
    if (!Number.isInteger(frequency) || frequency < 1 || frequency > 4) return false;
    if (!Number.isInteger(sessionMinutes) || sessionMinutes < 1 || sessionMinutes > 1440) return false;
    return sessionMinutes * frequency <= weeklyMinutes && steps[0].minutes === sessionMinutes
      && matchesChain(steps, [{ id: 'habit' }]);
  }

  if (frequency != null || sessionMinutes != null) return false;
  if (steps.reduce((total, step) => total + step.minutes, 0) > weeklyMinutes) return false;
  return matchesChain(steps, stageTemplate(goal, weeklyMinutes));
}

module.exports = { makeProposal, validateProposal };
