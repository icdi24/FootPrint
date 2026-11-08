package me.footprint.app.ui

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.footprint.app.net.Api
import me.footprint.app.net.ApiException
import me.footprint.app.net.Session
import me.footprint.app.net.ZoowyCard
import me.footprint.app.net.ZoowyDraft
import me.footprint.app.net.ZoowyMessage
import me.footprint.app.net.ZoowyModel
import me.footprint.app.net.ZoowyRequest
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType
import java.io.ByteArrayOutputStream
import java.net.URI
import java.util.UUID

private class RunningZoowyTurn(val requestId: String) {
    var cancelled = false
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ZoowyScreen(onBack: () -> Unit, bigGoalId: Long? = null) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    var messages by remember { mutableStateOf<List<ZoowyMessage>>(emptyList()) }
    var model by remember { mutableStateOf<ZoowyModel?>(null) }
    var text by remember { mutableStateOf("") }
    var attachment by remember { mutableStateOf<Long?>(null) }
    var deepThinking by remember { mutableStateOf(false) }
    var smartSearch by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<ZoowyRequest?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var operationStatus by remember { mutableStateOf<String?>(null) }
    var runningTurn by remember { mutableStateOf<RunningZoowyTurn?>(null) }
    var stoppingRequestId by remember { mutableStateOf<String?>(null) }
    var confirmCompact by remember { mutableStateOf(false) }
    var editingSettings by remember { mutableStateOf(false) }

    fun markCancelled(turn: RunningZoowyTurn) {
        turn.cancelled = true
        if (pending?.requestId == turn.requestId) pending = null
        error = null
        operationStatus = "已停止运行。"
    }

