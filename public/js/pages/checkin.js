// 打卡弹层（首页与目标页共用）：确认时长 → 可选证据 → 提交。
const CheckinSheet = (() => {
  async function open(goal, { onSuccess } = {}) {
    let duration = Number(goal.duration_min) || 30;
    let evidenceText = '';
    let evidenceId = null;
    let evidenceUrl = null;
    let preview = null;

    const chips = [15, 30, 45, 60];
    const body = document.createElement('div');
    body.className = 'checkin-body';
    body.innerHTML = `
      <div class="ci-goal">
        <span class="ci-emoji">${UI.esc(goal.emoji || '🎯')}</span>
        <div>
          <div class="ci-title">${UI.esc(goal.title)}</div>
          <div class="ci-meta">${goal.window_start ? `窗口 ${goal.window_start}–${goal.window_end}` : '全天可打'} · 难度 ${goal.difficulty}</div>
        </div>
      </div>
      <div class="ci-row">
        <span class="ci-label">实际时长</span>
        <div class="dur-chips">
          ${chips.map((c) => `<button type="button" class="dur-chip ${c === duration ? 'on' : ''}" data-d="${c}">${c}′</button>`).join('')}
        </div>
        <div class="dur-stepper">
          <button type="button" class="step-btn" id="dur-minus">−</button>
          <span class="dur-val" id="dur-val">${duration}</span>
          <button type="button" class="step-btn" id="dur-plus">+</button>
          <span class="dur-unit">分钟</span>
        </div>
      </div>
      <div class="ci-evidence">
        <span class="ci-label">留句话或图（可选）</span>
        <textarea id="ci-text" rows="2" maxlength="200" placeholder="比如：今天背了 50 个新词"></textarea>
        <div class="ci-photo-row">
          <button type="button" class="photo-add" id="ci-photo">${window.icon('camera')} 加一张图</button>
          <div class="photo-thumb hidden" id="ci-thumb" role="img" aria-label="证据图"></div>
        </div>
      </div>
      <div class="ci-points">
        <div class="ci-points-label">本次预计</div>
        <div class="ci-points-val" id="ci-points">+${UI.fmtNum(previewPoints())}</div>
        <div class="ci-points-note" id="ci-note"></div>
      </div>`;

    function previewPoints() {
      const inWin = window.__inWindowCheck(goal);
      return window.__calcClient(goal, duration, inWin);
    }

    function warnDuration() {
      const base = Number(goal.duration_min) || 30;
      const el = body.querySelector('#ci-note');
      const ratio = duration / base;
      if (ratio > 1.5) el.textContent = `比设定时长多了 ${duration - base} 分钟，按实际填就好`;
      else if (ratio < 0.5 && duration > 0) el.textContent = `比设定时长少了一半，对方看得见哦`;
      else el.textContent = '';
    }

    function refresh() {
      body.querySelector('#dur-val').textContent = duration;
      body.querySelector('#ci-points').textContent = '+' + UI.fmtNum(previewPoints());
      body.querySelectorAll('.dur-chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.d) === duration));
      warnDuration();
    }

    body.querySelectorAll('.dur-chip').forEach((c) => {
      c.addEventListener('click', () => { duration = Number(c.dataset.d); refresh(); });
    });
    body.querySelector('#dur-minus').addEventListener('click', () => { duration = Math.max(1, duration - 5); refresh(); });
    body.querySelector('#dur-plus').addEventListener('click', () => { duration = Math.min(1440, duration + 5); refresh(); });

    body.querySelector('#ci-photo').addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', async () => {
        const f = input.files && input.files[0];
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) { UI.toast('图片别超过 10MB', 'warn'); return; }
        try {
          const up = await api.upload(f, 'evidence');
          evidenceId = up.id;
          evidenceUrl = up.url;
          const thumb = body.querySelector('#ci-thumb');
          thumb.style.backgroundImage = `url("${up.url}")`;
          thumb.classList.remove('hidden');
        } catch (e) {
          UI.toast(e.message, 'err');
        }
      });
      input.click();
    });

    let submitted = false;
    const sheetPromise = UI.sheet({
      title: '打卡',
      body,
      actions: [
        {
          label: '打卡',
          kind: 'primary big',
          async onClick(close) {
            if (submitted) return;
            submitted = true;
            const text = body.querySelector('#ci-text').value.trim();
            try {
              const data = await api.post(`/api/goals/${goal.id}/checkin`, {
                duration_min: duration,
                evidence_text: text,
                evidence_id: evidenceId,
              });
              close();
              UI.toast(`打卡成功，+${UI.fmtNum(data.points)} 分已入账`, 'ok');
              if (data.bonuses && data.bonuses.length) {
                setTimeout(() => {
                  data.bonuses.forEach((b) => {
                    UI.toast(`🔥 连续 ${b.n} 达成，额外 +${UI.fmtNum(b.points)} 分`, 'bonus');
                  });
                }, 700);
              }
              if (onSuccess) onSuccess(data);
            } catch (e) {
              submitted = false;
              UI.toast(e.message, 'err');
            }
          },
        },
      ],
    });
    return sheetPromise;
  }

  // 长按直接提交（预填时长，对应 P1）
  async function instant(goal, { onSuccess } = {}) {
    try {
      const data = await api.post(`/api/goals/${goal.id}/checkin`, {
        duration_min: Number(goal.duration_min) || 30,
        evidence_text: '',
        evidence_id: null,
      });
      UI.toast(`打卡成功，+${UI.fmtNum(data.points)} 分已入账`, 'ok');
      if (data.bonuses && data.bonuses.length) {
        setTimeout(() => {
          data.bonuses.forEach((b) => UI.toast(`🔥 连续 ${b.n} 达成，额外 +${UI.fmtNum(b.points)} 分`, 'bonus'));
        }, 700);
      }
      if (onSuccess) onSuccess(data);
    } catch (e) {
      UI.toast(e.message, 'err');
    }
  }

  return { open, instant };
})();
