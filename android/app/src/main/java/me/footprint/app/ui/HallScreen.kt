package me.footprint.app.ui

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.footprint.app.net.HallInvite
import me.footprint.app.net.HallListing
import me.footprint.app.net.HallMyListing
import me.footprint.app.net.HallState
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType

/**
 * 匹配大厅全屏弹层：无搭子用户发布找搭子信息、浏览他人发布、互相邀请组队。
 * 从「我们」页无搭子时的「去匹配大厅」按钮打开。
 */
@Composable
fun HallScreen(vm: AppViewModel, onClose: () -> Unit) {
    val context = LocalContext.current
    val hall by vm.hall.collectAsStateWithLifecycle()
    var toast by remember { mutableStateOf<String?>(null) }
    var publishing by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadHall() }

    LaunchedEffect(toast) {
        if (toast != null) {
            Toast.makeText(context, toast, Toast.LENGTH_SHORT).show()
            toast = null
        }
    }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(PixelColors.Bg)
                .padding(horizontal = 16.dp, vertical = 24.dp),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // 顶栏
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    PixelSmallButton(text = "‹ 返回", filled = false, onClick = onClose)
                    Text("匹配大厅", style = PixelType.Title, color = PixelColors.Ink)
                    Spacer(Modifier.width(56.dp))
                }

                Spacer(Modifier.height(12.dp))

                val state = hall
                if (state == null) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("加载中…", style = PixelType.Small, color = PixelColors.Ink3)
                    }
                } else {
                    HallContent(
                        state = state,
                        onPublish = { publishing = true },
                        onWithdraw = {
                            vm.withdrawHall { err -> toast = err ?: "已撤回" }
                        },
                        onInvite = { userId ->
                            vm.inviteHall(userId) { err -> toast = err ?: "邀请已发出" }
                        },
                        onAccept = { id ->
                            vm.acceptHallInvite(id) { err ->
                                if (err != null) {
                                    toast = err
                                } else {
                                    toast = "组队成功 🎉"
                                    onClose()
                                }
                            }
                        },
                        onDecline = { id ->
                            vm.declineHallInvite(id) { err -> toast = err }
                        },
                        onCancel = { id ->
                            vm.cancelHallInvite(id) { err -> toast = err }
                        },
                    )
                }
            }
        }
    }

    // 发布/编辑表单弹层
    if (publishing) {
        PublishHallDialog(
            existing = hall?.myListing,
            onDismiss = { publishing = false },
            onSubmit = { note ->
                vm.publishHall(note) { err ->
                    if (err != null) {
                        toast = err
                    } else {
                        toast = "已发布到大厅"
                        publishing = false
                    }
                }
            },
        )
    }
}

@Composable
private fun HallContent(
    state: HallState,
    onPublish: () -> Unit,
    onWithdraw: () -> Unit,
    onInvite: (Long) -> Unit,
    onAccept: (Long) -> Unit,
    onDecline: (Long) -> Unit,
    onCancel: (Long) -> Unit,
) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { MyListingSection(state.myListing, onPublish, onWithdraw) }
        if (state.incoming.isNotEmpty() || state.outgoing.isNotEmpty()) {
            item { InvitesSection(state.incoming, state.outgoing, onAccept, onDecline, onCancel) }
        }
        item { ListingsSection(state.listings, onInvite, onAccept, onDecline) }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun MyListingSection(
    mine: HallMyListing?,
    onPublish: () -> Unit,
    onWithdraw: () -> Unit,
) {
    HallSectionTitle("我的发布")
    Spacer(Modifier.height(8.dp))
    if (mine == null) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    "把你的目标摘要 + 一句话介绍发到大伙都能看见的地方",
                    style = PixelType.Small,
                    color = PixelColors.Ink2,
                )
                Spacer(Modifier.height(10.dp))
                PixelSmallButton(text = "发布找搭子信息", filled = true, onClick = onPublish)
            }
        }
    } else {
        PixelPanel(modifier = Modifier.fillMaxWidth(), background = PixelColors.GreenSoft) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    mine.note.ifBlank { "（没写自我介绍）" },
                    style = PixelType.Body,
                    color = PixelColors.Ink,
                )
                if (mine.goalSummary.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text("🎯 ${mine.goalSummary}", style = PixelType.Small, color = PixelColors.Ink2)
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                    PixelSmallButton(text = "编辑", filled = false, onClick = onPublish)
                    Spacer(Modifier.width(8.dp))
                    PixelSmallButton(text = "撤回", filled = false, onClick = onWithdraw)
                }
            }
        }
    }
    Spacer(Modifier.height(16.dp))
}

