// 按用户的 AI 设置：单一真源，供路由与 agent 工作流共用。
// 默认：reportChanges 开、dailyEnabled 关（无行时按默认，不自动建行）。
// v2 起 skipConfirm 已移除：确认=决策，不允许开关跳过；user_settings.skip_confirm 列留着不读（备份兼容）。
async function getUserSettings(db, userId) {
  const row = await db.get('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
  return {
    reportChanges: row ? Boolean(row.report_changes) : true,
    dailyEnabled: row ? Boolean(row.daily_enabled) : false,
  };
}

module.exports = { getUserSettings };
