package me.footprint.app.net

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

// ---------------- 请求 / 响应数据类 ----------------

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class RegisterRequest(val username: String, val password: String, val avatar: String)

@Serializable
data class LoginResponse(val user: UserDto? = null)

@Serializable
data class UserDto(val id: Long, val username: String, val avatar: String? = null)

@Serializable
data class AppUsage(
    val packageName: String,
    val appName: String,
    val seconds: Long,
)

@Serializable
data class ReportRequest(val date: String, val apps: List<AppUsage>)

@Serializable
data class ReportResponse(val ok: Boolean = false, val serverTime: String? = null, val date: String? = null)

@Serializable
data class UsageListResponse(
    val date: String = "",
    val totalSeconds: Long = 0,
    val apps: List<AppUsage> = emptyList(),
    val lastReportAt: String? = null,
)

@Serializable
data class PartnerResponse(
    val partner: UserDto? = null,
    val date: String = "",
    val totalSeconds: Long = 0,
    val apps: List<AppUsage> = emptyList(),
    val lastReportAt: String? = null,
    val staleMinutes: Long? = null,
)

/** 后端统一用 { error: "...", code: "..." } 返回错误信息 */
@Serializable
data class ApiErrorBody(val error: String? = null, val code: String? = null)

/** 把后端的 HTTP 错误变成可读异常，UI 直接展示 message */
class ApiException(message: String, val code: Int = 0, val serverCode: String? = null) : IOException(message)

// ---------------- 客户端 ----------------

/**
 * OkHttp 单例 + 手写 Cookie 处理。
 *
 * 为什么不用 OkHttp 自带的持久化 CookieJar：
 * 文档 16.5 说得很清楚 —— Cookie 不会自己跨进程可靠地持久化，手动塞最省心。
 * 这里的做法是：
 *   1. 登录响应里的 Set-Cookie 由 [MemoryCookieJar] 在内存里接住（只管当前进程）；
 *   2. 真正落盘走 [Session.saveToken]，值取自 Set-Cookie 的 fp_token；
 *   3. 之后每个请求手动加 `Cookie: fp_token=xxx` 头。
 * 即内存 CookieJar 只做兜底（防止个别逻辑漏加头），落盘和回填都是显式的。
 */
object Api {

    private const val TAG = "FootprintApi"
    private const val COOKIE_NAME = "fp_token"
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    /** kotlinx.serialization 的配置：后端有时会多给字段，忽略未知字段更稳 */
    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    /** 内存 CookieJar：只用来接住登录时 Set-Cookie 的 fp_token */
    private class MemoryCookieJar : CookieJar {
        @Volatile
        var session: String? = null

        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            cookies.firstOrNull { it.name == COOKIE_NAME }?.let { session = it.value }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> = emptyList()
    }

    private val cookieJar = MemoryCookieJar()

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    /** zoowy 私有/取消类请求：不跟随重定向 */
    private val zoovyPrivateClient: OkHttpClient by lazy {
        client.newBuilder().followRedirects(false).followSslRedirects(false).build()
    }

