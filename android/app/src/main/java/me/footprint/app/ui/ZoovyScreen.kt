package me.footprint.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import me.footprint.app.net.Api
import me.footprint.app.net.ApiException
import me.footprint.app.net.Session
import me.footprint.app.net.ZoovyCard
import me.footprint.app.net.ZoovyDraft
import me.footprint.app.net.ZoovyMessage
import me.footprint.app.net.ZoovyRequest
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType
import java.util.UUID

private class RunningZoovyTurn(val requestId: String) {
    var cancelled = false
}

@Composable
fun ZoovyScreen(onBack: () -> Unit, bigGoalId: Long? = null) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    var messages by remember { mutableStateOf<List<ZoovyMessage>>(emptyList()) }
    var text by remember { mutableStateOf("") }
    var pending by remember { mutableStateOf<ZoovyRequest?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var operationStatus by remember { mutableStateOf<String?>(null) }
    var runningTurn by remember { mutableStateOf<RunningZoovyTurn?>(null) }
    var stoppingRequestId by remember { mutableStateOf<String?>(null) }

    fun markCancelled(turn: RunningZoovyTurn) {
        turn.cancelled = true
        if (pending?.requestId == turn.requestId) pending = null
        error = null
        operationStatus = "已停止运行。"
    }

    suspend fun runCall(turn: RunningZoovyTurn? = null, action: suspend (String) -> Unit) {
        if (busy) return
        busy = true
        runningTurn = turn
        error = null
        operationStatus = null
        try {
            val token = Session.token(context) ?: throw ApiException("请先登录")
            action(token)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (turn != null && (turn.cancelled || (e as? ApiException)?.serverCode == "turn_cancelled")) {
                markCancelled(turn)
            } else error = e.message ?: "请求失败，请重试"
        } finally {
            runningTurn = null
            busy = false
        }
    }

    fun stopRunning() {
        val turn = runningTurn ?: return
        if (turn.cancelled || stoppingRequestId == turn.requestId) return
        stoppingRequestId = turn.requestId
        scope.launch {
            try {
                val token = Session.token(context) ?: throw ApiException("请先登录")
                val stopped = Api.cancelZoovyTurn(token, turn.requestId)
                if (runningTurn === turn) {
                    if (stopped) markCancelled(turn) else operationStatus = "当前运行已结束或尚未开始。"
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (runningTurn === turn) error = e.message ?: "停止失败，请重试"
            } finally {
                if (stoppingRequestId == turn.requestId) stoppingRequestId = null
            }
        }
    }

    fun appendCard(card: ZoovyCard) {
        messages = messages + ZoovyMessage(role = "assistant", cards = listOf(card))
    }

    fun send() {
        scope.launch {
            if (busy) return@launch
            val outgoingText = text.trim()
            if (outgoingText.isEmpty()) return@launch
            // 传输失败重试时复用同一 requestId：服务端按编号回放结果，不会重复跑一轮模型
            val request = pending?.takeIf { it.message == outgoingText }
                ?: ZoovyRequest(
                    message = outgoingText,
                    requestId = UUID.randomUUID().toString(),
                    bigGoalId = bigGoalId,
                )
            pending = request
            val turn = RunningZoovyTurn(request.requestId)
            runCall(turn) { token ->
                val reply = try {
                    Api.zoovyChat(token, request)
                } catch (e: ApiException) {
                    // 只有「上一请求正在处理」这类可重放的错误才保留编号，其余重新生成
                    if (e.code != 0 && (e.code != 409 || e.message?.contains("未完成") == true)) pending = null
                    throw e
                }
                if (turn.cancelled) return@runCall
                messages = messages + listOf(
                    ZoovyMessage(role = "user", content = request.message),
                    ZoovyMessage(role = "assistant", content = reply.reply, cards = reply.cards),
                )
                if (text.trim() == outgoingText) text = ""
                pending = null
            }
        }
    }

    LaunchedEffect(Unit) {
        runCall { token -> messages = Api.zoovyMessages(token).messages }
    }
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.scrollToItem(messages.lastIndex)
    }
    BackHandler { onBack() }

    val cards = remember(messages) { messages.flatMap { it.cards } }
    val accepted = remember(cards) { cards.mapNotNull { it.offerId }.toSet() }
    val latestDrafts = remember(cards) { cards.mapNotNull { it.draft }.associateBy { it.id } }

    Screen(Modifier.imePadding()) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                PixelSmallButton("返回", onClick = onBack, filled = false)
                Text(
                    "zoowy",
                    modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                    style = PixelType.Title,
                    color = PixelColors.Ink,
                )
            }
            error?.let { Text(it, style = PixelType.Small, color = PixelColors.RedDeep) }
            operationStatus?.let { Text(it, style = PixelType.Small, color = PixelColors.Ink2) }
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(messages) { message ->
                    ZoovyBubble(message, accepted, latestDrafts, busy, onAccept = { id, modelWork ->
                        val requestId = UUID.randomUUID().toString()
                        // 出草案要跑模型，单独记一轮，方便「停止本轮」取消
                        val turn = if (modelWork) RunningZoovyTurn(requestId) else null
                        scope.launch {
                            runCall(turn) { token ->
                                val card = Api.acceptZoovyOffer(token, id, requestId)
                                if (turn?.cancelled != true) appendCard(card)
                            }
                        }
                    }, onConfirm = { id, revision ->
                        scope.launch { runCall { token -> appendCard(Api.confirmZoovyDraft(token, id, revision)) } }
                    })
                }
            }
            PixelTextField(text, { text = it.take(2000) }, "想聊点什么？", Modifier.fillMaxWidth())
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PixelButton(
                    if (busy) "处理中…" else "发送",
                    onClick = ::send,
                    modifier = Modifier.weight(1f),
                    enabled = !busy && text.isNotBlank(),
                )
                if (runningTurn?.let { !it.cancelled && stoppingRequestId != it.requestId } == true) {
                    PixelSmallButton("停止本轮", onClick = ::stopRunning, filled = false)
                }
            }
        }
    }
}

