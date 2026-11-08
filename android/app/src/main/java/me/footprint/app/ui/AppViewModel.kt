package me.footprint.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.footprint.app.net.Api
import me.footprint.app.net.ApiException
import me.footprint.app.net.AppUsage
import me.footprint.app.net.ChatMessage
import me.footprint.app.net.ChatWebSocket
import me.footprint.app.net.HomeResponse
import me.footprint.app.net.HallState
import me.footprint.app.net.PartnerResponse
import me.footprint.app.net.Session
import me.footprint.app.net.UserDto
import me.footprint.app.usage.UsageAccess
import me.footprint.app.usage.UsageCollector
import me.footprint.app.usage.UsageReporter
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * 全局状态：登录态 + 首页数据。
 * 只有一个 ViewModel（M1 只有登录页/主页两个界面），不做更细的拆分。
 */
class AppViewModel(app: Application) : AndroidViewModel(app) {

    // ---------------- 登录 ----------------

    data class LoginState(
        val username: String = "",
        val busy: Boolean = false,
        val error: String? = null,
    )

    private val _login = MutableStateFlow(LoginState())
    val login: StateFlow<LoginState> = _login.asStateFlow()

    // ---------------- 会话 ----------------

    private val _loggedIn = MutableStateFlow(Session.isLoggedIn(app))
    val loggedIn: StateFlow<Boolean> = _loggedIn.asStateFlow()

    private val _myName = MutableStateFlow(Session.username(app).orEmpty())
    val myName: StateFlow<String> = _myName.asStateFlow()

    /** 使用情况访问权限：每次回到前台都要重新查（用户可能刚从系统设置回来） */
    private val _granted = MutableStateFlow(UsageAccess.isGranted(app))
    val granted: StateFlow<Boolean> = _granted.asStateFlow()

    // ---------------- 首页 ----------------

    /** 本人今天的本地采集结果；null = 还没采集过 */
    private val _mine = MutableStateFlow<UsageCollector.UsageSnapshot?>(null)
    val mine: StateFlow<UsageCollector.UsageSnapshot?> = _mine.asStateFlow()

    /** 对方数据；null = 还没拉过 */
    private val _partner = MutableStateFlow<PartnerResponse?>(null)
    val partner: StateFlow<PartnerResponse?> = _partner.asStateFlow()

    /** 本人上报状态提示（"已同步"/"未同步，下次进前台重试"） */
    private val _syncNote = MutableStateFlow<String?>(null)
    val syncNote: StateFlow<String?> = _syncNote.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    private val _loadError = MutableStateFlow<String?>(null)
    val loadError: StateFlow<String?> = _loadError.asStateFlow()

    // ---------------- 打卡 / 积分（与 Web 版同一套后端） ----------------

    /** 首页聚合数据：余额、连续天数、今日待办、小目标、对方今日打卡 */
    private val _home = MutableStateFlow<HomeResponse?>(null)
    val home: StateFlow<HomeResponse?> = _home.asStateFlow()

    /** 打卡进行中（防止连点） */
    private val _checkinBusy = MutableStateFlow<Long?>(null)
    val checkinBusy: StateFlow<Long?> = _checkinBusy.asStateFlow()

    /** 一次性的提示消息（打卡成功/失败），UI 显示后清空 */
    private val _toast = MutableStateFlow<String?>(null)
    val toast: StateFlow<String?> = _toast.asStateFlow()

    fun consumeToast() {
        _toast.value = null
    }

    // ---------------- 搭子私聊 ----------------

    private val _chatMessages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val chatMessages: StateFlow<List<ChatMessage>> = _chatMessages.asStateFlow()

    private val _chatUnread = MutableStateFlow(0)
    val chatUnread: StateFlow<Int> = _chatUnread.asStateFlow()

    private val _chatPartner = MutableStateFlow<UserDto?>(null)
    val chatPartner: StateFlow<UserDto?> = _chatPartner.asStateFlow()

    /** 聊天数据是否已加载过（ChatScreen 据此区分「加载中」与「真的没消息」） */
    private val _chatLoaded = MutableStateFlow(false)
    val chatLoaded: StateFlow<Boolean> = _chatLoaded.asStateFlow()