    /** zoowy 聊天/出草案要跑模型，给更长的读超时，且断线不自动重试（重试靠 requestId 幂等） */
    private val zoovyChatClient: OkHttpClient by lazy {
        zoovyPrivateClient.newBuilder()
            .readTimeout(75, TimeUnit.SECONDS)
            .callTimeout(80, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build()
    }

    fun baseUrl(): String = Session.baseUrl()

    /** 拼完整地址；BASE_URL 必须带结尾 "/"，这里再兜一层 */
    private fun url(path: String): String {
        val base = if (baseUrl().endsWith("/")) baseUrl() else baseUrl() + "/"
        return base + path.removePrefix("/")
    }

    // ---------------- 底层请求 ----------------

    private suspend fun send(
        method: String,
        path: String,
        body: String? = null,
        token: String? = null,
        requestClient: OkHttpClient = client,
        onSetCookie: ((Map<String, String>) -> Unit)? = null,
    ): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(url(path))
        if (token != null) {
            // 显式带上会话 Cookie（文档 16.5：不要指望 OkHttp 自动跨进程持久化）
            builder.header("Cookie", "$COOKIE_NAME=$token")
        }
        val reqBody = body?.toRequestBody(JSON_MEDIA_TYPE)
        builder.method(method, reqBody)
        builder.header("Accept", "application/json")

        val response = try {
            requestClient.newCall(builder.build()).execute()
        } catch (e: IOException) {
            // 网络不通（没连 Wi-Fi / 地址填错 / 后端没起）统一成一句话
            Log.w(TAG, "$method $path 网络失败", e)
            throw ApiException("连不上后端：${e.message ?: "网络错误"}")
        }

        response.use { resp ->
            // 直接从响应头解析 Set-Cookie，不依赖 CookieJar 回调是否触发
            if (onSetCookie != null) {
                val pairs = mutableMapOf<String, String>()
                resp.headers.values("Set-Cookie").forEach { raw ->
                    val first = raw.substringBefore(';')
                    val i = first.indexOf('=')
                    if (i > 0) pairs[first.substring(0, i).trim()] = first.substring(i + 1).trim()
                }
                onSetCookie(pairs)
            }
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                val err = runCatching {
                    json.decodeFromString(ApiErrorBody.serializer(), text)
                }.getOrNull()
                throw ApiException(
                    err?.error?.takeIf { it.isNotBlank() } ?: "HTTP ${resp.code}",
                    resp.code,
                    err?.code,
                )
            }
            text
        }
    }

    // ---------------- zoowy 常驻问答（第一批：chat / messages / cancel / acceptOffer / confirmDraft） ----------------

    /** GET /api/zoowy/messages —— 历史消息（含卡片 / 工具 / 画像改动 / 失败标记） */
    suspend fun zoovyMessages(token: String): ZoovyHistory =
        json.decodeFromString(ZoovyHistory.serializer(), send("GET", "api/zoowy/messages", null, token))

    /** POST /api/zoowy/chat —— requestId 由客户端生成，服务端据此做幂等与「停止本轮」 */
    suspend fun zoovyChat(token: String, message: ZoovyRequest): ZoovyReply =
        json.decodeFromString(ZoovyReply.serializer(), send(
            "POST", "api/zoowy/chat", json.encodeToString(ZoovyRequest.serializer(), message), token,
            requestClient = zoovyChatClient,
        ))

    /** POST /api/zoowy/turns/{requestId}/cancel —— 停止本轮 */
    suspend fun cancelZoovyTurn(token: String, requestId: String): Boolean =
        json.decodeFromString(ZoovyCancellation.serializer(), send(
            "POST", "api/zoowy/turns/$requestId/cancel", "{}", token, requestClient = zoovyPrivateClient,
        )).cancelled

    /** POST /api/zoowy/offers/{id}/accept —— 同意提议；返回 plan_draft 或 profile_applied 卡片 */
    suspend fun acceptZoovyOffer(token: String, id: Long, requestId: String): ZoovyCard =
        json.decodeFromString(ZoovyCardResponse.serializer(), send(
            "POST", "api/zoowy/offers/$id/accept",
            json.encodeToString(ZoovyOperationRequest.serializer(), ZoovyOperationRequest(requestId)), token,
            requestClient = zoovyChatClient,
        )).card

    /** POST /api/zoowy/drafts/{id}/confirm —— 应用指定版本的草案 */
    suspend fun confirmZoovyDraft(token: String, id: Long, revision: Int): ZoovyCard =
        json.decodeFromString(ZoovyCardResponse.serializer(), send(
            "POST", "api/zoowy/drafts/$id/confirm",
            json.encodeToString(ZoovyConfirm.serializer(), ZoovyConfirm(revision)), token,
        )).card

    // ---------------- 登录 ----------------

    /**
     * 登录：POST /api/login
     * 成功后 token 同时进内存 CookieJar 和 SharedPreferences，调用方拿到的就是 token。
     */
    suspend fun login(
        username: String,
        password: String,
        onToken: (String) -> Unit,
    ): LoginResponse {
        val body = json.encodeToString(LoginRequest.serializer(), LoginRequest(username.trim(), password))
        // 从响应头的 Set-Cookie 里直接取 token（后端 Cookie 名是 fp_token）
        var fromHeader: String? = null
        val text = send("POST", "api/login", body) { cookies ->
            fromHeader = cookies[COOKIE_NAME]
        }

        val resp = runCatching {
            json.decodeFromString(LoginResponse.serializer(), text)
        }.getOrNull()

        // 优先用响应头里的；兜底再用 CookieJar 接到的
        val token = (fromHeader ?: cookieJar.session)?.takeIf { it.isNotBlank() }
            ?: throw ApiException("登录成功但没拿到会话 Cookie，检查是否连到了正确的后端")
        onToken(token)
        return resp ?: LoginResponse()
    }

    /**
     * 注册：POST /api/register（免邀请码，只建账号、不建组）。
     * 成功后同样拿到会话 Cookie，走 onToken 存起来。
     */
    suspend fun register(
        username: String,
        password: String,
        avatar: String,
        onToken: (String) -> Unit,
    ): LoginResponse {
        val body = json.encodeToString(
            RegisterRequest.serializer(),
            RegisterRequest(username.trim(), password, avatar),
        )
        var fromHeader: String? = null
        val text = send("POST", "api/register", body) { cookies ->
            fromHeader = cookies[COOKIE_NAME]
        }
        val resp = runCatching {
            json.decodeFromString(LoginResponse.serializer(), text)
        }.getOrNull()
        val token = (fromHeader ?: cookieJar.session)?.takeIf { it.isNotBlank() }
            ?: throw ApiException("注册成功但没拿到会话 Cookie，检查是否连到了正确的后端")
        onToken(token)
        return resp ?: LoginResponse()
    }

    // ---------------- 使用时长 ----------------

    /** PUT /api/usage/report —— 当日累计覆盖写，后端保证幂等 */
    suspend fun report(date: String, apps: List<AppUsage>, token: String): ReportResponse {
        val body = json.encodeToString(ReportRequest.serializer(), ReportRequest(date, apps))
        val text = send("PUT", "api/usage/report", body, token)
        return json.decodeFromString(ReportResponse.serializer(), text)
    }

    /** GET /api/usage/today */
    suspend fun getMyToday(token: String): UsageListResponse {
        val text = send("GET", "api/usage/today", null, token)
        return json.decodeFromString(UsageListResponse.serializer(), text)
    }

    /** GET /api/usage/partner */
    suspend fun getPartner(token: String): PartnerResponse {
        val text = send("GET", "api/usage/partner", null, token)
        return json.decodeFromString(PartnerResponse.serializer(), text)
    }

    // ---------------- 打卡 / 积分（与 Web 版共用同一套后端） ----------------

    /** GET /api/home —— 首页聚合：余额、连续、今日待办、小目标、对方今日 */
    suspend fun getHome(token: String): HomeResponse {
        val text = send("GET", "api/home", null, token)
        return json.decodeFromString(HomeResponse.serializer(), text)
    }

    /** POST /api/goals/{id}/checkin —— 打卡；duration 不传就用目标的默认时长 */
    suspend fun checkin(token: String, goalId: Long, durationMin: Int?, evidenceText: String?): CheckinResult {
        val body = json.encodeToString(
            CheckinRequest.serializer(),
            CheckinRequest(durationMin, evidenceText?.takeIf { it.isNotBlank() }),
        )
        val text = send("POST", "api/goals/$goalId/checkin", body, token)
        return json.decodeFromString(CheckinResult.serializer(), text)
    }

    /** POST /api/checkins/{id}/revoke —— 24 小时内撤销本人打卡 */
    suspend fun revoke(token: String, checkinId: Long): Boolean {
        send("POST", "api/checkins/$checkinId/revoke", "{}", token)
        return true
    }

    /** GET /api/ledger —— 积分流水（最近 300 条） */
    suspend fun getLedger(token: String): LedgerResponse {
        val text = send("GET", "api/ledger", null, token)
        return json.decodeFromString(LedgerResponse.serializer(), text)
    }

    /** GET /api/partner —— 「我们」页：对方打卡、待验收、并排对比 */
    suspend fun getPartnerPage(token: String): PartnerPageResponse {
        val text = send("GET", "api/partner", null, token)
        return json.decodeFromString(PartnerPageResponse.serializer(), text)
    }

    /** POST /api/checkins/{id}/reject —— 驳回对方今天的打卡 */
    suspend fun rejectCheckin(token: String, checkinId: Long, reason: String) {
        send(
            "POST",
            "api/checkins/$checkinId/reject",
            json.encodeToString(RejectRequest.serializer(), RejectRequest(reason)),
            token,
        )
    }

    // ---------------- 目标（goals） ----------------

    /** GET /api/goals —— 全部目标列表（type 可选 "daily" / "stage"，不传返回全部） */
    suspend fun listGoals(token: String, type: String? = null): List<GoalDetail> {
        val q = type?.let { "?type=$it" } ?: ""
        val text = send("GET", "api/goals$q", null, token)
        return json.decodeFromString(GoalsResponse.serializer(), text).goals
    }

    /** GET /api/goals/week?start=YYYY-MM-DD —— 周视图 */
    suspend fun getWeek(token: String, start: String): WeekView {
        val text = send("GET", "api/goals/week?start=$start", null, token)
        return json.decodeFromString(WeekView.serializer(), text)
    }

    /** GET /api/goals/month?month=YYYY-MM —— 月视图 */
    suspend fun getMonth(token: String, month: String): MonthView {
        val text = send("GET", "api/goals/month?month=$month", null, token)
        return json.decodeFromString(MonthView.serializer(), text)
    }

    /** POST /api/goals —— 新建目标 */
    suspend fun createGoal(token: String, body: GoalPayload): GoalDetail {
        val text = send("POST", "api/goals", json.encodeToString(GoalPayload.serializer(), body), token)
        return json.decodeFromString(GoalCreated.serializer(), text).goal
    }

    /** PUT /api/goals/{id} —— 编辑目标 */
    suspend fun updateGoal(token: String, goalId: Long, body: GoalPayload): GoalDetail {
        val text = send("PUT", "api/goals/$goalId", json.encodeToString(GoalPayload.serializer(), body), token)
        return json.decodeFromString(GoalCreated.serializer(), text).goal
    }

    /** POST /api/goals/{id}/start —— 开始（草稿 → 进行中） */
    suspend fun startGoal(token: String, goalId: Long) {
        send("POST", "api/goals/$goalId/start", "{}", token)
    }

    /** POST /api/goals/{id}/abandon —— 放弃 */
    suspend fun abandonGoal(token: String, goalId: Long) {
        send("POST", "api/goals/$goalId/abandon", "{}", token)
    }

    /** POST /api/goals/{id}/submit —— 小目标提交验收 */
    suspend fun submitGoal(token: String, goalId: Long, selfStatement: String) {
        send(
            "POST",
            "api/goals/$goalId/submit",
            json.encodeToString(SubmitRequest.serializer(), SubmitRequest(selfStatement)),
            token,
        )
    }

    // ---------------- 大目标与计划链（P1-#8） ----------------

    /** GET /api/biggoals —— 大目标列表 */
    suspend fun listBigGoals(token: String): List<BigGoalDto> {
        val text = send("GET", "api/biggoals", null, token)
        return json.decodeFromString(BigGoalListResponse.serializer(), text).bigGoals
    }

    /** GET /api/biggoals/{id} —— 详情：整条路线含未启动 */
    suspend fun getBigGoal(token: String, id: Long): BigGoalDetailResponse {
        val text = send("GET", "api/biggoals/$id", null, token)
        return json.decodeFromString(BigGoalDetailResponse.serializer(), text)
    }

    /** POST /api/biggoals —— 新建大目标 */
    suspend fun createBigGoal(token: String, body: BigGoalPayload): BigGoalDto {
        val text = send("POST", "api/biggoals", json.encodeToString(BigGoalPayload.serializer(), body), token)
        return json.decodeFromString(BigGoalCreated.serializer(), text).bigGoal
    }

    /** PATCH /api/biggoals/{id} —— 编辑大目标 */
    suspend fun updateBigGoal(token: String, id: Long, body: BigGoalPayload): BigGoalDto {
        val text = send("PATCH", "api/biggoals/$id", json.encodeToString(BigGoalPayload.serializer(), body), token)
        return json.decodeFromString(BigGoalCreated.serializer(), text).bigGoal
    }

    /** PATCH /api/biggoals/{id}/goals/{goalId} —— 手改链上小目标（手改优先于 AI 重排） */
    suspend fun patchChainGoal(token: String, bigGoalId: Long, goalId: Long, body: ChainEditPayload) {
        send("PATCH", "api/biggoals/$bigGoalId/goals/$goalId", json.encodeToString(ChainEditPayload.serializer(), body), token)
    }

    /** POST /api/biggoals/{id}/shift —— 整体顺延/提前（只动未启动的） */
    suspend fun shiftPlan(token: String, bigGoalId: Long, fromDate: String, days: Int) {
        send(
            "POST",
            "api/biggoals/$bigGoalId/shift",
            json.encodeToString(ShiftPayload.serializer(), ShiftPayload(fromDate, days)),
            token,
        )
    }

    /** DELETE /api/biggoals/{id}/goals/{goalId} —— 解绑（只允许未启动的） */
    suspend fun unbindChainGoal(token: String, bigGoalId: Long, goalId: Long) {
        send("DELETE", "api/biggoals/$bigGoalId/goals/$goalId", null, token)
    }

    // ---------------- AI 日报 / 设置（P2-#15） ----------------

    /** GET /api/diaries/today —— 今日日报（没有就是 null；Worker 轮询用） */
    suspend fun getDiaryToday(token: String): DiaryTodayResponse {
        val text = send("GET", "api/diaries/today", null, token)
        return json.decodeFromString(DiaryTodayResponse.serializer(), text)
    }

    /** GET /api/me/settings —— 每用户 AI 设置（与积分系数 getSettings 同名会冲突，改名） */
    suspend fun getAiSettings(token: String): UserSettings {
        val text = send("GET", "api/me/settings", null, token)
        return json.decodeFromString(UserSettings.serializer(), text)
    }

    /** PUT /api/me/settings —— 改 AI 设置（reportChanges / dailyEnabled） */
    suspend fun updateAiSettings(token: String, body: AiSettingsPayload): UserSettings {
        val text = send("PUT", "api/me/settings", json.encodeToString(AiSettingsPayload.serializer(), body), token)
        return json.decodeFromString(UserSettings.serializer(), text)
    }

    // ---------------- 画像变更（「改完告诉用户改了什么」） ----------------

    /** GET /api/me/profile/changes —— 变更留痕列表 + 未读数 */
    suspend fun getProfileChanges(token: String, limit: Int = 30): ProfileChangesResponse {
        val text = send("GET", "api/me/profile/changes?limit=$limit", null, token)
        return json.decodeFromString(ProfileChangesResponse.serializer(), text)
    }

    /** POST /api/me/profile/changes/read —— 全部标为已读 */
    suspend fun markProfileChangesRead(token: String) {
        send("POST", "api/me/profile/changes/read", "{}", token)
    }

    /** GET /api/me/profile/versions —— 版本历史（不再只写不读） */
    suspend fun getProfileVersions(token: String, limit: Int = 20): ProfileVersionsResponse {
        val text = send("GET", "api/me/profile/versions?limit=$limit", null, token)
        return json.decodeFromString(ProfileVersionsResponse.serializer(), text)
    }

    /** POST /api/me/profile/versions/{id}/rollback —— 回滚到指定版本 */
    suspend fun rollbackProfileVersion(token: String, id: Long): RollbackResponse {
        val text = send("POST", "api/me/profile/versions/$id/rollback", "{}", token)
        return json.decodeFromString(RollbackResponse.serializer(), text)
    }

    // ---------------- 愿望单（wish） ----------------

    /** GET /api/wish —— 愿望列表 */
    suspend fun listWish(token: String): WishListResponse {
        val text = send("GET", "api/wish", null, token)
        return json.decodeFromString(WishListResponse.serializer(), text)
    }

    /** POST /api/wish —— 新建愿望 */
    suspend fun createWish(token: String, body: WishPayload): WishItem {
        val text = send("POST", "api/wish", json.encodeToString(WishPayload.serializer(), body), token)
        return json.decodeFromString(WishCreated.serializer(), text).item
    }

    /** PUT /api/wish/{id} —— 编辑愿望 */
    suspend fun updateWish(token: String, wishId: Long, body: WishPayload): WishItem {
        val text = send("PUT", "api/wish/$wishId", json.encodeToString(WishPayload.serializer(), body), token)
        return json.decodeFromString(WishCreated.serializer(), text).item
    }

    /** POST /api/wish/{id}/redeem —— 兑换（锁分） */
    suspend fun redeemWish(token: String, wishId: Long): RedeemResult {
        val text = send("POST", "api/wish/$wishId/redeem", "{}", token)
        return json.decodeFromString(RedeemResult.serializer(), text)
    }

    /** POST /api/redemptions/{id}/cancel —— 撤销兑换（2 小时内） */
    suspend fun cancelRedemption(token: String, redemptionId: Long) {
        send("POST", "api/redemptions/$redemptionId/cancel", "{}", token)
    }

    /** POST /api/redemptions/{id}/done —— 标记已兑现 */
    suspend fun doneRedemption(token: String, redemptionId: Long) {
        send("POST", "api/redemptions/$redemptionId/done", "{}", token)
    }

    // ---------------- 验收（小目标） ----------------

    /** POST /api/verifications/{id}/approve —— 通过对方提交的验收 */
    suspend fun approveVerification(token: String, verificationId: Long): ApproveResult {
        val text = send("POST", "api/verifications/$verificationId/approve", "{}", token)
        return json.decodeFromString(ApproveResult.serializer(), text)
    }

    /** POST /api/verifications/{id}/reject —— 驳回验收 */
    suspend fun rejectVerification(token: String, verificationId: Long, reason: String) {
        send(
            "POST",
            "api/verifications/$verificationId/reject",
            json.encodeToString(RejectRequest.serializer(), RejectRequest(reason)),
            token,
        )
    }

    // ---------------- 我的（me） ----------------

    /** GET /api/stats —— 本人或搭档的统计 */
    suspend fun getStats(token: String, userId: Long? = null): StatsResponse {
        val q = userId?.let { "?user=$it" } ?: ""
        val text = send("GET", "api/stats$q", null, token)
        return json.decodeFromString(StatsResponse.serializer(), text)
    }

    /** POST /api/me/password —— 改密码 */
    suspend fun changePassword(token: String, oldPassword: String, newPassword: String) {
        send(
            "POST",
            "api/me/password",
            json.encodeToString(PasswordChange.serializer(), PasswordChange(oldPassword, newPassword)),
            token,
        )
    }

    /** GET /api/settings —— 积分系数 */
    suspend fun getSettings(token: String): SettingsResponse {
        val text = send("GET", "api/settings", null, token)
        return json.decodeFromString(SettingsResponse.serializer(), text)
    }

    /** PUT /api/settings —— 改积分系数 */
    suspend fun updateSettings(token: String, points: PointsConfig) {
        send(
            "PUT",
            "api/settings",
            json.encodeToString(SettingsRequest.serializer(), SettingsRequest(points)),
            token,
        )
    }

    /** GET /api/backups —— 备份列表 */
    suspend fun listBackups(token: String): BackupsResponse {
        val text = send("GET", "api/backups", null, token)
        return json.decodeFromString(BackupsResponse.serializer(), text)
    }

    /** POST /api/backups —— 手动备份 */
    suspend fun createBackup(token: String) {
        send("POST", "api/backups", "{}", token)
    }

    // ---------------- 搭子私聊 ----------------

    /** GET /api/chat —— 搭档 + 未读数 + 最近 40 条消息（升序） */
    suspend fun getChat(token: String): ChatResponse {
        val text = send("GET", "api/chat", null, token)
        return json.decodeFromString(ChatResponse.serializer(), text)
    }

    /** GET /api/chat/messages?before=<id>&limit=40 —— 更早历史（升序） */
    suspend fun getChatMessages(token: String, before: Long, limit: Int = 40): List<ChatMessage> {
        val text = send("GET", "api/chat/messages?before=$before&limit=$limit", null, token)
        return json.decodeFromString(ChatMessagesResponse.serializer(), text).messages
    }

    /** POST /api/chat/messages {content} —— 发消息，返回写入的那条 */
    suspend fun sendChatMessage(token: String, content: String): ChatMessage {
        val body = json.encodeToString(SendChatRequest.serializer(), SendChatRequest(content))
        val text = send("POST", "api/chat/messages", body, token)
        return json.decodeFromString(SendChatResponse.serializer(), text).message
    }

    /** POST /api/chat/read {upToId?} —— 标记搭档发来的消息已读 */
    suspend fun markChatRead(token: String, upToId: Long?) {
        val body = json.encodeToString(MarkChatReadRequest.serializer(), MarkChatReadRequest(upToId))
        send("POST", "api/chat/read", body, token)
    }

    /** 复用同一 OkHttp 配置建 WebSocket（供 ChatWebSocket 用） */
    fun newWebSocket(request: Request, listener: okhttp3.WebSocketListener) =
        client.newWebSocket(request, listener)

    // ---------------- 状态（微信式） ----------------
    /** GET /api/status —— 我的 + 搭档的状态 */
    suspend fun getStatus(token: String): StatusResponse =
        json.decodeFromString(StatusResponse.serializer(), send("GET", "api/status", null, token))

    /** PUT /api/status —— 设置我的状态；返回 { status }（结构不同于 GET 的 { mine, partner }） */
    suspend fun setStatus(token: String, body: StatusPayload): UserStatus =
        json.decodeFromString(StatusSetResponse.serializer(), send("PUT", "api/status", json.encodeToString(StatusPayload.serializer(), body), token)).status

    /** DELETE /api/status —— 清除我的状态 */
    suspend fun clearStatus(token: String) {
        send("DELETE", "api/status", null, token)
    }

    // ---------------- 匹配大厅 ----------------

    /** GET /api/hall —— 我的发布 + 收/发邀请 + 大厅列表 */
    suspend fun getHall(token: String): HallState {
        val text = send("GET", "api/hall", null, token)
        return json.decodeFromString(HallState.serializer(), text)
    }

    /** POST /api/hall {note} —— 发布/更新我的找搭子信息 */
    suspend fun publishHall(token: String, note: String) {
        val body = json.encodeToString(PublishHallRequest.serializer(), PublishHallRequest(note))
        send("POST", "api/hall", body, token)
    }

    /** DELETE /api/hall —— 撤回我的发布 */
    suspend fun withdrawHall(token: String) {
        send("DELETE", "api/hall", null, token)
    }

    /** POST /api/hall/invite {toUserId} —— 邀请对方 */
    suspend fun inviteHall(token: String, toUserId: Long) {
        val body = json.encodeToString(HallInviteRequest.serializer(), HallInviteRequest(toUserId))
        send("POST", "api/hall/invite", body, token)
    }

    /** POST /api/hall/invite/{id}/accept —— 接受邀请（事务化成组） */
    suspend fun acceptHallInvite(token: String, id: Long) {
        send("POST", "api/hall/invite/$id/accept", "{}", token)
    }

    /** POST /api/hall/invite/{id}/decline —— 拒绝收到的邀请 */
    suspend fun declineHallInvite(token: String, id: Long) {
        send("POST", "api/hall/invite/$id/decline", "{}", token)
    }

    /** POST /api/hall/invite/{id}/cancel —— 取消我发出的邀请 */
    suspend fun cancelHallInvite(token: String, id: Long) {
        send("POST", "api/hall/invite/$id/cancel", "{}", token)
    }
}