    suspend fun runCall(turn: RunningZoowyTurn? = null, action: suspend (String) -> Unit) {
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
                val stopped = Api.cancelZoowyTurn(token, turn.requestId)
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

    fun compact() {
        if (busy || model?.configured != true) return
        val turn = RunningZoowyTurn(UUID.randomUUID().toString())
        scope.launch {
            runCall(turn) { token ->
                val reply = Api.compactZoowy(token, turn.requestId)
                if (!turn.cancelled) {
                    val count = reply.compact?.summarizedMessages ?: 0
                    operationStatus = reply.reply.ifBlank {
                        if (count > 0) "已摘要 $count 条消息。" else "没有需要摘要的较早消息。"
                    }
                }
            }
        }
    }

    fun appendCard(card: ZoowyCard) {
        messages = messages + ZoowyMessage(role = "assistant", cards = listOf(card))
    }

    fun send() {
        scope.launch {
            if (busy) return@launch
            val outgoingText = text.trim()
            if (outgoingText.isEmpty() && attachment == null) return@launch
            val request = pending?.takeIf {
                it.message == outgoingText && it.attachmentId == attachment &&
                    it.deepThinking == deepThinking && it.smartSearch == smartSearch
            } ?: ZoowyRequest(
                message = outgoingText,
                requestId = UUID.randomUUID().toString(),
                attachmentId = attachment,
                bigGoalId = bigGoalId,
                deepThinking = deepThinking,
                smartSearch = smartSearch,
            )
            pending = request
            val turn = RunningZoowyTurn(request.requestId)
            runCall(turn) { token ->
                val reply = try {
                    Api.zoowyChat(token, request)
                } catch (e: ApiException) {
                    // 传输失败时原请求可能已完成，重试复用编号。
                    if (e.code != 0 && (e.code != 409 || e.message?.contains("未完成") == true)) pending = null
                    throw e
                }
                if (turn.cancelled) return@runCall
                messages = messages + listOf(
                    ZoowyMessage(role = "user", content = request.message, attachmentId = request.attachmentId),
                    ZoowyMessage(role = "assistant", content = reply.reply, cards = reply.cards, sources = reply.sources),
                )
                if (text.trim() == outgoingText) text = ""
                attachment = null
                pending = null
            }
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            runCall { token -> attachment = Api.uploadZoowyImage(token, readZoowyImage(context, uri)) }
        }
    }

    LaunchedEffect(Unit) {
        runCall { token ->
            messages = Api.zoowyMessages(token)
            model = Api.zoowyModel(token)
        }
    }
    LaunchedEffect(messages.size, editingSettings) {
        if (messages.isNotEmpty() && !editingSettings) listState.scrollToItem(messages.lastIndex)
    }
    BackHandler {
        if (editingSettings) editingSettings = false else onBack()
    }

    val cards = remember(messages) { messages.flatMap { it.cards } }
    val accepted = remember(cards) { cards.mapNotNull { it.offerId }.toSet() }
    val latestDrafts = remember(cards) { cards.mapNotNull { it.draft }.associateBy { it.id } }

    Screen(Modifier.imePadding()) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                PixelSmallButton("返回", onClick = { if (editingSettings) editingSettings = false else onBack() }, filled = false)
                Text("zoowy", modifier = Modifier.weight(1f).padding(horizontal = 12.dp), style = PixelType.Title, color = PixelColors.Ink)
                if (!editingSettings && !busy) PixelSmallButton("DeepSeek 设置", onClick = { editingSettings = true }, filled = false)
            }
            error?.let { Text(it, style = PixelType.Small, color = PixelColors.RedDeep) }
            operationStatus?.let { Text(it, style = PixelType.Small, color = PixelColors.Ink2) }
            if (editingSettings) {
                ZoowySettings(model, busy, onSave = { key, selectedModel ->
                    scope.launch {
                        runCall { token ->
                            model = Api.saveZoowyModel(token, key, selectedModel)
                            editingSettings = false
                        }
                    }
                }, onRemove = {
                    scope.launch { runCall { token -> model = Api.removeZoowyModel(token) } }
                })
            } else {
                if (model?.configured == false) {
                    Text("先在设置中填写你的 DeepSeek API Key。", style = PixelType.Small, color = PixelColors.Ink2)
                }
                LazyColumn(state = listState, modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(messages) { message ->
                        ZoowyBubble(message, accepted, latestDrafts, busy, onAccept = { id, modelWork ->
                            val requestId = UUID.randomUUID().toString()
                            val turn = if (modelWork) RunningZoowyTurn(requestId) else null
                            scope.launch {
                                runCall(turn) { token ->
                                    val card = Api.acceptZoowyOffer(token, id, requestId)
                                    if (turn?.cancelled != true) appendCard(card)
                                }
                            }
                        }, onConfirm = { id, revision ->
                            scope.launch { runCall { token -> appendCard(Api.confirmZoowyDraft(token, id, revision)) } }
                        })
                    }
                }
                if (attachment != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("已选图片，发送时交给 DeepSeek", style = PixelType.Small, color = PixelColors.Ink2)
                        if (!busy) PixelSmallButton("移除", onClick = { attachment = null }, filled = false)
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    FilterChip(
                        selected = deepThinking,
                        onClick = { deepThinking = !deepThinking },
                        enabled = !busy,
                        label = { Text("深度思考") },
                    )
                    FilterChip(
                        selected = smartSearch,
                        onClick = { smartSearch = !smartSearch },
                        enabled = !busy,
                        label = { Text("智能搜索") },
                    )
                    AssistChip(
                        onClick = { confirmCompact = true },
                        enabled = !busy && model?.configured == true,
                        label = { Text("摘要上下文") },
                    )
                    AssistChip(
                        onClick = ::stopRunning,
                        enabled = runningTurn?.let { !it.cancelled && stoppingRequestId != it.requestId } == true,
                        label = { Text("停止运行") },
                    )
                }
                PixelTextField(text, { text = it.take(2000) }, "想聊点什么？", Modifier.fillMaxWidth())
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (model?.configured == true && model?.model == "deepseek-flash" && !busy) {
                        PixelSmallButton("选图片", onClick = { picker.launch("image/*") }, filled = false)
                    }
                    PixelButton(if (busy) "处理中…" else "发送", onClick = ::send, modifier = Modifier.weight(1f),
                        enabled = !busy && model?.configured == true && (text.isNotBlank() || attachment != null))
                }
            }
        }
    }

    if (confirmCompact) {
        ConfirmDialog(
            title = "摘要上下文",
            message = "将较早的聊天整理成摘要，供后续对话使用？原始聊天记录仍可查看。",
            confirmText = "生成摘要",
            danger = false,
            onDismiss = { confirmCompact = false },
            onConfirm = { confirmCompact = false; compact() },
        )
    }
}

@Composable
private fun ZoowySettings(model: ZoowyModel?, busy: Boolean, onSave: (String, String) -> Unit, onRemove: () -> Unit) {
    var apiKey by remember { mutableStateOf("") }
    var selected by remember(model) { mutableStateOf(model?.model ?: "deepseek-flash") }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("官方 DeepSeek API", style = PixelType.Title, color = PixelColors.Ink)
        Text("聊天和选中的图片会发给 DeepSeek。Key 由 FootPrint 后端保存。", style = PixelType.Small, color = PixelColors.Ink2)
        Text(if (model?.configured == true) "已配置 Key" else "尚未配置 Key", style = PixelType.Body, color = PixelColors.Ink)
        PixelTextField(apiKey, { apiKey = it }, "输入 DeepSeek API Key", Modifier.fillMaxWidth(), isPassword = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PixelSmallButton("Flash · 支持图片", { selected = "deepseek-flash" }, filled = selected == "deepseek-flash")
            PixelSmallButton("Pro · 文本", { selected = "deepseek-v4-pro" }, filled = selected == "deepseek-v4-pro")
        }
        PixelButton("保存 DeepSeek Key", { onSave(apiKey.trim(), selected) }, Modifier.fillMaxWidth(), enabled = !busy && apiKey.isNotBlank())
        if (model?.configured == true && !busy) PixelSmallButton("移除 Key", onRemove, filled = false)
    }
}