    private var chatWs: ChatWebSocket? = null

    private fun connectChatWs() {
        val token = Session.token(getApplication()) ?: return
        chatWs?.disconnect()
        chatWs = ChatWebSocket(
            onMessage = { m, unread ->
                val list = _chatMessages.value
                if (list.none { it.id == m.id }) {
                    _chatMessages.value = list + m
                }
                // 未读数只在「发给搭档」的推送里带；同步自己其它端不带，不动红点
                if (unread != null) {
                    if (chatOpen) {
                        // 聊天页正开着，直接标记已读，不亮红点
                        val t = Session.token(getApplication())
                        if (t != null) {
                            viewModelScope.launch {
                                try { Api.markChatRead(t, m.id) } catch (_: Exception) {}
                            }
                        }
                    } else {
                        _chatUnread.value = unread
                    }
                }
            },
            onAuthFailed = {
                Session.clear(getApplication())
                _loggedIn.value = false
                _chatUnread.value = 0
            },
        )
        chatWs?.connect(token)
    }

    private fun disconnectChatWs() {
        chatWs?.disconnect()
        chatWs = null
    }

    /** 拉取聊天历史 + 未读数（打开 ChatScreen 时 / 登录后调用） */
    fun loadChat() {
        val token = Session.token(getApplication()) ?: return
        viewModelScope.launch {
            try {
                val r = Api.getChat(token)
                _chatPartner.value = r.partner
                _chatMessages.value = r.messages
                _chatUnread.value = r.unread
                _chatLoaded.value = true
            } catch (e: Exception) {
                // 失败不打断已有数据，静默
            }
        }
    }

    /** 发消息；成功回调 null，失败回调错误文案 */
    fun sendChatMessage(content: String, onDone: (String?) -> Unit) {
        val token = Session.token(getApplication()) ?: return
        val text = content.trim()
        if (text.isEmpty()) return
        viewModelScope.launch {
            try {
                val m = Api.sendChatMessage(token, text)
                val list = _chatMessages.value
                if (list.none { it.id == m.id }) {
                    _chatMessages.value = list + m
                }
                onDone(null)
            } catch (e: Exception) {
                onDone(e.message ?: "发送失败")
            }
        }
    }

    /** 标记搭档发来的消息已读（打开 ChatScreen 后把红点清掉） */
    fun markChatRead(upToId: Long?) {
        val token = Session.token(getApplication()) ?: return
        viewModelScope.launch {
            try {
                Api.markChatRead(token, upToId)
            } catch (e: Exception) {
                // 静默
            } finally {
                _chatUnread.value = 0
            }
        }
    }

    /** 本地直接清未读红点（无需等网络） */
    fun clearChatUnread() {
        _chatUnread.value = 0
    }

    /** 聊天页是否处于打开状态（打开时收到推送直接已读、不亮红点） */
    private var chatOpen = false

    fun setChatOpen(open: Boolean) {
        chatOpen = open
        if (open) _chatUnread.value = 0
    }

    // ---------------- 匹配大厅 ----------------

    private val _hall = MutableStateFlow<HallState?>(null)
    val hall: StateFlow<HallState?> = _hall.asStateFlow()

    /** 拉取大厅全部状态（我的发布 + 收/发邀请 + 列表） */
    fun loadHall() {
        val token = Session.token(getApplication()) ?: return
        viewModelScope.launch {
            try {
                _hall.value = Api.getHall(token)
            } catch (e: Exception) {
                // 静默：大厅拿不到数据就保持旧状态
            }
        }
    }

    fun publishHall(note: String, onDone: (String?) -> Unit) {
        val token = Session.token(getApplication()) ?: return
        viewModelScope.launch {
            try {
                Api.publishHall(token, note)
                _hall.value = Api.getHall(token)
                onDone(null)
            } catch (e: Exception) {
                onDone(e.message ?: "发布失败")
            }
        }
    }