// ---------------- 打卡 / 积分相关数据类 ----------------

@Serializable
data class GoalRef(
    val id: Long,
    val title: String = "",
    val emoji: String = "🎯",
    val duration_min: Int = 30,
    val difficulty: Int = 3,
    val freq_mode: String = "daily",
    val freq_n: Int = 1,
    val weekdays: String = "",
    val window_start: String? = null,
    val window_end: String? = null,
    val custom_points: Int? = null,
)

@Serializable
data class CheckedInfo(
    val id: Long = 0,
    val points: Int = 0,
    val durationMin: Int = 0,
    val evidenceText: String = "",
)

@Serializable
data class Todo(
    val goal: GoalRef,
    val dueToday: Boolean = false,
    val checked: CheckedInfo? = null,
    val pointsNow: Int = 0,
    val streak: Int = 0,
)

@Serializable
data class PartnerTodayItem(
    val id: Long = 0,
    val goalTitle: String = "",
    val goalEmoji: String = "🎯",
    val points: Int = 0,
    val durationMin: Int = 0,
    val evidenceText: String = "",
)

@Serializable
data class PartnerToday(
    val checked: Int = 0,
    val expected: Int = 0,
    val list: List<PartnerTodayItem> = emptyList(),
)

@Serializable
data class StageGoal(
    val id: Long,
    val title: String = "",
    val emoji: String = "🏁",
    val status: String = "",
    val total_points: Int? = null,
    val accept_criteria: String? = null,
    val est_total_min: Int? = null,
)

