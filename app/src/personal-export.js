// Personal downloads are a field whitelist, independent of full database backups.
const AdmZip = require('adm-zip');
const { tx } = require('./db');
const { todayStr } = require('./tz');

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const BATCH_SIZE = 250;
const exportError = (status, code, message) => Object.assign(new Error(message), { status, code });

function pick(value, fields) {
  const out = {};
  for (const field of fields.split(' ')) {
    if (Object.hasOwn(value || {}, field)) out[field] = value[field];
  }
  return out;
}

function parse(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function profileSnapshot(value) {
  const rows = parse(value, []);
  return Array.isArray(rows) ? rows.map((row) => pick(row, 'block content source status shared updated_at')) : [];
}

function profileChanges(value) {
  const rows = parse(value, []);
  return Array.isArray(rows) ? rows.map((row) => pick(row, 'op block before after reason evidence versionId')) : [];
}

function planSnapshot(value, goalIds) {
  const snapshot = parse(value, {});
  return {
    big_goal: pick(snapshot.big_goal, 'id title progress'),
    chain: Array.isArray(snapshot.chain) ? snapshot.chain.filter((row) => goalIds.has(Number(row.id)))
      .map((row) => pick(row, 'id title emoji description accept_criteria planned_date plan_order plan_status status')) : [],
  };
}

function visibleProposal(value) {
  const p = parse(value, {});
  const out = pick(p, 'goal kind weeklyMinutes frequency sessionMinutes deadline question');
  if (Array.isArray(p.steps)) out.steps = p.steps.map((s) => pick(s, 'id title minutes doneWhen dependsOn next purpose'));
  if (p.replan) out.replan = {
    changes: Array.isArray(p.replan.changes) ? p.replan.changes.map((s) => pick(s, 'id title from to')) : [],
  };
  return out;
}

function visibleReport(value) {
  const report = parse(value, null);
  if (!report || typeof report !== 'object') return null;
  const out = pick(report, 'state status reason startedAt finishedAt durationMs modelCalls promptTokens completionTokens totalTokens usageAvailable usageReported contextTrimmed');
  for (const key of ['tools', 'operations', 'changes', 'committedChanges']) {
    if (Array.isArray(report[key])) out[key] = report[key].map((item) => pick(item,
      'name tool operation status ok authorizedBy source recordId recordIds goalIds bigGoalId durationMs committed'));
  }
  return out;
}

function visibleMessageMeta(value) {
  const meta = parse(value, {});
  const out = pick(meta, 'failed degraded reason');
  if (Array.isArray(meta.tools)) out.tools = meta.tools.filter((s) => typeof s === 'string' && /^[a-z_]{1,64}$/.test(s));
  if (Array.isArray(meta.cards)) out.cards = meta.cards.map((card) => {
    const c = pick(card, 'type id offerId summary status modelWork');
    if (card.draft) c.draft = { ...visibleProposal(card.draft), ...pick(card.draft, 'id revision status bigGoalId') };
    return c;
  });
  return out;
}

// All SQL fragments are constants. Associated records are selected through the owner's parent.
const PERSONAL_TABLES = [
  { name: 'users', alias: 'u', fields: 'id login_name nickname avatar created_at', where: 'u.id=?' },
  { name: 'big_goals', alias: 'b', fields: 'id title emoji description progress progress_note progress_at status created_at updated_at', where: 'b.owner_id=?' },
  { name: 'goals', alias: 'g', fields: 'id type title emoji description freq_mode freq_n weekdays window_start window_end duration_min difficulty start_date end_date status streak_count streak_best est_total_min accept_criteria total_points custom_points big_goal_id planned_date plan_order plan_status prerequisite_goal_id created_at updated_at', where: 'g.owner_id=?' },
  { name: 'check_ins', alias: 'c', fields: 'id goal_id check_date duration_min in_window points is_makeup evidence_text evidence_id status reason created_at', from: 'check_ins c JOIN goals g ON g.id=c.goal_id', where: 'c.user_id=? AND g.owner_id=?', params: 2 },
  { name: 'point_ledger', alias: 'p', fields: 'id delta balance_after type ref_type ref_id note created_at', where: 'p.user_id=?' },
  { name: 'goal_milestones', alias: 'm', fields: 'goal_id threshold awarded_at', from: 'goal_milestones m JOIN goals g ON g.id=m.goal_id', where: 'g.owner_id=?', order: 'm.goal_id,m.threshold' },
  { name: 'verifications', alias: 'v', fields: 'id goal_id submit_count evidence_text evidence_ids self_statement status reason created_at decided_at', from: 'verifications v JOIN goals g ON g.id=v.goal_id', where: 'g.owner_id=? AND v.submitter_id=?', params: 2 },
  { name: 'wish_items', alias: 'w', fields: 'id category title description emoji price_cny points_cost image_id cooldown_days status created_at updated_at', where: 'w.owner_id=?' },
  { name: 'wish_history', alias: 'h', fields: 'id wish_id detail created_at', from: 'wish_history h JOIN wish_items w ON w.id=h.wish_id', where: 'w.owner_id=?' },
  { name: 'redemptions', alias: 'r', fields: 'id wish_item_id points_locked points_charged status note applied_at confirmed_at fulfilled_at', from: 'redemptions r JOIN wish_items w ON w.id=r.wish_item_id', where: 'r.user_id=? AND w.owner_id=?', params: 2 },
  { name: 'uploads', alias: 'u', fields: 'id kind ext created_at', where: 'u.user_id=?' },
  { name: 'usage_daily', alias: 'u', fields: 'usage_date package_name app_name seconds updated_at', where: 'u.user_id=?', order: 'u.usage_date,u.package_name' },
  { name: 'user_profiles', alias: 'p', fields: 'block content source status shared updated_at', where: 'p.user_id=?', order: 'p.block' },
  { name: 'profile_versions', alias: 'p', fields: 'id snapshot changed_by reason created_at', where: 'p.user_id=?', project: (r) => ({ ...r, snapshot: profileSnapshot(r.snapshot) }) },
  { name: 'profile_changes', alias: 'p', fields: 'id workflow summary detail version_id created_at', where: 'p.user_id=?', project: (r) => ({ ...r, detail: profileChanges(r.detail) }) },
  { name: 'plan_versions', alias: 'p', fields: 'id big_goal_id snapshot source reason created_at', from: 'plan_versions p JOIN big_goals b ON b.id=p.big_goal_id', where: 'p.owner_id=? AND b.owner_id=?', params: 2, project: (r, ids) => ({ ...r, snapshot: planSnapshot(r.snapshot, ids) }) },
  { name: 'diaries', alias: 'd', fields: 'id diary_date ai_original user_edited shared created_at updated_at', where: 'd.user_id=?' },
  { name: 'zoowy_sessions', alias: 's', fields: 'id title created_at updated_at', where: 's.user_id=?' },
  { name: 'zoowy_messages', alias: 'm', fields: 'id session_id role content created_at meta', from: 'zoowy_messages m JOIN zoowy_sessions s ON s.id=m.session_id', where: "m.user_id=? AND s.user_id=? AND m.role IN ('user','assistant')", params: 2, project: (r) => ({ ...r, meta: visibleMessageMeta(r.meta) }) },
  { name: 'ai_calls', alias: 'a', fields: 'id workflow action status model prompt_tokens completion_tokens total_tokens duration_ms created_at', where: 'a.user_id=?' },
  { name: 'user_settings', alias: 's', fields: 'report_changes daily_enabled updated_at', where: 's.user_id=?', order: 's.user_id' },
  { name: 'planning_drafts', alias: 'd', fields: 'id big_goal_id goal kind weekly_minutes revision status proposal', where: 'd.owner_id=?', project: (r) => ({ ...r, proposal: visibleProposal(r.proposal) }) },
  { name: 'zoowy_turns', alias: 't', fields: 'request_id state started_at finished_at report', where: 't.user_id=?', order: 't.started_at,t.request_id', project: (r) => ({ ...r, report: visibleReport(r.report) }) },
];

function maxExportBytes() {
  const configured = Number(process.env.PERSONAL_EXPORT_MAX_BYTES || DEFAULT_MAX_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES;
}

async function buildPersonalExportZip(c, userId, { maxBytes = maxExportBytes() } = {}) {
  const { toCsv } = require('./export');
  const manifest = {
    app: 'footprint-personal', version: 1, scope: 'personal', exportedAt: new Date().toISOString(),
    attachments: { included: false, description: '仅包含本人上传记录及文件引用，不包含附件原图。' },
    tables: {},
  };
  const deadline = Date.now() + 30000;
  const zip = new AdmZip();
  const goalIds = new Set();
  let bytes = Buffer.byteLength(JSON.stringify(manifest));
  const addBytes = (size) => {
    bytes += size;
    if (bytes > maxBytes) throw exportError(413, 'export_too_large', '个人导出超过大小上限，请联系管理员调整导出额度');
  };
  for (const spec of PERSONAL_TABLES) {
    const rows = [];
    let offset = 0;
    for (;;) {
      if (Date.now() >= deadline) throw exportError(504, 'export_timeout', '个人导出超时，请稍后重试');
      const columns = spec.fields.split(' ').map((field) => `${spec.alias}.${field}`).join(',');
      const page = await c.all(`SELECT ${columns}${spec.extra ? ',' + spec.extra : ''}
        FROM ${spec.from || spec.name + ' ' + spec.alias} WHERE ${spec.where}
        ORDER BY ${spec.order || spec.alias + '.id'} LIMIT ? OFFSET ?`,
      [...Array(spec.params || 1).fill(userId), BATCH_SIZE, offset]);
      for (const raw of page) {
        const selected = pick(raw, spec.fields + (spec.extra ? ' report' : ''));
        const row = spec.project ? spec.project(selected, goalIds) : selected;
        addBytes(Buffer.byteLength(JSON.stringify(row)) + 1);
        rows.push(row);
        if (spec.name === 'goals') goalIds.add(Number(row.id));
      }
      if (page.length < BATCH_SIZE) break;
      offset += page.length;
    }
    manifest.tables[spec.name] = rows;
    const csv = toCsv(rows);
    addBytes(Buffer.byteLength(csv) + Buffer.byteLength(spec.name) + 4);
    zip.addFile(`${spec.name}.csv`, Buffer.from(csv));
  }
  const json = JSON.stringify(manifest);
  // Count exactly, including both JSON and CSV; no partial zip is returned on overflow.
  const totalBytes = Buffer.byteLength(json) + zip.getEntries().reduce((n, entry) => n + entry.header.size, 0);
  if (totalBytes > maxBytes) throw exportError(413, 'export_too_large', '个人导出超过大小上限，请联系管理员调整导出额度');
  zip.addFile('data.json', Buffer.from(json));
  return zip;
}

async function personalDownload(db, userId, res) {
  const client = await db.pool.connect();
  let locked = false;
  let released = false;
  let downloadTimer;
  const release = async () => {
    if (released) return;
    released = true;
    clearTimeout(downloadTimer);
    try {
      if (client._securityBroken) { client.release(true); return; }
      if (locked) await client.query('SELECT pg_advisory_unlock(7410,$1)', [userId]);
      client.release();
    } catch { client.release(true); }
  };
  try {
    const claim = await client.query('SELECT pg_try_advisory_lock(7410,$1) AS acquired', [userId]);
    locked = Boolean(claim.rows[0]?.acquired);
    if (!locked) throw exportError(409, 'export_running', '个人导出正在进行，请稍后重试');
    // This session lock remains held until the download finishes, across every Node instance.
    const scoped = { rootPool: db.pool, pool: { connect: async () => ({
      processID: client.processID,
      query: client.query.bind(client),
      release(broken) { if (broken) client._securityBroken = true; },
    }) } };
    const zip = await tx(scoped, (c) => buildPersonalExportZip(c, userId), { timeoutMs: 30000, readOnly: true });
    const buffer = zip.toBuffer();
    if (res.destroyed) { await release(); return; }
    res.once('finish', release);
    res.once('close', release);
    downloadTimer = setTimeout(() => res.destroy(), 30000);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="footprint-personal-${todayStr()}.zip"`);
    res.send(buffer);
  } catch (error) {
    await release();
    throw error;
  }
}

module.exports = { buildPersonalExportZip, personalDownload, PERSONAL_TABLES };