@Composable
private fun ZoovyBubble(
    message: ZoovyMessage,
    accepted: Set<Long>,
    latestDrafts: Map<Long, ZoovyDraft>,
    busy: Boolean,
    onAccept: (Long, Boolean) -> Unit,
    onConfirm: (Long, Int) -> Unit,
) {
    val mine = message.role == "user"
    PixelPanel(
        modifier = Modifier.fillMaxWidth(),
        background = if (mine) PixelColors.GreenSoft else PixelColors.Card,
    ) {
        Column(Modifier.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (mine) "我" else "zoowy", style = PixelType.Small, color = PixelColors.Ink2)
            if (message.content.isNotBlank()) Text(message.content, style = PixelType.Body, color = PixelColors.Ink)
            message.profileChanges?.takeIf { it.isNotEmpty() }?.let {
                Text("画像改动：${it.joinToString("、")}", style = PixelType.Small, color = PixelColors.Ink2)
            }
            if (message.failed == true) Text("这轮没答上来，可以再问一次。", style = PixelType.Small, color = PixelColors.Ink3)
            for (card in message.cards) when (card.type) {
                "plan_offer" -> card.id?.let { id ->
                    Text(card.summary.orEmpty(), style = PixelType.Body, color = PixelColors.Ink)
                    if (id in accepted) Text("已同意生成草案", style = PixelType.Small, color = PixelColors.Ink2)
                    else PixelButton("同意出草案", { onAccept(id, card.modelWork != false) }, enabled = !busy)
                }
                "profile_offer" -> card.id?.let { id ->
                    Text(card.summary.orEmpty(), style = PixelType.Body, color = PixelColors.Ink)
                    if (id in accepted) Text("已同意更新画像", style = PixelType.Small, color = PixelColors.Ink2)
                    else PixelButton("同意更新画像", { onAccept(id, card.modelWork != false) }, enabled = !busy)
                }
                "plan_draft" -> card.draft?.let { draft ->
                    val latest = latestDrafts[draft.id]
                    Text("草案 v${draft.revision} · ${draft.goal}", style = PixelType.Body, color = PixelColors.Ink)
                    draft.weeklyMinutes?.let { Text("每周 $it 分钟", style = PixelType.Small, color = PixelColors.Ink2) }
                    draft.deadline?.let { Text("截止日期 $it", style = PixelType.Small, color = PixelColors.Ink2) }
                    draft.question?.let { Text(it, style = PixelType.Body, color = PixelColors.Ink) }
                    for (step in draft.steps) {
                        Text("${if (step.next) "下一步 · " else ""}${step.title}", style = PixelType.Body, color = PixelColors.Ink)
                        if (step.doneWhen.isNotBlank()) Text(step.doneWhen, style = PixelType.Small, color = PixelColors.Ink2)
                    }
                    when {
                        latest?.revision != draft.revision -> Text("已有新版本", style = PixelType.Small, color = PixelColors.Ink2)
                        latest?.status == "applied" -> Text("已应用到目标", style = PixelType.Small, color = PixelColors.GreenDeep)
                        draft.status == "ready" -> PixelButton("应用这版", { onConfirm(draft.id, draft.revision) }, enabled = !busy)
                        else -> Unit
                    }
                }
                "profile_applied" -> Text("画像已更新 · ${card.summary.orEmpty()}", style = PixelType.Small, color = PixelColors.GreenDeep)
                else -> Unit
            }
        }
    }
}