@Serializable
data class HomeResponse(
    val me: UserDto? = null,
    val partner: UserDto? = null,
    val balance: Int = 0,
    val monthPoints: Int = 0,
    val currentStreak: Int = 0,
    val bestStreak: Int = 0,
    val todos: List<Todo> = emptyList(),
    val stageGoals: List<StageGoal> = emptyList(),
    val currentPlanGoals: List<PlanGoalDto> = emptyList(),
    val pendingCount: Int = 0,
    val partnerToday: PartnerToday? = null,
    val today: String = "",
)

@Serializable
data class CheckinRequest(
    val duration_min: Int? = null,
    val evidence_text: String? = null,
)

@Serializable
data class CheckinResult(
    val points: Int = 0,
    val streak: Int = 0,
    val balance: Int = 0,
    val bonuses: List<String> = emptyList(),
)

@Serializable
data class LedgerItem(
    val id: Long = 0,
    val delta: Int = 0,
    val balance_after: Int = 0,
    val type: String = "",
    val typeLabel: String = "",
    val note: String = "",
    val created_at: String = "",
)

@Serializable
data class LedgerResponse(val ledger: List<LedgerItem> = emptyList())

// ---------------- 「我们」页 ----------------

@Serializable
data class UserStats(
    val balance: Int = 0,
    val monthPoints: Int = 0,
    val currentStreak: Int = 0,
    val bestStreak: Int = 0,
    val completion: Int? = null,
    val timeInvestMin: Int = 0,
)

