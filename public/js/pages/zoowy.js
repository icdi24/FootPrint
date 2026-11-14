// zoowy 聊天弹层（融合 v2）：常驻问答 + 提议卡片 + 草案确认 + 停止本轮。
// 会话、任务编号与提议/草案确认全部走 /api/zoowy/*；Key 录入、图片、
// 摘要上下文 / 深度思考 / 智能搜索均不提供（第二批）。
const ZoowyChat = {
  views: new Set(),
  reset() {
    for (const body of this.views) body.remove();
    this.views.clear();
    window.ZoowyFloat?.close();
  },
  open({ bigGoalId = null, title = 'zoowy', onApplied, surface } = {}) {
    const generation = api.generation;
    const body = UI.el(`
      <div class="zc-body">
        <div class="zc-toolbar">
          ${bigGoalId ? '<span>正在围绕这个大目标聊</span>' : '<span>目标、进展与计划都可以聊</span>'}
          <button class="btn outline" type="button" data-stop disabled>停止本轮</button>
          <button class="btn outline" type="button" data-clear>清空聊天</button>
        </div>
        <div class="zc-list" role="log" aria-label="聊天记录"><div class="zc-empty">加载中…</div></div>
        <div class="zc-error" role="alert" hidden></div>
        <div class="zc-operation-status" role="status" hidden></div>
        <form class="zc-composer">
          <div class="zc-input-row">
            <textarea rows="1" maxlength="2000" aria-label="消息" placeholder="聊聊你的目标或近况"></textarea>
            <button class="btn primary" type="submit">发送</button>
          </div>
        </form>
      </div>`);
    const list = body.querySelector('.zc-list');
    const form = body.querySelector('form');
    const input = form.querySelector('textarea');
    const stopButton = body.querySelector('[data-stop]');
    const error = body.querySelector('.zc-error');
    const operationStatus = body.querySelector('.zc-operation-status');
    for (const view of ZoowyChat.views) if (!view.isConnected) ZoowyChat.views.delete(view);
    ZoowyChat.views.add(body);
    const current = () => generation === api.generation && body.isConnected;

    let messages = [];
    let busy = false;
    let loaded = false;
    let activeOperation = null;

    // 聊天响应里 profileChanges 是对象数组，历史消息里是摘要字符串数组；统一成字符串。
    function profileSummaries(m) {
      const arr = Array.isArray(m && m.profileChanges) ? m.profileChanges : [];
      return arr.map((p) => (typeof p === 'string' ? p : (p && typeof p.summary === 'string' ? p.summary : ''))).filter(Boolean);
    }

    function toolNames(m) {
      const arr = Array.isArray(m && m.tools) ? m.tools : (Array.isArray(m && m.toolCalls) ? m.toolCalls : []);
      return arr.map((t) => (typeof t === 'string' ? t : (t && (t.name || t.summary) || ''))).filter(Boolean);
    }

    function assistantFromResponse(r) {
      return {
        role: 'assistant',
        content: r.reply || '',
        tools: Array.isArray(r.toolCalls) ? r.toolCalls : [],
        profileChanges: profileSummaries(r),
        failed: !!r.failed,
        degraded: !!r.degraded,
        reason: r.reason || '',
        cards: Array.isArray(r.cards) ? r.cards : [],
        report: r.report || null,
      };
    }

    function render(pending = '') {
      if (!current()) return;
      // 已被同意的提议：结果卡片（plan_draft / profile_applied）带 offerId。
      const offers = new Set();
      // 同一草案只展示最新版本，避免旧版本的「应用这版」还能点。
      const drafts = new Map();
      for (const m of messages) {
        for (const card of m.cards || []) {
          if (card.offerId != null && ['plan_draft', 'profile_applied', 'goal_applied'].includes(card.type)) {
            offers.add(String(card.offerId));
          }
          if (card.type !== 'plan_draft' || !card.draft) continue;
          const id = String(card.draft.id);
          const latest = drafts.get(id);
          if (!latest || card.draft.revision > latest.draft.revision ||
              (card.draft.revision === latest.draft.revision && latest.draft.status !== 'applied')) {
            drafts.set(id, card);
          }
        }
      }

      const actions = [];
      function actionButton(label, action) {
        const i = actions.push(action) - 1;
        return `<button class="btn outline" type="button" data-card-action="${i}" ${busy ? 'disabled' : ''}>${label}</button>`;
      }

      function cardView(card) {
        if (['plan_offer', 'profile_offer', 'goal_offer'].includes(card.type) && card.id != null) {
          const accepted = offers.has(String(card.id)) || card.status === 'accepted';
          const profile = card.type === 'profile_offer';
          const goal = card.type === 'goal_offer';
          const label = profile ? '画像提议' : goal ? '目标变更' : '规划提议';
          const button = profile ? '同意更新画像' : goal ? '确认创建' : '同意出草案';
          const preview = Array.isArray(card.preview) ? card.preview : [];
          return `<section class="zc-card" aria-label="${label}"><strong>${label}</strong>
            <p>${UI.esc(card.summary)}</p>
            ${preview.map((p) => `<div class="zc-detail"><b>${UI.esc(p.label)}</b>
              <p>修改前：${UI.esc(p.before || '无')}</p><p>修改后：${UI.esc(p.after || '无')}</p>
              ${p.reason ? `<p>原因：${UI.esc(p.reason)}</p>` : ''}${p.evidence ? `<p>依据：${UI.esc(p.evidence)}</p>` : ''}</div>`).join('')}
            ${accepted ? '<p class="zc-detail">已同意</p>' : actionButton(button, {
              type: 'offer', id: card.id, revision: card.revision, profile, goal, modelWork: !profile && card.modelWork !== false,
            })}
          </section>`;
        }
        if (card.type === 'profile_applied' || card.type === 'goal_applied') {
          return `<section class="zc-card"><strong>${card.type === 'goal_applied' ? '目标已更新' : '画像已更新'}</strong>
            <p>${UI.esc(card.summary)}</p>
          </section>`;
        }
        if (card.type !== 'plan_draft' || !card.draft) return '';
        const d = card.draft;
        if (drafts.get(String(d.id)) !== card) return '';
        const steps = Array.isArray(d.steps) ? d.steps : [];
        const titles = new Map(steps.map((s) => [s.id, s.title]));
        const changes = Array.isArray(d.replan && d.replan.changes) ? d.replan.changes : [];
        const resultLabel = d.status === 'applied' ? (d.replan ? '目标已更新' : '已应用到目标') : '规划草案';
        const confirm = d.status === 'ready' && d.id != null && Number.isInteger(d.revision)
          ? actionButton('应用这版', { type: 'draft', id: d.id, revision: d.revision }) : '';
        return `<section class="zc-card" aria-label="${resultLabel}"><strong>${resultLabel}</strong>
          <p>${UI.esc(d.goal)}</p>
          ${Number.isFinite(d.weeklyMinutes) ? `<p class="zc-detail">每周可用 ${UI.esc(d.weeklyMinutes)} 分钟</p>` : ''}
          ${typeof d.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.deadline) ? `<p class="zc-detail">截止日期 ${UI.esc(d.deadline)}</p>` : ''}
          ${d.frequency && d.sessionMinutes ? `<p class="zc-detail">每周 ${UI.esc(d.frequency)} 次，每次 ${UI.esc(d.sessionMinutes)} 分钟</p>` : ''}
          ${d.question ? `<p>${UI.esc(d.question)}</p>` : ''}
          ${changes.length ? `<p class="zc-detail">计划日期调整</p><ul>${changes.map((change) => `<li>
            <b>${UI.esc(change.title)}</b><p>${UI.esc(change.from || '未安排')} → ${UI.esc(change.to)}</p>
          </li>`).join('')}</ul>` : ''}
          ${!changes.length && steps.length ? `<ol>${steps.map((step) => `<li>
            <b>${UI.esc(step.title)}</b>${step.minutes != null ? ` · 约 ${UI.esc(step.minutes)} 分钟` : ''}
            ${step.next ? '<span class="zc-next">下一步</span>' : ''}
            <p>${UI.esc(step.doneWhen)}</p>
            ${step.dependsOn && step.dependsOn.length ? `<p class="zc-detail">前置：${UI.esc(step.dependsOn.map((id) => titles.get(id) || id).join('、'))}</p>` : ''}
          </li>`).join('')}</ol>` : ''}
          ${confirm}
        </section>`;
      }

      function metaView(m) {
        const tools = toolNames(m);
        const changes = profileSummaries(m);
        return [
          tools.length ? `<div class="zc-tools">🔧 用了：${tools.map(UI.esc).join('、')}</div>` : '',
          changes.length ? `<div class="zc-profile">📝 更新了画像：${changes.map(UI.esc).join('；')}</div>` : '',
          m.degraded ? `<div class="zc-degraded">⚠️ 上下文已精简，回复可能不够完整${m.reason ? `（${UI.esc(m.reason)}）` : ''}</div>` : '',
          m.failed ? '<div class="zc-failed">⚠️ 本轮未完成，可以再问一次</div>' : '',
          m.report ? `<details class="zc-detail"><summary>本轮运行详情</summary>
            <p>状态：${UI.esc(m.report.state)} · 耗时 ${UI.esc(Math.round((m.report.durationMs || 0) / 1000))} 秒 · 模型调用 ${UI.esc(m.report.modelCalls || 0)} 次</p>
            <p>${m.report.usageReported ? `已报告用量 ${UI.esc(m.report.totalTokens || 0)} token` : '模型未提供用量'}</p>
            ${(m.report.tools || []).map((t) => `<p>${UI.esc(t.name)} · ${UI.esc(t.status)} ${UI.esc(t.reason || '')}</p>`).join('')}
            ${(m.report.committedChanges || []).map((c) => `<p>已提交：${UI.esc(c.summary || '')}</p>`).join('')}
            ${m.report.reason ? `<p>${UI.esc(m.report.reason)}</p>` : ''}</details>` : '',
        ].join('');
      }

      list.innerHTML = messages.map((m) => {
        const own = m.role === 'user';
        return `<div class="zc-msg ${own ? 'me' : 'ai'}">
          ${own ? '' : '<div class="zc-avatar" aria-hidden="true">🐾</div>'}
          <div class="zc-text">${UI.esc(m.content)}${(m.cards || []).map(cardView).join('')}${own ? '' : metaView(m)}</div>
        </div>`;
      }).join('') || '<div class="zc-empty">还没聊过。你可以聊聊近况，或说说想推进的目标。</div>';
      if (pending) {
        const status = document.createElement('div');
        status.className = 'zc-empty';
        status.setAttribute('role', 'status');
        status.textContent = pending;
        list.appendChild(status);
      }
      list.querySelectorAll('[data-card-action]').forEach((button) => {
        button.addEventListener('click', () => applyCard(actions[Number(button.dataset.cardAction)]));
      });
      list.scrollTop = list.scrollHeight;
    }

    function setError(message = '') {
      error.hidden = !message;
      error.textContent = message;
    }

    function setStatus(message = '') {
      operationStatus.hidden = !message;
      operationStatus.textContent = message;
    }

    function syncControls() {
      body.querySelectorAll('button, textarea').forEach((el) => {
        el.disabled = busy || (!loaded && el.closest('form') != null);
      });
      stopButton.disabled = !activeOperation || activeOperation.stopping || activeOperation.cancelled;
    }

    // requestId 非空时这一轮可被「停止本轮」取消（服务端按编号中断任务）。
    // 本项目 api.post 只收 (url, body)，客户端不做 fetch abort，靠服务端中断 + 409 收尾。
    async function run(pending, fn, requestId = null) {
      if (busy || !current()) return;
      busy = true;
      const operation = requestId ? { requestId, stopping: false, cancelled: false } : null;
      activeOperation = operation;
      setError();
      setStatus();
      render(pending);
      syncControls();
      try { await fn(operation); }
      catch (e) {
        if (!current()) return;
        const stopped = operation && (operation.cancelled || e.code === 'turn_cancelled' ||
          (e.status === 409 && /停止/.test(e.message)));
        if (stopped) {
          setError();
          setStatus('已停止本轮。');
        } else if (operation && (!e.status || e.code === 'outcome_unknown')) {
          try {
            const status = await api.get(`/api/zoowy/turns/${encodeURIComponent(operation.requestId)}`);
            if (!current()) return;
            if (status.state === 'done' && status.result) {
              if (status.result.reply !== undefined) messages.push(assistantFromResponse(status.result));
              else if (status.result.card || status.result.type) messages.push({ role: 'assistant', content: '', cards: [status.result.card || status.result], report: status.report });
              setStatus('已取回本轮结果。');
            } else setError('本轮结果尚未确认，请稍后重新打开聊天查看。');
          } catch (_) { if (current()) setError('本轮结果尚未确认，请稍后重新打开聊天查看。'); }
        } else setError(e.message);
      }
      finally {
        activeOperation = null;
        busy = false;
        render();
        syncControls();
      }
    }

    async function applyCard(action) {
      if (!action || busy) return;
      const pending = action.type === 'draft' ? '正在应用这版…' : (action.profile ? '正在更新画像…' : action.goal ? '正在确认目标…' : 'zoowy 正在准备草案…');
      const requestId = action.type === 'offer' ? ZoowyChat.newRequestId() : null;
      await run(pending, async (operation) => {
        const id = encodeURIComponent(action.id);
        const r = action.type === 'offer'
          ? await api.post(`/api/zoowy/offers/${id}/accept`, { requestId, revision: action.revision })
          : await api.post(`/api/zoowy/drafts/${id}/confirm`, { revision: action.revision });
        if (!current() || (operation && operation.cancelled)) return;
        if (!r || !r.card) throw new Error('服务没有返回操作状态，请重新打开聊天查看');
        messages.push({ role: 'assistant', content: '', cards: [r.card] });
        if (r.card.type === 'profile_applied') UI.toast('画像已更新', 'ok');
        if (r.card.type === 'goal_applied' || (r.card.draft && r.card.draft.status === 'applied')) {
          UI.toast('已应用到目标', 'ok');
          onApplied && onApplied();
        }
      }, action.type === 'offer' && action.modelWork ? requestId : null);
    }

    async function send(event) {
      if (event) event.preventDefault();
      if (!loaded || busy) return;
      const message = input.value.trim();
      if (!message) return;
      const requestId = ZoowyChat.newRequestId();
      messages.push({ role: 'user', content: message });
      input.value = '';
      await run('zoowy 正在回复…', async (operation) => {
        const r = await api.post('/api/zoowy/chat', {
          message,
          requestId,
          big_goal_id: bigGoalId || undefined,
        });
        if (!current() || (operation && operation.cancelled)) return;
        if (!r) throw new Error('服务没有返回内容');
        messages.push(assistantFromResponse(r));
      }, requestId);
      input.focus();
    }

    stopButton.addEventListener('click', async () => {
      const operation = activeOperation;
      if (!operation || operation.stopping || operation.cancelled) return;
      operation.stopping = true;
      syncControls();
      try {
        const r = await api.post(`/api/zoowy/turns/${encodeURIComponent(operation.requestId)}/cancel`, {});
        if (!current() || activeOperation !== operation) return;
        let state = r?.state;
        setStatus('正在停止，请等待服务端确认…');
        for (let i = 0; i < 120 && ['running', 'cancelling'].includes(state); i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (!current() || activeOperation !== operation) return;
          const status = await api.get(`/api/zoowy/turns/${encodeURIComponent(operation.requestId)}`);
          state = status.state;
        }
        operation.cancelled = state === 'cancelled';
        setStatus(state === 'cancelled' ? '已停止本轮，已提交的变更保留在记录中。' : state === 'done' ? '本轮已完成，可查看结果。' : ['failed', 'expired'].includes(state) ? '本轮已结束，可查看运行详情。' : '停止结果尚未确认，请稍后查看。');
      } catch (e) {
        if (activeOperation === operation) setError(e.message);
      } finally {
        operation.stopping = false;
        syncControls();
      }
    });

    form.addEventListener('submit', send);
    body.querySelector('[data-clear]').addEventListener('click', async () => {
      if (busy || !current()) return;
      const yes = await UI.confirm('清空本人 AI 聊天与摘要？未确认提议会失效，已确认目标和画像仍保留。', { okLabel: '清空聊天' });
      if (!yes || !current()) return;
      await run('正在清空聊天…', async () => {
        await api.delete('/api/zoowy/history');
        if (!current()) return;
        api.clearHistoryViews();
        ZoowyChat.open({ bigGoalId, title, onApplied, surface });
      });
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        send();
      }
    });
    // surface:'floating' 时换成右下角悬浮窗（ZoowyFloat），其余入口仍走底部 sheet
    if (surface === 'floating' && window.ZoowyFloat) window.ZoowyFloat.mount(body, title);
    else UI.sheet({ title: UI.esc(title), body, actions: [{ label: '关闭' }] });
    run('正在加载聊天记录…', async () => {
      const d = await api.get('/api/zoowy/messages?limit=40');
      if (!current()) return;
      messages = (d && d.messages) || [];
      loaded = true;
    });
  },

  newRequestId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  },
};
window.addEventListener('footprint:auth-change', () => ZoowyChat.reset());
window.addEventListener('footprint:history-cleared', () => ZoowyChat.reset());
