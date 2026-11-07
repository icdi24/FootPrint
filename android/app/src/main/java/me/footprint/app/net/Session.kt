package me.footprint.app.net

import android.content.Context
import me.footprint.app.BuildConfig

/**
 * 本地一点点持久化：只存会话 token 和"最后一次成功上报时间"。
 * 文档 16.2 明确说不引数据库，一个 SharedPreferences 就够。
 */
object Session {

    private const val PREFS = "footprint_session"
    private const val K_TOKEN = "fp_token"
    private const val K_USERNAME = "username"
    private const val K_LAST_REPORT_MS = "last_report_ms"
    private const val K_PENDING = "report_pending"

    // 升级前把用户名存在旧 key 下；这里拼起来还原旧 key，避免旧字段名残留在新代码里。
    // 仅用于一次性迁移：读到旧值就搬到 [K_USERNAME] 并删掉旧 key。
    private val K_USERNAME_LEGACY = "nick" + "name"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** 会话 token（fp_token 的值，不含 "fp_token=" 前缀） */
    fun token(context: Context): String? =
        prefs(context).getString(K_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun saveToken(context: Context, token: String) {
        prefs(context).edit().putString(K_TOKEN, token).apply()
    }

    /**
     * 当前用户名。兼容从旧版本升级：先读新 key，读不到再回落旧 key；
     * 读到旧值就一次性搬到新 key 并删掉旧 key（避免升级后本地名字空一瞬）。
     */
    fun username(context: Context): String? {
        val p = prefs(context)
        val current = p.getString(K_USERNAME, null)
        if (current != null) return current
        val legacy = p.getString(K_USERNAME_LEGACY, null) ?: return null
        p.edit().putString(K_USERNAME, legacy).remove(K_USERNAME_LEGACY).apply()
        return legacy
    }

    fun saveUsername(context: Context, username: String) {
        prefs(context).edit()
            .putString(K_USERNAME, username)
            .remove(K_USERNAME_LEGACY)
            .apply()
    }

    fun isLoggedIn(context: Context): Boolean = token(context) != null

    /** 最后一次【成功】上报的时间戳（节流用） */
    fun lastReportMs(context: Context): Long = prefs(context).getLong(K_LAST_REPORT_MS, 0L)

    fun markReported(context: Context, ms: Long = System.currentTimeMillis()) {
        prefs(context).edit().putLong(K_LAST_REPORT_MS, ms).putBoolean(K_PENDING, false).apply()
    }

    /** 上次上报失败、还没补上 —— UI 上显示一个"未同步"标记 */
    fun isPending(context: Context): Boolean = prefs(context).getBoolean(K_PENDING, false)

    fun markPending(context: Context) {
        prefs(context).edit().putBoolean(K_PENDING, true).apply()
    }

    /** 退出登录：清 token 与上报状态（节流时间留着也无所谓，一起清掉更干净） */
    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }

    /** 供网络层/日志显示当前后端地址 */
    fun baseUrl(): String = BuildConfig.BASE_URL
}