@Serializable
data class PartnerCheckin(
    val id: Long = 0,
    val goalId: Long = 0,
    val goalTitle: String = "",
    val goalEmoji: String = "🎯",
    val points: Int = 0,
    val durationMin: Int = 0,
    val evidenceText: String = "",
    val evidenceUrl: String? = null,
    val status: String = "credited",
    val createdAt: String = "",
)

@Serializable
data class PartnerGoalItem(
    val id: Long = 0,
    val title: String = "",
    val emoji: String = "🎯",
    val freq_mode: String = "daily",
    val freq_n: Int = 1,
    val duration_min: Int = 30,
    val status: String = "",
    val streak: Int = 0,
    val perCheckinPoints: Int = 0,
)

@Serializable
data class TodaySummary(
    val dueGoals: Int = 0,
    val expected: Int = 0,
    val checked: Int = 0,
)

@Serializable
data class PartnerPageResponse(
    val partner: UserDto? = null,
    val partnerStats: UserStats? = null,
    val myStats: UserStats? = null,
    val partnerGoals: List<PartnerGoalItem> = emptyList(),
    val partnerToday: List<PartnerCheckin> = emptyList(),
    val pendingVerifications: List<PendingVerification> = emptyList(),
    val today: TodaySummary? = null,
    val partnerRecentRedemptions: List<Redemption> = emptyList(),
)

