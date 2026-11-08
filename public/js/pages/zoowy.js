const ZoowyChat = {
  open({ bigGoalId = null, title = 'zoowy', onApplied } = {}) {
    const body = UI.el(`
      <div class="zc-body">
        <div class="zc-toolbar">
          ${bigGoalId ? `<span>正在讨论：${UI.esc(title)}</span>` : '<span>目标、进展与计划都可以聊</span>'}
          <button class="ghost-btn" type="button" data-settings>设置</button>
        </div>
        <div class="zc-list" role="log" aria-label="聊天记录"><div class="zc-empty">加载中…</div></div>
        <div class="zc-error" role="alert" hidden></div>
        <div class="zc-operation-status" role="status" hidden></div>
        <div class="zc-attachment" hidden><span></span><button class="ghost-btn" type="button">移除</button></div>
        <form class="zc-composer">
          <div class="zc-modes" role="group" aria-label="聊天模式">
            <button class="btn outline" type="button" data-deep-thinking aria-pressed="false">深度思考</button>
            <button class="btn outline" type="button" data-smart-search aria-pressed="false">智能搜索</button>
            <button class="btn outline" type="button" data-compact disabled>摘要上下文</button>
            <button class="btn outline" type="button" data-stop disabled>停止运行</button>
          </div>
          <div class="zc-input-row">
            <input type="file" accept="image/png,image/jpeg,image/webp" data-file hidden />
            <button class="btn outline" type="button" data-image aria-label="添加截图或照片">图片</button>
            <textarea rows="1" maxlength="2000" aria-label="消息" placeholder="聊聊你的目标或近况"></textarea>
            <button class="btn primary" type="submit">发送</button>
          </div>
        </form>
      </div>`);
    const list = body.querySelector('.zc-list');
    const form = body.querySelector('form');
    const input = form.querySelector('textarea');
    const file = form.querySelector('[data-file]');
    const thinkingButton = form.querySelector('[data-deep-thinking]');
    const searchButton = form.querySelector('[data-smart-search]');
    const compactButton = form.querySelector('[data-compact]');
    const stopButton = form.querySelector('[data-stop]');
    const attachmentRow = body.querySelector('.zc-attachment');
    const error = body.querySelector('.zc-error');
    const operationStatus = body.querySelector('.zc-operation-status');
    let messages = [];
    let attachment = null;
    let lastRequest = null;
    let busy = false;
    let loaded = false;
    let activeOperation = null;

    function attachmentView() {
      attachmentRow.hidden = !attachment;
      attachmentRow.querySelector('span').textContent = attachment ? attachment.name : '';
    }

    function sourceView(sources) {
      if (!Array.isArray(sources)) return '';
      const entries = [];
      for (const source of sources.slice(0, 5)) {
        if (typeof source?.url !== 'string') continue;
        let url;
        try { url = new URL(source.url); } catch { continue; }
        if (url.protocol !== 'https:' || url.username || url.password) continue;
        const title = typeof source.title === 'string' && source.title.trim() ? source.title : url.hostname;
        const snippet = typeof source.snippet === 'string' ? source.snippet : '';
        entries.push(`<li><a href="${UI.esc(url.href)}" target="_blank" rel="noopener noreferrer">${UI.esc(title)}</a>
          ${snippet ? `<p class="zc-detail">${UI.esc(snippet)}</p>` : ''}</li>`);
      }
      return entries.length ? `<section class="zc-card zc-sources" aria-label="搜索来源"><strong>搜索来源</strong><ol>${entries.join('')}</ol></section>` : '';
    }

    function render(pending = '') {
      const offers = new Set();
      const drafts = new Map();
      const actions = [];
      for (const m of messages) {
        for (const card of m.cards || []) {
          if (card.offerId != null && (card.type === 'plan_draft' || card.type === 'memory_saved')) {
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

      function actionButton(label, action) {
        const i = actions.push(action) - 1;
        return `<button class="btn outline" type="button" data-card-action="${i}" ${busy ? 'disabled' : ''}>${label}</button>`;
      }

      function cardView(card) {
        if ((card.type === 'plan_offer' || card.type === 'memory_offer') && card.id != null) {
          const accepted = offers.has(String(card.id)) || card.status === 'accepted';
          const memory = card.type === 'memory_offer';
          const label = memory ? '偏好提议' : '规划提议';
          return `<section class="zc-card" aria-label="${label}"><strong>${label}</strong>
            <p>${UI.esc(card.summary)}</p>
            ${accepted ? '<p class="zc-detail">已同意</p>' : actionButton(memory ? '记住这条偏好' : '同意这次起草', {
              type: 'offer', id: card.id, memory, modelWork: !memory && card.modelWork !== false,
            })}
          </section>`;
        }
        if (card.type === 'memory_saved') {
          return `<section class="zc-card" aria-label="已保存的偏好"><strong>已保存偏好</strong>
            <p>${UI.esc(card.label || card.key)}：${UI.esc(card.value)}</p>
          </section>`;
        }
        if (card.type !== 'plan_draft' || !card.draft) return '';
        const d = card.draft;
        if (drafts.get(String(d.id)) !== card) return '';
        const steps = Array.isArray(d.steps) ? d.steps : [];
        const titles = new Map(steps.map((s) => [s.id, s.title]));
        const changes = Array.isArray(d.replan?.changes) ? d.replan.changes : [];
        const resultLabel = d.status === 'applied' ? (d.replan ? '目标已更新' : '已应用到目标') : '规划草案';
        const confirm = d.status === 'ready' && d.id != null && Number.isInteger(d.revision)
          ? actionButton('应用这版', { type: 'draft', id: d.id, revision: d.revision }) : '';
        return `<section class="zc-card" aria-label="${resultLabel}"><strong>${resultLabel}</strong>
          <p>${UI.esc(d.goal)}</p>
          ${Number.isFinite(d.weeklyMinutes) ? `<p class="zc-detail">每周可用 ${UI.esc(d.weeklyMinutes)} 分钟</p>` : ''}
          ${typeof d.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.deadline) ? `<p class="zc-detail">截止日期 ${UI.esc(d.deadline)}</p>` : ''}
          ${d.frequency && d.sessionMinutes ? `<p class="zc-detail">每周 ${UI.esc(d.frequency)} 次，每次 ${UI.esc(d.sessionMinutes)} 分钟</p>` : ''}
          ${d.question ? `<p>${UI.esc(d.question)}</p>` : ''}
          ${changes.length ? `<p class="zc-detail">计划释放日期</p><ul>${changes.map((change) => `<li>
            <b>${UI.esc(change.title)}</b><p>${UI.esc(change.from || '未安排')} → ${UI.esc(change.to)}</p>
          </li>`).join('')}</ul>` : ''}
          ${!changes.length && steps.length ? `<ol>${steps.map((step) => `<li>
            <b>${UI.esc(step.title)}</b>${step.minutes != null ? ` · 约 ${UI.esc(step.minutes)} 分钟` : ''}
            ${step.next ? '<span class="zc-next">下一步</span>' : ''}
            <p>${UI.esc(step.doneWhen)}</p>
            ${step.dependsOn?.length ? `<p class="zc-detail">前置：${UI.esc(step.dependsOn.map((id) => titles.get(id) || id).join('、'))}</p>` : ''}
          </li>`).join('')}</ol>` : ''}
          ${confirm}
        </section>`;
      }

      list.innerHTML = messages.map((m) => {
        const own = m.role === 'user';
        return `<div class="zc-msg ${own ? 'me' : 'ai'}">
          ${own ? '' : '<div class="zc-avatar" aria-hidden="true">🐾</div>'}
          <div class="zc-text">${UI.esc(m.content)}${(m.cards || []).map(cardView).join('')}${sourceView(m.sources)}</div>
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
      body.querySelectorAll('button, textarea').forEach((el) => { el.disabled = busy || (!loaded && el.closest('form') != null); });
      file.disabled = busy || !loaded;
      stopButton.disabled = !activeOperation || activeOperation.stopping || activeOperation.cancelled;
    }

    async function run(pending, fn, requestId = null) {
      if (busy) return;
      busy = true;
      const operation = requestId ? { requestId, controller: new AbortController(), stopping: false, cancelled: false } : null;
      activeOperation = operation;
      setError();
      setStatus();
      render(pending);
      syncControls();
      try { await fn(operation); }
      catch (e) {
        if (operation && (operation.cancelled || e.code === 'turn_cancelled')) {
          if (lastRequest?.requestId === operation.requestId) lastRequest = null;
          setError();
          setStatus('已停止运行。');
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
      const pending = action.type === 'draft' ? '正在应用这版…' : (action.memory ? '正在保存偏好…' : 'zoowy 正在准备草案…');
      const requestId = action.type === 'offer' ? ZoowyChat.newRequestId() : null;
      await run(pending, async (operation) => {
        const id = encodeURIComponent(action.id);
        const r = action.type === 'offer'
          ? await api.post(`/api/zoowy/offers/${id}/accept`, { requestId }, { signal: operation?.controller.signal })
          : await api.post(`/api/zoowy/drafts/${id}/confirm`, { revision: action.revision });
        if (operation?.cancelled) return;
        if (!r?.card) throw new Error('服务没有返回操作状态，请重新打开聊天查看');
        messages.push({ role: 'assistant', cards: [r.card] });
        if (r.card.draft?.status === 'applied') onApplied?.();
      }, action.modelWork ? requestId : null);
    }

    async function send(event) {
      event?.preventDefault();
      if (!loaded || busy) return;
      const message = input.value.trim() || (attachment ? '请帮我看看这张图片。' : '');
      if (!message) return;
      const attachmentId = attachment?.id;
      const deepThinking = thinkingButton.getAttribute('aria-pressed') === 'true';
      const smartSearch = searchButton.getAttribute('aria-pressed') === 'true';
      if (!lastRequest || lastRequest.message !== message || lastRequest.attachmentId !== attachmentId ||
          lastRequest.deepThinking !== deepThinking || lastRequest.smartSearch !== smartSearch) {
        lastRequest = { message, attachmentId, deepThinking, smartSearch, requestId: this.newRequestId() };
      }
      const request = lastRequest;
      await run('zoowy 正在回复…', async (operation) => {
        const r = await api.post('/api/zoowy/chat', { ...request, big_goal_id: bigGoalId || undefined }, { signal: operation.controller.signal });
        if (operation.cancelled) return;
        messages.push({ role: 'user', content: attachment ? `${message}\n已附图片` : message });
        messages.push({ role: 'assistant', content: r.reply, cards: r.cards, sources: r.sources });
        input.value = '';
        attachment = null;
        attachmentView();
        lastRequest = null;
      }, request.requestId);
      input.focus();
    }

    compactButton.addEventListener('click', async () => {
      if (!loaded || busy) return;
      const approved = await UI.confirm('将较早的聊天整理成摘要，供后续对话使用？原始聊天记录仍可查看。', { okLabel: '生成摘要' });
      if (!approved || busy) return;
      const requestId = this.newRequestId();
      await run('正在摘要上下文…', async (operation) => {
        const r = await api.post('/api/zoowy/compact', { requestId }, { signal: operation.controller.signal });
        if (operation.cancelled) return;
        const count = r?.compact?.summarizedMessages;
        setStatus(r?.reply || (count > 0 ? `已摘要 ${count} 条消息。` : '没有需要摘要的较早消息。'));
      }, requestId);
    });
    stopButton.addEventListener('click', async () => {
      const operation = activeOperation;
      if (!operation || operation.stopping || operation.cancelled) return;
      operation.stopping = true;
      syncControls();
      try {
        const r = await api.post(`/api/zoowy/turns/${encodeURIComponent(operation.requestId)}/cancel`, {});
        if (activeOperation !== operation) return;
        if (r?.cancelled === true) {
          operation.cancelled = true;
          if (lastRequest?.requestId === operation.requestId) lastRequest = null;
          setError();
          setStatus('已停止运行。');
          operation.controller.abort();
        } else setStatus('当前运行已结束或尚未开始。');
      } catch (e) {
        if (activeOperation === operation) setError(e.message);
      } finally {
        operation.stopping = false;
        syncControls();
      }
    });

    form.addEventListener('submit', (event) => send.call(this, event));
    for (const button of [thinkingButton, searchButton]) {
      button.addEventListener('click', () => {
        button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
      });
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        send.call(this);
      }
    });
    form.querySelector('[data-image]').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const picked = file.files[0];
      file.value = '';
      if (!picked) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(picked.type) || picked.size > 16000000) {
        setError('请选择不超过 16 MB 的 JPEG、PNG 或 WebP 图片。');
        return;
      }
      await run('正在上传图片…', async () => {
        const image = await this.prepareImage(picked);
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('图片读取失败'));
          reader.readAsDataURL(image);
        });
        const uploaded = await api.post('/api/zoowy/attachments', { dataUrl });
        if (!Number.isInteger(uploaded?.attachmentId)) throw new Error('服务没有返回有效的图片编号');
        attachment = { id: uploaded.attachmentId, name: picked.name };
        attachmentView();
      });
    });
    attachmentRow.querySelector('button').addEventListener('click', () => {
      attachment = null;
      attachmentView();
    });
    body.querySelector('[data-settings]').addEventListener('click', () => this.openSettings());
    UI.sheet({ title: 'zoowy', body, actions: [{ label: '关闭' }] });
    run('正在加载聊天记录…', async () => {
      const d = await api.get('/api/zoowy/messages?limit=40');
      messages = d.messages || [];
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

  async prepareImage(file) {
    const maxBytes = 1024 * 1024;
    const bitmap = await createImageBitmap(file);
    try {
      const longest = Math.max(bitmap.width, bitmap.height);
      if (longest <= 2048 && file.size <= maxBytes && file.type !== 'image/webp') return file;

      const ratio = Math.min(1, 1600 / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const encode = (quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      let image = await encode(0.85);
      if (image?.size > maxBytes) image = await encode(0.65);
      if (!image || image.size > maxBytes) throw new Error('图片压缩后仍然太大，请裁剪后重试。');
      return image;
    } finally {
      bitmap.close();
    }
  },

  openSettings() {
    const body = UI.el(`
      <div class="zc-settings">
        <div class="gf-row">
          <h3>DeepSeek</h3>
          <p data-status role="status">正在读取配置…</p>
        </div>
        <form>
          <div class="gf-row">
            <label class="gf-label">DeepSeek API Key <input name="key" type="password" autocomplete="new-password" required maxlength="256" /></label>
          </div>
          <div class="gf-row">
            <label class="gf-label">模型
              <select name="model">
                <option value="deepseek-flash">DeepSeek Flash</option>
                <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
              </select>
            </label>
          </div>
          <div class="zc-settings-actions">
            <button class="btn primary" type="submit">保存 Key</button>
            <button class="btn outline" type="button" data-remove hidden>移除 Key</button>
          </div>
        </form>
        <div class="zc-error" role="alert" hidden></div>
        <section class="zc-preferences" aria-label="已记住的偏好"></section>
      </div>`);
    const form = body.querySelector('form');
    const status = body.querySelector('[data-status]');
    const remove = body.querySelector('[data-remove]');
    const error = body.querySelector('.zc-error');
    const preferenceArea = body.querySelector('.zc-preferences');
    let busy = false;

    function showModel(config) {
      status.textContent = config.configured ? '已配置。保存新 Key 会替换当前 Key。' : '添加 DeepSeek API Key 后即可聊天。';
      remove.hidden = !config.configured;
      form.elements.model.value = config.model || 'deepseek-flash';
      form.elements.key.value = '';
    }

    function showPreferences(preferences) {
      preferenceArea.innerHTML = `<h3>已记住的偏好</h3>${preferences.length ? `<ul>${preferences.map((p, i) => `
        <li><span>${UI.esc(p.label || p.key)}：${UI.esc(p.value)}</span>
          <button class="ghost-btn" type="button" data-forget="${i}">忘记</button></li>`).join('')}</ul>` : '<p>还没有已保存的偏好。</p>'}`;
      preferenceArea.querySelectorAll('[data-forget]').forEach((button) => button.addEventListener('click', () => run(async () => {
        const p = preferences[Number(button.dataset.forget)];
        showPreferences((await api.delete(`/api/zoowy/preferences/${encodeURIComponent(p.key)}`)).preferences || []);
      })));
    }

    async function run(fn) {
      if (busy) return;
      busy = true;
      error.hidden = true;
      body.querySelectorAll('button, input, select').forEach((el) => { el.disabled = true; });
      try { await fn(); }
      catch (e) { error.textContent = e.message; error.hidden = false; }
      finally {
        busy = false;
        body.querySelectorAll('button, input, select').forEach((el) => { el.disabled = false; });
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const fields = new FormData(form);
      run(async () => showModel(await api.put('/api/zoowy/model', { apiKey: fields.get('key').trim(), model: fields.get('model') })));
    });
    remove.addEventListener('click', () => run(async () => showModel(await api.delete('/api/zoowy/model'))));
    UI.sheet({ title: 'zoowy 设置', body, actions: [{ label: '关闭' }] });
    run(async () => {
      const [model, prefs] = await Promise.allSettled([api.get('/api/zoowy/model'), api.get('/api/zoowy/preferences')]);
      if (prefs.status === 'fulfilled') showPreferences(prefs.value.preferences || []);
      if (model.status === 'fulfilled') showModel(model.value);
      else {
        status.textContent = '无法读取模型配置。';
        throw model.reason;
      }
    });
  },
};
