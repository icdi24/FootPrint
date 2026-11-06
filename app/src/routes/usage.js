// 使用时长（Android App 上报）：日报表覆盖写 + 双方互看。
// 设计见 手机版需求文档.md 第 16.3 节。
const express = require('express');
const { todayStr, addDaysStr, nowIso } = require('../tz');
const log = require('../log');

const MAX_APPS = 200;
const MAX_SECONDS = 86400;
const SELF_PACKAGE = 'me.footprint.app';

function validPackage(p) {
  return typeof p === 'string' && p.length > 0 && p.length <= 200 && /^[A-Za-z0-9._]+$/.test(p);
}

module.exports = function usageRoutes(db) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);

  async function rowsFor(userId, date) {
    return db.all(
      `SELECT package_name, app_name, seconds, updated_at FROM usage_daily
       WHERE user_id = ? AND usage_date = ? ORDER BY seconds DESC, package_name`,
      [userId, date]
    );
  }

  function summarize(rows) {
    let total = 0;
    let lastReportAt = null;
    for (const x of rows) {
      total += Number(x.seconds);
      if (!lastReportAt || x.updated_at > lastReportAt) lastReportAt = x.updated_at;
    }
    return {
      totalSeconds: total,
      apps: rows.map((x) => ({
        packageName: x.package_name,
        appName: x.app_name,
        seconds: Number(x.seconds),
      })),
      lastReportAt,
    };
  }

  // 上报：本人当日各 App 累计秒数（覆盖写，幂等）
  r.put('/usage/report', mw.requireUser, async (req, res, next) => {
    try {
      const body = req.body || {};
      const date = String(body.date || '');
      const today = todayStr();
      // 只接受今天或昨天，防篡改历史
      if (date !== today && date !== addDaysStr(today, -1)) {
        return res.status(400).json({ error: '只能上报今天或昨天的数据' });
      }
      if (!Array.isArray(body.apps)) return res.status(400).json({ error: 'apps 必须是数组' });
      if (body.apps.length > MAX_APPS) return res.status(400).json({ error: `一次最多上报 ${MAX_APPS} 个应用` });

      // 校验 + 合并（同包名重复出现时取最大值），过滤自家包名
      const merged = new Map();
      for (const a of body.apps) {
        if (!a || !validPackage(a.packageName)) {
          return res.status(400).json({ error: '包名不合法' });
        }
        if (a.packageName === SELF_PACKAGE) continue;
        const sec = Math.floor(Number(a.seconds) || 0);
        if (!Number.isFinite(sec) || sec < 0) return res.status(400).json({ error: 'seconds 不合法' });
        if (sec > MAX_SECONDS) return res.status(400).json({ error: 'seconds 超出范围' });
        const name = String(a.appName || '').slice(0, 100);
        const prev = merged.get(a.packageName);
        if (!prev || sec > prev.seconds) merged.set(a.packageName, { packageName: a.packageName, appName: name, seconds: sec });
      }

      const now = nowIso();
      for (const item of merged.values()) {
        await db.run(
          `INSERT INTO usage_daily (user_id, usage_date, package_name, app_name, seconds, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, usage_date, package_name)
           DO UPDATE SET app_name = EXCLUDED.app_name, seconds = EXCLUDED.seconds, updated_at = EXCLUDED.updated_at`,
          [req.user.id, date, item.packageName, item.appName, item.seconds, now]
        );
      }
      log.log('usage_report', `${req.user.nickname} 上报 ${date} 共 ${merged.size} 个应用`);
      res.json({ ok: true, serverTime: now, date, count: merged.size });
    } catch (e) { next(e); }
  });

  // 自己的当日时长
  r.get('/usage/today', mw.requireUser, async (req, res, next) => {
    try {
      const date = todayStr();
      const s = summarize(await rowsFor(req.user.id, date));
      res.json({ date, ...s });
    } catch (e) { next(e); }
  });

  // 对方的当日时长（只允许本人或搭档）
  r.get('/usage/partner', mw.requireUser, async (req, res, next) => {
    try {
      const partner = await mw.partnerOf(req.user.id);
      if (!partner) return res.status(404).json({ error: '还没有搭档' });
      const today = todayStr();
      const date = req.query.date ? String(req.query.date) : today;
      // 只允许查最近 30 天，格式必须是 YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < addDaysStr(today, -30)) {
        return res.status(400).json({ error: 'date 不合法（只支持最近 30 天，格式 YYYY-MM-DD）' });
      }
      const s = summarize(await rowsFor(partner.id, date));
      const staleMinutes = s.lastReportAt
        ? Math.max(0, Math.round((Date.now() - new Date(s.lastReportAt).getTime()) / 60000))
        : null;
      res.json({
        partner: { id: partner.id, nickname: partner.nickname, avatar: partner.avatar },
        date,
        totalSeconds: s.totalSeconds,
        apps: s.apps,
        lastReportAt: s.lastReportAt,
        staleMinutes,
      });
    } catch (e) { next(e); }
  });

  // 7 天区间（P4-#19）：自己 + 对方每人每天总时长 + 当天 Top App。
  // 无数据的日子返回空（null 而不是 0，前端画断点标「未上报」，不补 0）
  r.get('/usage/range', mw.requireUser, async (req, res, next) => {
    try {
      const partner = await mw.partnerOf(req.user.id);
      const days = Math.max(1, Math.min(31, Number(req.query.days) || 7));
      const today = todayStr();
      const from = addDaysStr(today, -(days - 1));

      async function series(userId) {
        const rows = await db.all(
          `SELECT usage_date, SUM(seconds) AS total_seconds, package_name, app_name
           FROM usage_daily
           WHERE user_id = ? AND usage_date >= ?
           GROUP BY usage_date, package_name, app_name
           ORDER BY usage_date`,
          [userId, from]
        );
        const byDate = new Map();
        for (const r of rows) {
          if (!byDate.has(r.usage_date)) byDate.set(r.usage_date, { date: r.usage_date, totalSeconds: 0, topApps: [] });
          const d = byDate.get(r.usage_date);
          d.totalSeconds += Number(r.total_seconds);
          d.topApps.push({ package_name: r.package_name, app_name: r.app_name, seconds: Number(r.total_seconds) });
        }
        const out = [];
        for (let i = 0; i < days; i++) {
          const date = addDaysStr(from, i);
          const d = byDate.get(date);
          if (!d) {
            out.push({ date, totalSeconds: null, topApps: [] }); // 无数据 = 断点，不补 0
          } else {
            d.topApps.sort((a, b) => b.seconds - a.seconds);
            out.push({ date, totalSeconds: d.totalSeconds, topApps: d.topApps.slice(0, 5) });
          }
        }
        return out;
      }

      res.json({
        from, today, days,
        me: { series: await series(req.user.id) },
        partner: partner ? { nickname: partner.nickname, avatar: partner.avatar, series: await series(partner.id) } : null,
      });
    } catch (e) { next(e); }
  });

  return r;
};