@Serializable
data class PendingVerification(
    val id: Long = 0,
    val goal_title: String = "",
    val goal_emoji: String = "🏁",
    val total_points: Int = 0,
    val accept_criteria: String? = null,
    val submitter_username: String = "",
)

@Serializable
data class RejectRequest(val reason: String)

// ---------------- 目标（goals） ----------------

@Serializable
data class Milestone(val n: Int = 0, val p: Int = 0)

@Serializable
data class GoalDetail(
    val id: Long = 0,
    val owner_id: Long = 0,
    val type: String = "daily",
    val title: String = "",
    val emoji: String = "🎯",
    val description: String = "",
    val freq_mode: String = "daily",
    val freq_n: Int = 1,
    val weekdays: String = "",
    val window_start: String? = null,
    val window_end: String? = null,
    val duration_min: Int = 30,
    val difficulty: Int = 3,
    val start_date: String = "",
    val end_date: String? = null,
    val status: String = "draft",
    val streak_count: Int = 0,
    val streak_best: Int = 0,
    val est_total_min: Int? = null,
    val accept_criteria: String? = null,
    val total_points: Int? = null,
    val custom_points: Int? = null,
    val perCheckinPoints: Int = 0,
)

@Serializable
data class GoalsResponse(val goals: List<GoalDetail> = emptyList())

@Serializable
data class GoalCreated(val goal: GoalDetail)

@Serializable
data class WeekCell(
    val date: String = "",
    val wd: Int = 0,
    val state: String = "future", // done / missed / future / todo
    val points: Int = 0,
    val makeup: Boolean = false,
)

@Serializable
data class WeekGoal(
    val id: Long = 0,
    val title: String = "",
    val emoji: String = "🎯",
    val status: String = "",
    val type: String = "daily",
    val freq_mode: String = "daily",
    val freq_n: Int = 1,
    val weekdays: String = "",
    val perCheckinPoints: Int = 0,
    val custom_points: Int? = null,
    val streak: Int = 0,
    val cells: List<WeekCell> = emptyList(),
)