@Composable
private fun ZoowyBubble(
    message: ZoowyMessage,
    accepted: Set<Long>,
    latestDrafts: Map<Long, ZoowyDraft>,
    busy: Boolean,
    onAccept: (Long, Boolean) -> Unit,
    onConfirm: (Long, Int) -> Unit,
) {
    val mine = message.role == "user"
    val uriHandler = LocalUriHandler.current
    val sources = remember(message.sources) {
        message.sources.take(5).mapNotNull { source ->
            val uri = runCatching { URI(source.url) }.getOrNull()
            if (uri?.scheme.equals("https", ignoreCase = true) && uri?.host != null && uri.userInfo == null) source to uri else null
        }
    }
    PixelPanel(modifier = Modifier.fillMaxWidth(), background = if (mine) PixelColors.GreenSoft else PixelColors.Card) {
        Column(Modifier.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (mine) "我" else "zoowy", style = PixelType.Small, color = PixelColors.Ink2)
            if (message.content.isNotBlank()) Text(message.content, style = PixelType.Body, color = PixelColors.Ink)
            if (message.attachmentId != null) Text("已附图片", style = PixelType.Small, color = PixelColors.Ink2)
            for (card in message.cards) when (card.type) {
                "plan_offer" -> card.id?.let { id ->
                    Text(card.summary.orEmpty(), style = PixelType.Body, color = PixelColors.Ink)
                    if (id in accepted) Text("已同意生成草案", style = PixelType.Small, color = PixelColors.Ink2)
                    else PixelButton("同意出草案", { onAccept(id, card.modelWork != false) }, enabled = !busy)
                }
                "plan_draft" -> card.draft?.let { draft ->
                    val latest = latestDrafts[draft.id]
                    Text("草案 v${draft.revision} · ${draft.goal}", style = PixelType.Body, color = PixelColors.Ink)
                    draft.weeklyMinutes?.let { Text("每周 $it 分钟", style = PixelType.Small, color = PixelColors.Ink2) }
                    draft.deadline?.let { Text("截止日期 $it", style = PixelType.Small, color = PixelColors.Ink2) }
                    draft.question?.let { Text(it, style = PixelType.Body, color = PixelColors.Ink) }
                    for (step in draft.steps) {
                        Text("${if (step.next) "下一步 · " else ""}${step.title}", style = PixelType.Body, color = PixelColors.Ink)
                        Text(step.doneWhen, style = PixelType.Small, color = PixelColors.Ink2)
                    }
                    when {
                        latest?.revision != draft.revision -> Text("已有新版本", style = PixelType.Small, color = PixelColors.Ink2)
                        latest?.status == "applied" -> Text("已应用到目标", style = PixelType.Small, color = PixelColors.GreenDeep)
                        draft.status == "ready" -> PixelButton("应用这版", { onConfirm(draft.id, draft.revision) }, enabled = !busy)
                        else -> Unit
                    }
                }
                "memory_saved" -> Text("已记住 · ${card.label.orEmpty()}", style = PixelType.Small, color = PixelColors.GreenDeep)
                else -> Unit
            }
            if (sources.isNotEmpty()) {
                Text("搜索来源", style = PixelType.Small, color = PixelColors.Ink2)
                for ((source, uri) in sources) {
                    Text(
                        source.title.ifBlank { uri.host },
                        modifier = Modifier.clickable(role = Role.Button) { runCatching { uriHandler.openUri(uri.toString()) } }
                            .padding(vertical = 6.dp),
                        color = PixelColors.GreenDeep,
                        textDecoration = TextDecoration.Underline,
                        style = PixelType.Body,
                    )
                    if (source.snippet.isNotBlank()) Text(source.snippet, style = PixelType.Small, color = PixelColors.Ink2)
                }
            }
        }
    }
}

private suspend fun readZoowyImage(context: Context, uri: Uri): String = withContext(Dispatchers.IO) {
    val input = context.contentResolver.openInputStream(uri) ?: throw ApiException("无法打开图片")
    val bytes = input.use {
        val buffer = ByteArray(8192)
        val output = ByteArrayOutputStream()
        while (true) {
            val count = it.read(buffer)
            if (count <= 0) break
            if (output.size() + count > 1024 * 1024) throw ApiException("图片不能超过 1 MiB，请压缩后再选")
            output.write(buffer, 0, count)
        }
        output.toByteArray()
    }
    val mime = when {
        bytes.size >= 8 && bytes.copyOfRange(0, 8).contentEquals(byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) -> "image/png"
        bytes.size >= 2 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte() -> "image/jpeg"
        else -> throw ApiException("请选择 PNG 或 JPEG 图片")
    }
    "data:$mime;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
}
