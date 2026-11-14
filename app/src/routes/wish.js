// 愿望单（V0.1 商品类）与兑换：锁分 → 商品自动确认 → 实扣；2 小时可撤回。
const express = require('express');
const { nowIso } = require('../tz');
const { ledgerAdd, balanceOf, tx } = require('../db');
const log = require('../log');

const CASH_MAX = 100000;

function redemptionRow(r, item) {
  return {
    ...r,
    item_title: item ? item.title : '（已删除）',
    item_emoji: item ? item.emoji : '🎁',
    item_category: item ? item.category : 'goods',
  };
}

module.exports = function wishRoutes(db) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);

  async function loadOwnWish(req, res, next) {
    try {
      const item = await db.get('SELECT * FROM wish_items WHERE id = ?', [Number(req.params.id) || 0]);
      if (!item) return res.status(404).json({ error: '愿望不存在' });
      if (item.owner_id !== req.user.id) return res.status(403).json({ error: '只能操作自己的愿望单' });
      req.wish = item;
      next();
    } catch (e) { next(e); }
  }

  async function inCooldown(item) {
    if (!Number(item.cooldown_days)) return false;
    const last = await db.get(
      `SELECT * FROM redemptions WHERE wish_item_id = ? AND status = 'done' ORDER BY fulfilled_at DESC LIMIT 1`,
      [item.id]
    );
    if (!last || !last.fulfilled_at) return false;
    return Date.now() - new Date(last.fulfilled_at).getTime() < Number(item.cooldown_days) * 86400000;
  }

  async function cooldownMsg(item) {
    const last = await db.get(
      `SELECT * FROM redemptions WHERE wish_item_id = ? AND status = 'done' ORDER BY fulfilled_at DESC LIMIT 1`,
      [item.id]
    );
    const left = Math.ceil((Number(item.cooldown_days) * 86400000 - (Date.now() - new Date(last.fulfilled_at).getTime())) / 86400000);
    return `冷却中，${left} 天后可再兑换`;
  }

  // 我的愿望单 + 兑换记录 + 余额
  r.get('/wish', mw.requireUser, async (req, res, next) => {
    try {
      const items = await db.all(
        `SELECT * FROM wish_items WHERE owner_id = ? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, id DESC`,
        [req.user.id]
      );
      const reds = await db.all('SELECT * FROM redemptions WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.id]);
      const itemMap = new Map(items.map((i) => [i.id, i]));
      const balance = await balanceOf(db, req.user.id);
      const enriched = [];
      for (const i of items) {
        const cd = await inCooldown(i);
        enriched.push({
          ...i,
          redeemable: i.status === 'active' && balance >= Number(i.points_cost) && !cd,
          cooldownMsg: cd ? await cooldownMsg(i) : null,
        });
      }
      res.json({
        items: enriched,
        redemptions: reds.map((x) => redemptionRow(x, itemMap.get(x.wish_item_id))),
        balance,
      });
    } catch (e) { next(e); }
  });

  // 搭档的愿望单（只读）：供愿望单页「我的 / ta 的」切换查看。
  // 只返回已配对搭档的在架商品与兑换记录，不提供任何写操作。
  r.get('/wish/partner', mw.requireUser, async (req, res, next) => {
    try {
      const partner = await mw.partnerOf(req.user.id);
      if (!partner) {
        return res.json({ partner: null, items: [], redemptions: [], balance: 0 });
      }
      const allItems = await db.all('SELECT * FROM wish_items WHERE owner_id = ? ORDER BY id DESC', [partner.id]);
      const reds = await db.all('SELECT * FROM redemptions WHERE user_id = ? ORDER BY id DESC LIMIT 100', [partner.id]);
      const itemMap = new Map(allItems.map((i) => [i.id, i]));
      const balance = await balanceOf(db, partner.id);
      res.json({
        partner: { id: partner.id, username: partner.login_name || '搭档', avatar: partner.avatar },
        items: allItems
          .filter((i) => i.status === 'active')
          .map((i) => ({ ...i, redeemable: false, cooldownMsg: null })),
        redemptions: reds.map((x) => redemptionRow(x, itemMap.get(x.wish_item_id))),
        balance,
      });
    } catch (e) { next(e); }
  });

  // 新建愿望
  r.post('/wish', mw.requireUser, async (req, res, next) => {
    try {
      const b = req.body || {};
      if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 30) {
        return res.status(400).json({ error: '名称需为 1–30 字' });
      }
      const price = Number(b.price_cny);
      if (!Number.isFinite(price) || price <= 0 || price > CASH_MAX) {
        return res.status(400).json({ error: `参考价需在 0–${CASH_MAX} 元之间` });
      }
      const defaultPoints = Math.round(price * 10);
      let pointsCost = b.points_cost === undefined || b.points_cost === null ? defaultPoints : Number(b.points_cost);
      if (!Number.isInteger(pointsCost) || pointsCost < 1 || pointsCost > 1000000) {
        return res.status(400).json({ error: '积分价需为 1–1000000 的整数' });
      }
      const cooldown = Math.max(0, Math.min(365, Number(b.cooldown_days) || 0));
      if (b.description !== undefined && String(b.description).length > 300) {
        return res.status(400).json({ error: '描述不能超过 300 字' });
      }
      let imageId = null;
      if (b.image_id) {
        const up = await db.get('SELECT * FROM uploads WHERE id = ? AND user_id = ?', [Number(b.image_id), req.user.id]);
        if (!up) return res.status(400).json({ error: '图片无效' });
        imageId = Number(b.image_id);
      }
      const info = await db.run(
        `INSERT INTO wish_items (owner_id, category, title, description, emoji, price_cny, points_cost, image_id, cooldown_days, status, created_at, updated_at)
         VALUES (?, 'goods', ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?) RETURNING id`,
        [req.user.id, b.title.trim(), String(b.description || '').trim(), b.emoji || '🎁', price, pointsCost, imageId, cooldown, nowIso(), nowIso()]
      );
      log.log('wish_create', `${req.user.nickname} 上架愿望「${b.title.trim()}」${pointsCost} 分`);
      res.json({ item: await db.get('SELECT * FROM wish_items WHERE id = ?', [Number(info.id)]) });
    } catch (e) { next(e); }
  });

  // 编辑愿望（改价留历史，双方可见）
  r.put('/wish/:id', mw.requireUser, loadOwnWish, async (req, res, next) => {
    try {
      const b = req.body || {};
      const g = req.wish;
      const title = b.title !== undefined ? String(b.title).trim() : g.title;
      if (!title || title.length > 30) return res.status(400).json({ error: '名称需为 1–30 字' });
      const price = b.price_cny !== undefined ? Number(b.price_cny) : Number(g.price_cny);
      if (!Number.isFinite(price) || price <= 0 || price > CASH_MAX) {
        return res.status(400).json({ error: `参考价需在 0–${CASH_MAX} 元之间` });
      }
      const pointsCost = b.points_cost !== undefined ? Number(b.points_cost) : Number(g.points_cost);
      if (!Number.isInteger(pointsCost) || pointsCost < 1 || pointsCost > 1000000) {
        return res.status(400).json({ error: '积分价需为 1–1000000 的整数' });
      }
      const status = b.status !== undefined ? (b.status === 'active' ? 'active' : 'archived') : g.status;
      if (price !== Number(g.price_cny) || pointsCost !== Number(g.points_cost)) {
        await db.run('INSERT INTO wish_history (wish_id, changed_by, detail, created_at) VALUES (?, ?, ?, ?)',
          [g.id, req.user.id, `参考价 ${g.price_cny}→${price} 元；积分价 ${g.points_cost}→${pointsCost}`, nowIso()]);
        log.log('wish_price_change', `${req.user.nickname} 改价「${g.title}」`);
      }
      await db.run(
        `UPDATE wish_items SET title=?, description=?, emoji=?, price_cny=?, points_cost=?, cooldown_days=?, status=?, updated_at=? WHERE id=?`,
        [
          title,
          b.description !== undefined ? String(b.description).trim() : g.description,
          b.emoji !== undefined ? b.emoji : g.emoji,
          price,
          pointsCost,
          Math.max(0, Math.min(365, Number(b.cooldown_days !== undefined ? b.cooldown_days : g.cooldown_days))),
          status,
          nowIso(),
          g.id,
        ]
      );
      res.json({ item: await db.get('SELECT * FROM wish_items WHERE id = ?', [g.id]) });
    } catch (e) { next(e); }
  });

  // 删除愿望（只能删自己的；有进行中的兑换时先拦住，避免积分已扣却查不到商品）
  // 注：redemptions.wish_item_id 无外键，删除后兑换记录仍保留，前端会显示「（已删除）」。
  r.delete('/wish/:id', mw.requireUser, loadOwnWish, async (req, res, next) => {
    try {
      const pending = await db.get(
        `SELECT id FROM redemptions WHERE wish_item_id = ? AND status IN ('applied', 'confirmed') LIMIT 1`,
        [req.wish.id]
      );
      if (pending) return res.status(400).json({ error: '这件愿望还有未完成的兑换，先处理再删除' });
      await db.run('DELETE FROM wish_items WHERE id = ? AND owner_id = ?', [req.wish.id, req.user.id]);
      log.log('wish_delete', `${req.user.nickname} 删除愿望「${req.wish.title}」`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 兑换（商品类：提交即自动确认）
  r.post('/wish/:id/redeem', mw.requireUser, loadOwnWish, async (req, res, next) => {
    try {
      const item = req.wish;
      if (item.status !== 'active') return res.status(400).json({ error: '这个愿望已下架' });
      const balance = await balanceOf(db, req.user.id);
      const cost = Number(item.points_cost);
      if (balance < cost) return res.status(400).json({ error: `积分不够：还差 ${cost - balance} 分` });
      if (await inCooldown(item)) return res.status(400).json({ error: await cooldownMsg(item) });

      const result = await tx(db, async (c) => {
        const info = await c.run(
          `INSERT INTO redemptions (wish_item_id, user_id, points_locked, points_charged, status, applied_at, confirmed_at)
           VALUES (?, ?, ?, ?, 'confirmed', ?, ?) RETURNING id`,
          [item.id, req.user.id, cost, cost, nowIso(), nowIso()]
        );
        const redId = Number(info.id);
        await ledgerAdd(c, {
          userId: req.user.id,
          delta: -cost,
          type: 'redeem_lock',
          refType: 'redemption',
          refId: redId,
          note: `兑换「${item.title}」锁分`,
        });
        const charge = await ledgerAdd(c, {
          userId: req.user.id,
          delta: 0,
          type: 'redeem_charge',
          refType: 'redemption',
          refId: redId,
          note: `兑换「${item.title}」确认扣减`,
        });
        return { redId, balanceAfter: charge.balanceAfter };
      });
      log.log('redeem', `${req.user.nickname} 兑换「${item.title}」−${cost} 分`);
      res.json({
        redemption: await db.get('SELECT * FROM redemptions WHERE id = ?', [result.redId]),
        balance: result.balanceAfter,
      });
    } catch (e) { next(e); }
  });

  // 撤回（2 小时内）
  r.post('/redemptions/:id/cancel', mw.requireUser, async (req, res, next) => {
    try {
      const red = await db.get('SELECT * FROM redemptions WHERE id = ?', [Number(req.params.id) || 0]);
      if (!red) return res.status(404).json({ error: '兑换记录不存在' });
      if (red.user_id !== req.user.id) return res.status(403).json({ error: '只能撤回自己的兑换' });
      if (red.status !== 'confirmed') return res.status(400).json({ error: '当前状态不能撤回' });
      if (Date.now() - new Date(red.applied_at).getTime() > 2 * 3600000) {
        return res.status(400).json({ error: '超过 2 小时，不能撤回' });
      }
      await tx(db, async (c) => {
        await c.run(`UPDATE redemptions SET status='cancelled' WHERE id=?`, [red.id]);
        await ledgerAdd(c, {
          userId: red.user_id,
          delta: Number(red.points_locked),
          type: 'redeem_refund',
          refType: 'redemption',
          refId: red.id,
          note: '兑换撤回退分',
        });
      });
      log.log('redeem_cancel', `${req.user.nickname} 撤回兑换 #${red.id}`);
      res.json({ ok: true, balance: await balanceOf(db, req.user.id) });
    } catch (e) { next(e); }
  });

  // 已收到
  r.post('/redemptions/:id/done', mw.requireUser, async (req, res, next) => {
    try {
      const red = await db.get('SELECT * FROM redemptions WHERE id = ?', [Number(req.params.id) || 0]);
      if (!red) return res.status(404).json({ error: '兑换记录不存在' });
      if (red.user_id !== req.user.id) return res.status(403).json({ error: '只能操作自己的兑换' });
      if (red.status !== 'confirmed') return res.status(400).json({ error: '当前状态不能标记完成' });
      await db.run(`UPDATE redemptions SET status='done', fulfilled_at=? WHERE id=?`, [nowIso(), red.id]);
      log.log('redeem_done', `${req.user.nickname} 兑换 #${red.id} 已完成`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
};