@Serializable
data class WeekView(
    val weekStart: String = "",
    val weekEnd: String = "",
    val today: String = "",
    val weekPoints: Int = 0,
    val weekDone: Int = 0,
    val weekExpected: Int = 0,
    val goals: List<WeekGoal> = emptyList(),
)

@Serializable
data class MonthCell(
    val date: String = "",
    val state: String = "future", // done / future / off / blank / missed / todo
    val points: Int = 0,
)

@Serializable
data class MonthGoal(
    val id: Long = 0,
    val title: String = "",
    val emoji: String = "🎯",
    val status: String = "",
    val type: String = "daily",
    val perCheckinPoints: Int = 0,
    val custom_points: Int? = null,
    val streak: Int = 0,
    val monthCount: Int = 0,
    val monthPoints: Int = 0,
    val cells: List<MonthCell> = emptyList(),
)

@Serializable
data class MonthView(
    val month: String = "",
    val today: String = "",
    val monthPoints: Int = 0,
    val monthDone: Int = 0,
    val monthExpected: Int = 0,
    val goals: List<MonthGoal> = emptyList(),
)

@Serializable
data class GoalPayload(
    val title: String,
    val type: String = "daily",
    val emoji: String? = null,
    val description: String? = null,
    val freq_mode: String? = null,
    val freq_n: Int? = null,
    val weekdays: String? = null,
    val window_start: String? = null,
    val window_end: String? = null,
    val duration_min: Int? = null,
    val difficulty: Int? = null,
    val start_date: String? = null,
    val end_date: String? = null,
    val est_total_min: Int? = null,
    val accept_criteria: String? = null,
    val custom_points: Int? = null,
)

// ---------------- 愿望单（wish） ----------------

@Serializable
data class WishItem(
    val id: Long = 0,
    val owner_id: Long = 0,
    val category: String = "goods",
    val title: String = "",
    val description: String = "",
    val emoji: String = "🎁",
    val price_cny: Double = 0.0,
    val points_cost: Int = 0,
    val image_id: Long? = null,
    val cooldown_days: Int = 0,
    val status: String = "active",
    val redeemable: Boolean = false,
    val cooldownMsg: String? = null,
)

@Serializable
data class Redemption(
    val id: Long = 0,
    val wish_item_id: Long = 0,
    val points_locked: Int = 0,
    val points_charged: Int = 0,
    val status: String = "applied",
    val applied_at: String = "",
    val item_title: String = "",
    val item_emoji: String = "🎁",
    val item_category: String = "goods",
)

@Serializable
data class WishListResponse(
    val items: List<WishItem> = emptyList(),
    val redemptions: List<Redemption> = emptyList(),
    val balance: Int = 0,
)

@Serializable
data class WishCreated(val item: WishItem)

@Serializable
data class WishPayload(
    val title: String,
    val category: String = "goods",
    val description: String? = null,
    val emoji: String? = null,
    val price_cny: Double,
    val points_cost: Int? = null,
    val cooldown_days: Int? = null,
)

@Serializable
data class RedeemResult(
    val redemption: Redemption? = null,
    val balance: Int = 0,
    val cooldownDays: Int = 0,
)

// ---------------- 验收 ----------------

@Serializable
data class ApproveResult(
    val points: Int = 0,
    val overdue: Boolean = false,
)

// ---------------- 我的（me） ----------------

@Serializable
data class StatsInner(
    val balance: Int = 0,
    val monthPoints: Int = 0,
    val bestStreak: Int = 0,
    val currentStreak: Int = 0,
    val completion: Int? = null,
    val timeInvestMin: Int = 0,
    val monthCheckinCount: Int = 0,
    val monthExpected: Int = 0,
    val rejectedCount: Int = 0,
)

@Serializable
data class StatsResponse(
    val user: UserDto? = null,
    val stats: StatsInner? = null,
)

@Serializable
data class PasswordChange(val oldPassword: String, val newPassword: String)

@Serializable
data class Difficulty(val `1`: Double = 1.0, val `2`: Double = 1.2, val `3`: Double = 1.5, val `4`: Double = 1.8, val `5`: Double = 2.2)

@Serializable
data class Freq(val daily: Double = 1.0, val weekly34: Double = 1.2, val weekly12: Double = 1.5, val weekdays: Double = 1.0)

@Serializable
data class Window(val `in`: Double = 1.1, val none: Double = 1.0, val out: Double = 0.8)

@Serializable
data class PointsConfig(
    val unit: Double = 0.5,
    val cap: Int = 60,
    val maxPer: Int = 300,
    val difficulty: Difficulty = Difficulty(),
    val freq: Freq = Freq(),
    val window: Window = Window(),
    val milestones: List<Milestone> = emptyList(),
)

@Serializable
data class SettingsResponse(val points: PointsConfig)

@Serializable
data class SettingsRequest(val points: PointsConfig)

@Serializable
data class BackupEntry(
    val name: String = "",
    val size: Long = 0,
    val mtime: String = "",
)

@Serializable
data class BackupsResponse(val backups: List<BackupEntry> = emptyList())

@Serializable
data class SubmitRequest(val self_statement: String)

// ---------------- 搭子私聊 ----------------

@Serializable
data class ChatMessage(
    val id: Long = 0,
    val senderId: Long = 0,
    val content: String = "",
    val createdAt: String = "",
    val readAt: String? = null,
)

@Serializable
data class ChatResponse(
    val partner: UserDto? = null,
    val unread: Int = 0,
    val messages: List<ChatMessage> = emptyList(),
)

@Serializable
data class ChatMessagesResponse(val messages: List<ChatMessage> = emptyList())

@Serializable
data class SendChatRequest(val content: String)

