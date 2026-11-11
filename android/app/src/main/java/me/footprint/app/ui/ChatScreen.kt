package me.footprint.app.ui

import android.view.WindowManager
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.footprint.app.net.ChatMessage
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType

/**
 * 搭子私聊全屏弹层：消息列表（左右气泡 + 对方头像）+ 底部多行输入发送。
 * 打开即拉历史并标记已读；新消息走 WebSocket 实时追加、自动滚底；滚到顶翻更早历史。
 * 对齐 Web chat.js：多行、最多 2000 字、Enter 发送 / Shift+Enter 换行、按钮「发」。
 */
@Composable
fun ChatScreen(vm: AppViewModel, onClose: () -> Unit) {
    val messages by vm.chatMessages.collectAsStateWithLifecycle()
    val partner by vm.chatPartner.collectAsStateWithLifecycle()
    val loaded by vm.chatLoaded.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val listState = rememberLazyListState()

    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }

    // 翻页控制：正在加载 / 没有更多 / 追加历史后要还原到的锚点消息 id
    val loadingMore = remember { mutableStateOf(false) }
    val noMore = remember { mutableStateOf(false) }
    val pendingAnchor = remember { mutableStateOf<Long?>(null) }

    // Dialog 是独立 window，不继承 Activity 的 adjustResize；这里手动设置，
    // 否则软键盘弹出时 imePadding 拿不到 insets，输入框会被键盘盖住
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val dialogWindow = (view.parent as? DialogWindowProvider)?.window
            dialogWindow?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        }
    }

    // 打开即标记「聊天页开着」（推送直达不亮红点）并刷新历史。
    // loadChat() 在 chatOpen=true 时会自动向服务端标记已读、并把本地红点清成 0，
    // 这里不要再调用任何会写回未读数的逻辑（对齐 Web：打开即已读，不亮红点）。
    LaunchedEffect(Unit) {
        vm.setChatOpen(true)
        vm.loadChat()
    }
    DisposableEffect(Unit) {
        onDispose { vm.setChatOpen(false) }
    }

    // 滚到顶（且是从下方滚回顶）时加载更早历史，对齐 Web chat.js 的 ?before=&limit=40 分页。
    // 用 snapshotFlow 读 firstVisibleItemIndex：不把它读进组合体，避免滚动时整页重组。
    LaunchedEffect(Unit) {
        var wasAwayFromTop = false
        snapshotFlow { listState.firstVisibleItemIndex }
            .collect { idx ->
                val cur = vm.chatMessages.value
                if (cur.isEmpty()) return@collect
                if (idx > 0) {
                    wasAwayFromTop = true
                    return@collect
                }
                // idx == 0：只有从下方滚回顶才翻页（避免打开即误触发一页）
                if (wasAwayFromTop && !loadingMore.value && !noMore.value) {
                    wasAwayFromTop = false
                    loadingMore.value = true
                    val anchorId = cur.first().id
                    pendingAnchor.value = anchorId
                    vm.loadChatMore(anchorId) { added ->
                        if (added == 0) {
                            noMore.value = true
                            pendingAnchor.value = null
                        }
                        loadingMore.value = false
                    }
                }
            }
    }

    // 追加更早历史后把视口还原到原来那条消息（对齐 Web 的 scrollTop = scrollHeight - prevHeight）
    val firstId = messages.firstOrNull()?.id
    LaunchedEffect(firstId) {
        val anchor = pendingAnchor.value ?: return@LaunchedEffect
        val idx = messages.indexOfFirst { it.id == anchor }
        if (idx >= 0) {
            listState.scrollToItem(idx)
            pendingAnchor.value = null
        }
    }

    // 新消息（append）自动滚到底；prepend 不会改 lastId，故不会被翻页打扰
    val lastId = messages.lastOrNull()?.id
    LaunchedEffect(lastId) {
        if (lastId != null && pendingAnchor.value == null) {
            listState.scrollToItem(messages.size - 1)
        }
    }

    fun send() {
        val text = input.trim()
        if (text.isEmpty() || sending) return
        sending = true
        vm.sendChatMessage(text) { err ->
            sending = false
            if (err != null) {
                Toast.makeText(context, err, Toast.LENGTH_SHORT).show()
            } else {
                input = ""
            }
        }
    }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(PixelColors.Bg)
                .windowInsetsPadding(WindowInsets.navigationBars)
                .imePadding()
                .padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 56.dp),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // 顶栏：返回 + 标题
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    PixelSmallButton(text = "‹ 返回", filled = false, onClick = onClose)
                    Text(
                        text = partner?.nickname?.let { "和 $it 私聊" } ?: "私聊",
                        style = PixelType.Title,
                        color = PixelColors.Ink,
                    )
                    Spacer(Modifier.width(56.dp)) // 右侧占位，让标题居中
                }

                Spacer(Modifier.height(12.dp))

                // 消息区
                PixelPanel(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                ) {
                    when {
                        !loaded -> {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text("加载中…", style = PixelType.Small, color = PixelColors.Ink3)
                            }
                        }
                        messages.isEmpty() -> {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("🐾", style = PixelType.Huge)
                                    Spacer(Modifier.height(8.dp))
                                    Text("还没聊过，跟 ta 说点什么吧", style = PixelType.Small, color = PixelColors.Ink2)
                                }
                            }
                        }
                        else -> {
                            LazyColumn(
                                state = listState,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(12.dp),
                            ) {
                                items(messages, key = { it.id }) { m ->
                                    ChatBubble(
                                        m = m,
                                        mine = m.senderId != partner?.id,
                                        avatar = partner?.avatar,
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                // 输入行：多行（最多 2000 字），Enter 发送 / Shift+Enter 换行，按钮「发」
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    BasicTextField(
                        value = input,
                        onValueChange = { input = it.take(2000) },
                        modifier = Modifier
                            .weight(1f)
                            .background(PixelColors.Card)
                            .pixelBorder(2.dp, PixelColors.Outline)
                            .onPreviewKeyEvent { e ->
                                // 硬件键盘：Enter 发送；Shift+Enter 放行，让输入框插入换行
                                if (e.key == Key.Enter && e.type == KeyEventType.KeyDown) {
                                    if (e.isShiftPressed) {
                                        false
                                    } else {
                                        send()
                                        true
                                    }
                                } else {
                                    false
                                }
                            }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        textStyle = PixelType.Body.copy(color = PixelColors.Ink),
                        cursorBrush = SolidColor(PixelColors.Green),
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Send,
                            keyboardType = KeyboardType.Text,
                        ),
                        keyboardActions = KeyboardActions(onSend = { send() }),
                        maxLines = 4,
                        decorationBox = { inner ->
                            Box(contentAlignment = Alignment.TopStart) {
                                if (input.isEmpty()) {
                                    Text("给 ta 发条消息…", style = PixelType.Body, color = PixelColors.Ink3)
                                }
                                inner()
                            }
                        },
                    )
                    Spacer(Modifier.width(8.dp))
                    PixelSmallButton(
                        text = if (sending) "…" else "发",
                        filled = true,
                        onClick = { send() },
                    )
                }
            }
        }
    }
}

/** 一条气泡：自己的右对齐绿底，对方的左对齐白底且带对方头像（对齐 Web chatBubble） */
@Composable
private fun ChatBubble(m: ChatMessage, mine: Boolean, avatar: String?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Bottom,
    ) {
        if (!mine) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .background(PixelColors.Bg2)
                    .pixelBorder(2.dp, PixelColors.LineStrong),
                contentAlignment = Alignment.Center,
            ) {
                Text(avatar?.takeIf { it.isNotBlank() } ?: "🐾", style = PixelType.Body)
            }
            Spacer(Modifier.width(6.dp))
        }
        Box(
            modifier = Modifier
                .background(if (mine) PixelColors.GreenSoft else PixelColors.Card)
                .pixelBorder(2.dp, PixelColors.Outline)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(m.content, style = PixelType.Body, color = PixelColors.Ink)
        }
    }
}
