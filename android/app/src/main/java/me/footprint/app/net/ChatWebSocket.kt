package me.footprint.app.net

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/**
 * 搭子私聊的 WebSocket 客户端（服务端 → 客户端单向推送）。
 *
 * 只用 OkHttp 自带的 WebSocket，不引额外依赖。握手带 `Cookie: fp_token=…`，
 * 断线后指数退避重连；收到 4401 说明会话已失效，停掉并通知上层退出登录。
 *
 * 推送帧形如 { type:"message", message:{...}, unread?:number }：
 *   - `unread` 只在「发给搭档」时带（= 对方视角的未读数）；同步自己其它端时不带。
 */
class ChatWebSocket(
    private val onMessage: (ChatMessage, Int?) -> Unit,
    private val onAuthFailed: () -> Unit,
) {

    companion object {
        private const val TAG = "FootprintChatWs"

        /** 从 BASE_URL 推导 ws(s)://host/ws */
        fun wsUrl(): String {
            val base = Api.baseUrl().trimEnd('/')
            val wsBase = when {
                base.startsWith("https://") -> base.replaceFirst("https://", "wss://")
                base.startsWith("http://") -> base.replaceFirst("http://", "ws://")
                else -> base
            }
            return "$wsBase/ws"
        }
    }

    @Serializable
    private data class WsFrame(
        val type: String = "",
        val message: ChatMessage? = null,
        val unread: Int? = null,
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var ws: WebSocket? = null
    private var token: String? = null

    @Volatile
    private var closedByUser = false
    private var reconnectAttempt = 0
    private var reconnectJob: Job? = null

    fun connect(t: String) {
        closedByUser = false
        token = t
        open()
    }

    fun disconnect() {
        closedByUser = true
        reconnectJob?.cancel()
        reconnectJob = null
        ws?.close(1000, "user logout")
        ws = null
        token = null
        reconnectAttempt = 0
    }

    private fun open() {
        val t = token ?: return
        val request = Request.Builder()
            .url(wsUrl())
            .header("Cookie", "fp_token=$t")
            .build()
        ws = Api.newWebSocket(request, listener)
    }

    private val listener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            reconnectAttempt = 0
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val frame = try {
                Api.json.decodeFromString(WsFrame.serializer(), text)
            } catch (e: Exception) {
                Log.w(TAG, "无法解析推送帧：$text", e)
                return
            }
            val m = frame.message ?: return
            if (frame.type == "message") {
                onMessage(m, frame.unread)
            }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (code == 4401) {
                Log.w(TAG, "会话失效，断开（4401）")
                onAuthFailed()
                return
            }
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.w(TAG, "WS 断开：${t.message}")
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        if (closedByUser) return
        if (reconnectJob?.isActive == true) return
        reconnectJob = scope.launch {
            val delayMs = (1000L shl reconnectAttempt.coerceAtMost(5)) // 1s、2s、4s … 封顶 32s
            reconnectAttempt++
            delay(delayMs)
            if (!closedByUser) open()
        }
    }
}