@Serializable
data class SendChatResponse(val message: ChatMessage)

@Serializable
data class MarkChatReadRequest(val upToId: Long? = null)

// ---------------- 大目标与计划链（P1-#8） ----------------

@Serializable
data class BigGoalDto(
    val id: Long = 0,
    val title: String = "",
    val emoji: String = "🏔️",
    val description: String = "",
    val progress: Int = 0,
    val progress_note: String = "",
    val progress_at: String? = null,
    val status: String = "active",
    val done: Int = 0,
    val total: Int = 0,
)

@Serializable
data class BigGoalListResponse(val bigGoals: List<BigGoalDto> = emptyList())

/** 链上小目标（含未启动 planned 的） */
@Serializable
data class ChainGoalDto(
    val id: Long = 0,
    val title: String = "",
    val emoji: String? = null,
    val description: String? = null,
    val status: String = "",
    val accept_criteria: String? = null,
    val planned_date: String? = null,
    val plan_order: Int? = null,
    val plan_status: String? = null,
)

@Serializable
data class BigGoalDetailResponse(
    val bigGoal: BigGoalDto = BigGoalDto(),
    val chain: List<ChainGoalDto> = emptyList(),
    val done: Int = 0,
    val total: Int = 0,
)

@Serializable
data class BigGoalPayload(
    val title: String,
    val emoji: String? = null,
    val description: String? = null,
)

@Serializable
data class ChainEditPayload(
    val planned_date: String? = null,
    val title: String? = null,
    val accept_criteria: String? = null,
    val plan_order: Int? = null,
)

@Serializable
data class ShiftPayload(val from_date: String, val days: Int)

// ---------------- AI 日报 / 设置（P2-#15） ----------------

@Serializable
data class DiaryDto(
    val id: Long = 0,
    val diary_date: String = "",
    val content: String = "",
    val edited: Boolean = false,
    val shared: Boolean = false,
)

@Serializable
data class DiaryTodayResponse(val today: String = "", val diary: DiaryDto? = null)

@Serializable
data class UserSettings(
    val reportChanges: Boolean = true,
    val dailyEnabled: Boolean = false,
)

@Serializable
data class AiSettingsPayload(
    val reportChanges: Boolean = true,
    val dailyEnabled: Boolean = false,
)

/** 一条画像变更里的单个块改动 */
@Serializable
data class ProfileChangeDetailDto(
    val op: String = "",
    val block: String = "",
    val reason: String = "",
    val evidence: String = "",
    val before: String = "",
    val after: String = "",
)

@Serializable
data class ProfileChangeDto(
    val id: Long = 0,
    val workflow: String = "",
    val summary: String = "",
    val detail: List<ProfileChangeDetailDto> = emptyList(),
    val reported: Boolean = true,
    val read: Boolean = false,
    val versionId: Long? = null,
    val createdAt: String = "",
)

@Serializable
data class ProfileChangesResponse(
    val unread: Int = 0,
    val items: List<ProfileChangeDto> = emptyList(),
)

@Serializable
data class ProfileVersionDto(
    val id: Long = 0,
    val changedBy: String = "",
    val reason: String = "",
    val createdAt: String = "",
    val blockCount: Int = 0,
)

@Serializable
data class ProfileVersionsResponse(val versions: List<ProfileVersionDto> = emptyList())

@Serializable
data class RollbackResponse(val restored: Int = 0, val versionId: Long = 0)

@Serializable
data class BigGoalCreated(val bigGoal: BigGoalDto = BigGoalDto())

/** 首页「当前小目标」卡（计划链已释放的，未启动的不出现） */
@Serializable
data class PlanGoalDto(
    val id: Long = 0,
    val title: String = "",
    val emoji: String? = null,
    val planned_date: String? = null,
    val status: String = "",
    val big_goal_id: Long = 0,
    val big_goal_title: String = "",
)

// ---------------- 匹配大厅 ----------------

@Serializable
data class HallUser(
    val id: Long = 0,
    val username: String = "",
    val avatar: String? = null,
)

@Serializable
data class HallListing(
    val userId: Long = 0,
    val username: String = "",
    val avatar: String? = null,
    val note: String = "",
    val goalSummary: String = "",
    val createdAt: String = "",
    val relation: String = "none", // none / invitedByMe / invitedMe
)

/** 我的发布（后端只回 note/goalSummary/createdAt，不含 userId 等） */
@Serializable
data class HallMyListing(
    val note: String = "",
    val goalSummary: String = "",
    val createdAt: String = "",
)

@Serializable
data class HallInvite(
    val id: Long = 0,
    val fromUser: HallUser? = null,
    val toUser: HallUser? = null,
    val createdAt: String = "",
)

@Serializable
data class HallState(
    val myListing: HallMyListing? = null,
    val incoming: List<HallInvite> = emptyList(),
    val outgoing: List<HallInvite> = emptyList(),
    val listings: List<HallListing> = emptyList(),
)

@Serializable
data class PublishHallRequest(val note: String)

@Serializable
data class HallInviteRequest(val toUserId: Long)

// ---------------- 状态（微信式） ----------------

@Serializable
data class UserStatus(
    val key: String = "",
    val emoji: String = "🐾",
    val label: String = "",
    val text: String = "",
    val group: String = "mood",
    val at: String? = null,
)

@Serializable
data class StatusPartner(
    val username: String = "",
    val avatar: String = "",
    val status: UserStatus? = null,
)

@Serializable
data class StatusResponse(
    val mine: UserStatus? = null,
    val partner: StatusPartner? = null,
)

@Serializable
data class StatusSetResponse(
    val status: UserStatus,
)

@Serializable
data class StatusPayload(
    val key: String,
    val emoji: String,
    val label: String,
    val text: String = "",
    val group: String = "mood",
)
