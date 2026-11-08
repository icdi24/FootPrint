// 按用户的 AI 设置：单一真源，供路由与 agent 工作流共用。
// 默认：skipConfirm 关、reportChanges 开、dailyEnabled 关（无行时按默认，不自动建行）。
async function getUserSettings(db, userId) {
  const row = await db.get('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
  return {
    skipConfirm: row ? Boolean(row.skip_confirm) : false,
    reportChanges: row ? Boolean(row.report_changes) : true,
    dailyEnabled: row ? Boolean(row.daily_enabled) : false,
  };
}

module.exports = { getUserSettings };