    fun withdrawHall(onDone: (String?) -> Unit) {
        val token = Session.token(getApplication()) ?: return
        viewModelScope.launch {
            try {
                Api.withdrawHall(token)
                _hall.value = Api.getHall(token)
                onDone(null)
            } catch (e: Exception) {
                onDone(e.message ?: "撤回失败")
            }
        }
    }

    fun inviteHall(toUserId: Long, onDone: (String?) -> Unit) {
        val token = Session.token(getApplication()) ?: return
        viewModelScope.launch {
            try {
                Api.inviteHall(token, toUserId)
                _hall.value = Api.getHall(token)
                onDone(null)
            } catch (e: Exception) {
                onDone(e.message ?: "邀请失败")
            }
        }
    }

    /** 接受邀请并组队；成功后刷新首页/搭档数据 */
    fun acceptHallInvite(id: Long, onDone: (String?) -> Unit) {
        val token = Session.token(getApplication()) ?: return
        viewModelScope.launch {
            try {
                Api.acceptHallInvite(token, id)
                _hall.value = null
                onDone(null)
                refreshAll()
            } catch (e: Exception) {
                onDone(e.message ?: "接受失败")
            }
        }
    }

    fun declineHallInvite(id: Long, onDone: (String?) -> Unit) {
        val token = Session.token(getApplication()) ?: return
        viewModelScope.launch {
            try {
                Api.declineHallInvite(token, id)
                _hall.value = Api.getHall(token)
                onDone(null)
            } catch (e: Exception) {
                onDone(e.message ?: "操作失败")
            }
        }
    }

    fun cancelHallInvite(id: Long, onDone: (String?) -> Unit) {
        val token = Session.token(getApplication()) ?: return
        viewModelScope.launch {
            try {
                Api.cancelHallInvite(token, id)
                _hall.value = Api.getHall(token)
                onDone(null)
            } catch (e: Exception) {
                onDone(e.message ?: "操作失败")
            }
        }
    }

    init {
        // 冷启动时若已登录（上次会话留存），也要把 WS 连上并拉一次未读
        if (_loggedIn.value) {
            connectChatWs()
            loadChat()
        }
    }

    // ---------------- 登录动作 ----------------

    fun onUsernameChange(v: String) {
        _login.value = _login.value.copy(username = v, error = null)
    }

    fun login(username: String, password: String) {
        val name = username.trim()
        if (name.isEmpty() || password.isEmpty()) {
            _login.value = _login.value.copy(error = "用户名和密码都要填")
            return
        }
        _login.value = _login.value.copy(busy = true, error = null)
        viewModelScope.launch {
            try {
                val resp = Api.login(name, password) { token ->
                    Session.saveToken(getApplication(), token)
                    Session.saveUsername(getApplication(), name)
                }
                _myName.value = resp.user?.username ?: name
                _loggedIn.value = true
                _login.value = _login.value.copy(busy = false, error = null)
                refreshAll()
                connectChatWs()
                loadChat()
            } catch (e: Exception) {
                _login.value = _login.value.copy(
                    busy = false,
                    error = e.message ?: "登录失败",
                )
            }
        }
    }

    fun logout() {
        Session.clear(getApplication())
        disconnectChatWs()
        _loggedIn.value = false
        _myName.value = ""
        _mine.value = null
        _partner.value = null
        _syncNote.value = null
        _login.value = LoginState()
        _chatMessages.value = emptyList()
        _chatUnread.value = 0
        _chatPartner.value = null
        _chatLoaded.value = false
        _hall.value = null
    }

    // ---------------- 刷新 / 上报 ----------------