@Composable
private fun InvitesSection(
    incoming: List<HallInvite>,
    outgoing: List<HallInvite>,
    onAccept: (Long) -> Unit,
    onDecline: (Long) -> Unit,
    onCancel: (Long) -> Unit,
) {
    HallSectionTitle("邀请")
    Spacer(Modifier.height(8.dp))
    for (inv in incoming) {
        val from = inv.fromUser
        PixelPanel(modifier = Modifier.fillMaxWidth(), background = PixelColors.OrangeSoft) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text((from?.avatar ?: "🐾"), style = PixelType.Title)
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("${from?.nickname ?: "有人"} 邀请你组队", style = PixelType.Body, color = PixelColors.Ink)
                    Text(AppViewModel.clockOf(inv.createdAt)?.let { "于 $it" } ?: "", style = PixelType.Small, color = PixelColors.Ink3)
                }
                Spacer(Modifier.width(8.dp))
                PixelSmallButton(text = "拒绝", filled = false, onClick = { onDecline(inv.id) })
                Spacer(Modifier.width(8.dp))
                PixelSmallButton(text = "接受", filled = true, onClick = { onAccept(inv.id) })
            }
        }
        Spacer(Modifier.height(8.dp))
    }
    for (inv in outgoing) {
        val to = inv.toUser
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text((to?.avatar ?: "🐾"), style = PixelType.Title)
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("你邀请了 ${to?.nickname ?: "对方"}", style = PixelType.Body, color = PixelColors.Ink)
                    Text("待对方确认", style = PixelType.Small, color = PixelColors.Ink3)
                }
                Spacer(Modifier.width(8.dp))
                PixelSmallButton(text = "取消", filled = false, onClick = { onCancel(inv.id) })
            }
        }
        Spacer(Modifier.height(8.dp))
    }
    Spacer(Modifier.height(16.dp))
}

@Composable
private fun ListingsSection(
    listings: List<HallListing>,
    onInvite: (Long) -> Unit,
    onAccept: (Long) -> Unit,
    onDecline: (Long) -> Unit,
) {
    HallSectionTitle("正在找搭子")
    Spacer(Modifier.height(8.dp))
    if (listings.isEmpty()) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("🌱", style = PixelType.Huge)
                Spacer(Modifier.height(6.dp))
                Text("暂时没人，你发一条吧", style = PixelType.Small, color = PixelColors.Ink3)
            }
        }
        return
    }
    for (l in listings) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(l.avatar ?: "🐾", style = PixelType.Title)
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(l.nickname, style = PixelType.Body, color = PixelColors.Ink)
                        Text(AppViewModel.clockOf(l.createdAt)?.let { "于 $it" } ?: "", style = PixelType.Small, color = PixelColors.Ink3)
                    }
                }
                if (l.note.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(l.note, style = PixelType.Small, color = PixelColors.Ink)
                }
                if (l.goalSummary.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text("🎯 ${l.goalSummary}", style = PixelType.Small, color = PixelColors.Ink2)
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                    when (l.relation) {
                        "invitedByMe" -> Text("已邀请，待对方确认", style = PixelType.Small, color = PixelColors.Ink3)
                        "invitedMe" -> {
                            PixelSmallButton(text = "拒绝", filled = false, onClick = { onDecline(l.userId) })
                            Spacer(Modifier.width(8.dp))
                            PixelSmallButton(text = "接受", filled = true, onClick = { onAccept(l.userId) })
                        }
                        else -> PixelSmallButton(text = "邀请", filled = true, onClick = { onInvite(l.userId) })
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun HallSectionTitle(title: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(10.dp).background(PixelColors.Ink))
        Spacer(Modifier.width(8.dp))
        Text(title, style = PixelType.Title, color = PixelColors.Ink)
    }
}

/** 发布/编辑弹层：一句话介绍 + 提交 */
@Composable
private fun PublishHallDialog(
    existing: HallMyListing?,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var note by remember { mutableStateOf(existing?.note ?: "") }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .background(PixelColors.Card)
                .pixelBorder(2.dp, PixelColors.Outline)
                .pixelHardShadow(4.dp, PixelColors.Outline),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(if (existing == null) "发布找搭子信息" else "编辑我的发布", style = PixelType.Title, color = PixelColors.Ink)
                Spacer(Modifier.height(8.dp))
                Text("一句话介绍自己（选填，最多 200 字）", style = PixelType.Small, color = PixelColors.Ink3)
                Spacer(Modifier.height(10.dp))
                PixelTextField(
                    value = note,
                    onValueChange = { note = it.take(200) },
                    placeholder = "比如：早起型，想找个人一起坚持每天跑步",
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text("发布时会自动附上你当前的目标摘要，让别人一眼看懂你在坚持什么。", style = PixelType.Small, color = PixelColors.Ink2)
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                    PixelSmallButton(text = "取消", filled = false, onClick = onDismiss)
                    Spacer(Modifier.width(8.dp))
                    PixelSmallButton(text = "发布", filled = true, onClick = { onSubmit(note.trim()) })
                }
            }
        }
    }
}
