package me.footprint.app.ui

import android.view.WindowManager
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.footprint.app.net.ChatMessage
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType

/**
 * 搭子私聊全屏弹层：消息列表（左右气泡）+ 底部输入发送。
 * 打开即拉历史并标记已读；新消息走 WebSocket 实时追加、自动滚底。
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

    // Dialog 是独立 window，不继承 Activity 的 adjustResize；这里手动设置，
    // 否则软键盘弹出时 imePadding 拿不到 insets，输入框会被键盘盖住
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val dialogWindow = (view.parent as? DialogWindowProvider)?.window
            dialogWindow?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        }
    }

    // 打开即标记「聊天页开着」（推送直达不亮红点）并刷新历史
    LaunchedEffect(Unit) {
        vm.setChatOpen(true)
        vm.loadChat()
    }
    DisposableEffect(Unit) {
        onDispose { vm.setChatOpen(false) }
    }

    // 新消息自动滚到底
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.scrollToItem(messages.size - 1)
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
                .imePadding()
                .padding(horizontal = 16.dp, vertical = 24.dp),
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
                        text = partner?.username?.let { "和 $it 私聊" } ?: "私聊",
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
                                    ChatBubble(m, mine = m.senderId != partner?.id)
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                // 输入行
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PixelTextField(
                        value = input,
                        onValueChange = { input = it },
                        placeholder = "给 ta 发条消息…",
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    PixelSmallButton(
                        text = if (sending) "…" else "发送",
                        filled = true,
                        onClick = { send() },
                    )
                }
            }
        }
    }
}

/** 一条气泡：自己的右对齐绿底，对方的左对齐白底 */
@Composable
private fun ChatBubble(m: ChatMessage, mine: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
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