    /** 回到前台时调用：先补报（节流 60 秒），再刷新两侧数据 */
    fun refreshAll() {
        if (!_loggedIn.value) return
        viewModelScope.launch {
            _refreshing.value = true
            _loadError.value = null

            _granted.value = UsageAccess.isGranted(getApplication())

            // 1. 上报（进前台上报一次；失败只留标记，不弹窗不阻塞）
            val outcome = UsageReporter.reportNow(getApplication())
            _syncNote.value = when (outcome) {
                is UsageReporter.Outcome.Reported -> null
                UsageReporter.Outcome.Skipped -> null
                is UsageReporter.Outcome.Failed -> "未同步：${outcome.message}"
                is UsageReporter.Outcome.Ignored -> if (outcome.reason.contains("权限")) {
                    "未开启使用情况访问，数据不会同步"
                } else {
                    null
                }
            }

            // 2. 本地采集（未授权时 grant=false，页面显示空态而不是 0）
            _mine.value = UsageCollector.collect(getApplication())

            // 3. 对方数据
            val token = Session.token(getApplication())
            if (token != null) {
                try {
                    _partner.value = Api.getPartner(token)
                } catch (e: ApiException) {
                    if (e.code == 401) {
                        Session.clear(getApplication())
                        _loggedIn.value = false
                    } else if (e.code == 404) {
                        // 还没有搭档，属于正常情况，不算错误
                        _partner.value = null
                    } else {
                        _loadError.value = e.message
                    }
                } catch (e: Exception) {
                    _loadError.value = e.message ?: "加载失败"
                }

                // 4. 首页聚合（打卡/积分）。失败不影响时长卡片
                try {
                    _home.value = Api.getHome(token)
                } catch (e: ApiException) {
                    if (e.code == 401) {
                        Session.clear(getApplication())
                        _loggedIn.value = false
                    }
                } catch (e: Exception) {
                    // 静默：时长卡片仍然可用
                }
            }

            _refreshing.value = false
        }
    }

    /** 给某个日常目标打卡；成功后自动刷新首页与流水 */
    fun checkin(goalId: Long, durationMin: Int?, evidenceText: String?) {
        val token = Session.token(getApplication()) ?: return
        if (_checkinBusy.value != null) return
        _checkinBusy.value = goalId
        viewModelScope.launch {
            try {
                val r = Api.checkin(token, goalId, durationMin, evidenceText)
                val bonus = if (r.bonuses.isNotEmpty()) "（${r.bonuses.joinToString("、")}）" else ""
                _toast.value = "打卡成功 +${r.points} 分$bonus"
                refreshAll()
            } catch (e: ApiException) {
                _toast.value = e.message ?: "打卡失败"
            } catch (e: Exception) {
                _toast.value = e.message ?: "打卡失败"
            } finally {
                _checkinBusy.value = null
            }
        }
    }

    /** 从系统设置返回时只更新权限状态，数据交给 refreshAll */
    fun refreshGranted() {
        _granted.value = UsageAccess.isGranted(getApplication())
    }

    companion object {
        private val DISPLAY_ZONE: ZoneId = ZoneId.of("Asia/Shanghai")
        private val HM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

        /** 从任意时间串里抓 "HH:mm"，后端万一是 "2026-11-03 10:00:00" 这种非 ISO 也能显示 */
        private val HM_REGEX = Regex("""\d{2}:\d{2}""")

        /** 秒 → "X 小时 Y 分"；不足 1 分钟给"不到 1 分钟"（这里只用于服务端/自己的真实数据） */
        fun humanDuration(seconds: Long): String {
            if (seconds <= 0L) return "0 分钟"
            if (seconds < 60L) return "不到 1 分钟"
            val h = seconds / 3600L
            val m = (seconds % 3600L) / 60L
            return when {
                h > 0 && m > 0 -> "$h 小时 $m 分"
                h > 0 -> "$h 小时"
                else -> "$m 分钟"
            }
        }

        /** 后端 lastReportAt 是 ISO 时间，转成上海时区的 HH:mm（对方页显示"ta 最近一次同步于 HH:mm"） */
        fun clockOf(iso: String?): String? {
            if (iso.isNullOrBlank()) return null
            return try {
                Instant.parse(iso).atZone(DISPLAY_ZONE).format(HM)
            } catch (e: Exception) {
                // 后端偶尔会给 "2026-11-03 10:00:00" 这种带空格的格式，简单截一个冒号时间兜底
                val m = HM_REGEX.find(iso)
                m?.value
            }
        }

        /** 取前 n 个（页面只列前 5） */
        fun top(apps: List<AppUsage>, n: Int = 5): List<AppUsage> = apps.take(n)
    }
}
