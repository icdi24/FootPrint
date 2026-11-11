package me.footprint.app.ui

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import me.footprint.app.net.Api
import me.footprint.app.net.AppUsage
import me.footprint.app.net.GoalRef
import me.footprint.app.net.PartnerToday
import me.footprint.app.net.PlanGoalDto
import me.footprint.app.net.PointsPreviewRequest
import me.footprint.app.net.Session
import me.footprint.app.net.StageGoal
import me.footprint.app.net.Todo
import me.footprint.app.net.UserDto
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.Locale

// ==================== 认证页（登录 + 注册，访客可随时返回） ====================

private val AVATARS = listOf("🐱", "🐻", "🐰", "🦊", "🐶", "🐼", "🐨", "🦁")

/** 访客空状态：提示该功能需要登录，附「登录 / 注册」按钮（点击跳认证页） */
@Composable
fun GuestEmpty(
    vm: AppViewModel,
    emoji: String,
    title: String,
    sub: String,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 72.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(emoji, style = PixelType.Huge)
        Spacer(Modifier.height(16.dp))
        Text(title, style = PixelType.Title, color = PixelColors.Ink, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(sub, style = PixelType.Small, color = PixelColors.Ink2, textAlign = TextAlign.Center)
        Spacer(Modifier.height(24.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PixelButton(text = "登录", onClick = { vm.showAuth("login") })
            PixelSmallButton(text = "注册", onClick = { vm.showAuth("register") }, filled = false)
        }
    }
}

@Composable
fun AuthScreen(vm: AppViewModel) {
    val authMode by vm.authMode.collectAsStateWithLifecycle()
    val isRegister = authMode == "register"
    val login by vm.login.collectAsStateWithLifecycle()
    val reg by vm.register.collectAsStateWithLifecycle()

    // 密码/确认密码只放本地 state，不塞进 ViewModel
    var password by rememberSaveable { mutableStateOf("") }
    var password2 by rememberSaveable { mutableStateOf("") }
    var confirmError by rememberSaveable { mutableStateOf<String?>(null) }

    val username = if (isRegister) reg.username else login.username
    val busy = if (isRegister) reg.busy else login.busy
    val error = if (isRegister) reg.error else login.error

    Screen {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(32.dp))

            PixelPanel(background = PixelColors.Green) {
                Text(
                    text = "🐾",
                    style = PixelType.Huge,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                )
            }
            Spacer(Modifier.height(20.dp))
            Text("脚 印", style = PixelType.Huge, color = PixelColors.Ink)
            Spacer(Modifier.height(8.dp))
            Text("两个人互相看得见的打卡与目标", style = PixelType.Small, color = PixelColors.Ink2)

            Spacer(Modifier.height(32.dp))

            Text("用户名", style = PixelType.Small, color = PixelColors.Ink2, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(6.dp))
            PixelTextField(
                value = username,
                onValueChange = if (isRegister) vm::onRegisterUsernameChange else vm::onUsernameChange,
                placeholder = if (isRegister) "2–30 字，登录用" else "比如：栗子",
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(16.dp))
            Text("密码", style = PixelType.Small, color = PixelColors.Ink2, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(6.dp))
            PixelTextField(
                value = password,
                onValueChange = { password = it },
                placeholder = if (isRegister) "至少 8 位" else "和网页版一样",
                modifier = Modifier.fillMaxWidth(),
                isPassword = true,
            )

            if (isRegister) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "注册后到「我的 → 我的搭档」看自己的邀请码，或输入对方的码完成配对",
                    style = PixelType.Small,
                    color = PixelColors.Ink3,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                Text("再输一遍", style = PixelType.Small, color = PixelColors.Ink2, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                PixelTextField(
                    value = password2,
                    onValueChange = { password2 = it },
                    placeholder = "确认密码",
                    modifier = Modifier.fillMaxWidth(),
                    isPassword = true,
                )

                Spacer(Modifier.height(16.dp))
                Text("选个头像", style = PixelType.Small, color = PixelColors.Ink2, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for (a in AVATARS) {
                        Box(
                            modifier = Modifier
                                .background(if (reg.avatar == a) PixelColors.GreenSoft else PixelColors.Card)
                                .pixelBorder(2.dp, if (reg.avatar == a) PixelColors.Green else PixelColors.Outline)
                                .clickable { vm.onRegisterAvatarChange(a) }
                                .padding(6.dp),
                        ) {
                            Text(a, style = PixelType.Title)
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            if (error != null) {
                Text(
                    text = error,
                    style = PixelType.Small,
                    color = PixelColors.RedDeep,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
            } else if (confirmError != null) {
                Text(
                    text = confirmError!!,
                    style = PixelType.Small,
                    color = PixelColors.RedDeep,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
            }

            PixelButton(
                text = if (busy) "稍候…" else if (isRegister) "注册" else "进入脚印",
                onClick = {
                    confirmError = null
                    if (isRegister) {
                        if (password != password2) {
                            confirmError = "两次密码不一样"
                        } else {
                            vm.register(username, password, reg.avatar)
                        }
                    } else {
                        vm.login(username, password)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !busy,
            )

            Spacer(Modifier.height(16.dp))

            // 登录 / 注册切换
            Text(
                text = if (isRegister) "已有账号？去登录" else "还没有账号？注册",
                style = PixelType.Small,
                color = PixelColors.GreenDeep,
                modifier = Modifier
                    .clickable { vm.showAuth(if (isRegister) "login" else "register") }
                    .padding(8.dp),
            )

            Spacer(Modifier.height(8.dp))

            // 访客返回逛逛
            Text(
                text = "← 返回逛逛",
                style = PixelType.Small,
                color = PixelColors.Ink2,
                modifier = Modifier
                    .clickable { vm.closeAuth() }
                    .padding(8.dp),
            )

            Spacer(Modifier.height(24.dp))
        }
    }
}

// ==================== 主页 ====================

@Composable
fun HomeScreen(
    vm: AppViewModel,
    onOpenUsageSettings: () -> Unit,
    onSelectTab: (MainTab) -> Unit = {},
) {
    val loggedIn by vm.loggedIn.collectAsStateWithLifecycle()
    val granted by vm.granted.collectAsStateWithLifecycle()
    val mine by vm.mine.collectAsStateWithLifecycle()
    val partner by vm.partner.collectAsStateWithLifecycle()
    val syncNote by vm.syncNote.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val loadError by vm.loadError.collectAsStateWithLifecycle()
    val homeError by vm.homeError.collectAsStateWithLifecycle()
    val home by vm.home.collectAsStateWithLifecycle()
    val busy by vm.checkinBusy.collectAsStateWithLifecycle()
    val toast by vm.toast.collectAsStateWithLifecycle()
    val myName by vm.myName.collectAsStateWithLifecycle()

    val context = LocalContext.current

    // 首页打卡弹层 / 大目标详情弹层（点「当前小目标」卡打开）
    var checkinGoal by remember { mutableStateOf<GoalRef?>(null) }
    var bigGoalId by remember { mutableStateOf<Long?>(null) }

    // 一次性提示：显示完立刻清掉，避免重组时反复弹
    LaunchedEffect(toast) {
        if (toast != null) {
            Toast.makeText(context, toast, Toast.LENGTH_SHORT).show()
            vm.consumeToast()
        }
    }

    // 打卡弹层：点「完成」打开；长按 550ms 走 instant（见 TodoCard）
    val ciGoal = checkinGoal
    if (ciGoal != null) {
        HomeCheckinDialog(
            goal = ciGoal,
            vm = vm,
            onDismiss = { checkinGoal = null },
        )
    }

    // 当前小目标卡 → 大目标详情
    val detailId = bigGoalId
    if (detailId != null) {
        BigGoalDetailDialog(
            bigGoalId = detailId,
            context = context,
            onDismiss = { bigGoalId = null },
            onChanged = { vm.refreshAll() },
            onEdit = {},
        )
    }

    Screen {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
        ) {
            // 顶栏：问候 + 日期 + 退出（游客态不显示退出，对齐 Web home-head）
            HomeTopBar(
                greeting = greetingText() + "，" + (
                    if (loggedIn) (home?.me?.username ?: myName.ifBlank { "你好" }) + " " + (home?.me?.avatar ?: "")
                    else "游客 🐾"
                ),
                date = todayLabel(),
                showLogout = loggedIn,
                onLogout = vm::logout,
            )

            Spacer(Modifier.height(16.dp))

            when {
                // 游客态：0 值积分横幅 + 日期 + 空态 + 登录/注册（对齐 Web home.js:4-48）
                !loggedIn -> GuestHome(vm, onSelectTab)

                // 首页聚合失败：😿 + 文案 + 重试（对齐 Web 首页错误态）
                homeError != null -> HomeError(homeError!!, vm::retryHome)

                // 还没拿到首页数据：加载中…
                home == null && refreshing -> HomeLoading()

                // 兜底：首次还没触发刷新也别留白
                home == null -> HomeLoading()

                else -> {
                    val h = home!!
                    val todos = h.todos
                    // Web 口径：dueToday 或「本周还没打够」都算待办；已完成取所有 checked != null
                    val pending = todos.filter { t ->
                        (t.dueToday || (t.weekly?.let { it.done < it.need } == true)) && t.checked == null
                    }
                    val doneList = todos.filter { it.checked != null }

                    // ---- 积分横幅（对齐 Web 首页 balance-banner）----
                    BalanceBanner(h.balance, h.currentStreak, h.monthPoints)
                    Spacer(Modifier.height(16.dp))

                    // ---- 今日待办 ----
                    SectionHead("今日待办", if (pending.isNotEmpty()) "剩 ${pending.size} 项" else "")
                    for ((i, t) in pending.withIndex()) {
                        StaggerIn(i) {
                            TodoCard(
                                t = t,
                                busyGoalId = busy,
                                onOpenCheckin = { checkinGoal = t.goal },
                                onInstant = {
                                    vm.checkin(t.goal.id, t.goal.duration_min.takeIf { it > 0 } ?: 30, null)
                                },
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                    if (doneList.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        SectionHead("已完成", "${doneList.size} 项 ✓")
                        for ((i, t) in doneList.withIndex()) {
                            StaggerIn(pending.size + i) { DoneCard(t) }
                            Spacer(Modifier.height(10.dp))
                        }
                    }
                    if (pending.isEmpty() && doneList.isEmpty()) {
                        HomeEmptyGoals(onSelectTab)
                    }

                    Spacer(Modifier.height(20.dp))

                    // ---- 当前小目标（计划链已释放的，P1-#8；未启动的不出现）----
                    if (h.currentPlanGoals.isNotEmpty()) {
                        PlanMiniList(h.currentPlanGoals, onOpenBigGoal = { bigGoalId = it })
                        Spacer(Modifier.height(20.dp))
                    }

                    // ---- 进行中的小目标 ----
                    if (h.stageGoals.isNotEmpty()) {
                        StageMiniList(h.stageGoals, onSelectTab = onSelectTab)
                        Spacer(Modifier.height(20.dp))
                    }

                    // ---- 对方动态 partner-strip（对齐 Web home.js:139-147,204-208）----
                    val p = h.partner
                    if (p != null) {
                        PartnerStrip(p, h.partnerToday) { onSelectTab(MainTab.Partner) }
                        Spacer(Modifier.height(20.dp))
                    }

                    // ---- 手机时长卡（Android 原生能力，Web 没有；放 partner-strip 之后）----
                    if (!granted) {
                        // 没授权时绝不显示 0 分钟（会被读成"今天一点没玩"）
                        NoPermissionCard(onOpenUsageSettings)
                    } else {
                        MyUsageCard(
                            totalSeconds = mine?.totalSeconds ?: 0L,
                            apps = mine?.apps ?: emptyList(),
                            hasData = mine != null,
                            syncNote = syncNote,
                        )
                    }

                    Spacer(Modifier.height(20.dp))

                    // ---- ta ----
                    PartnerCard(
                        username = partner?.partner?.username ?: "ta",
                        totalSeconds = partner?.totalSeconds ?: 0L,
                        apps = partner?.apps ?: emptyList(),
                        lastReportAt = partner?.lastReportAt,
                        hasPartner = partner != null,
                    )

                    val err = loadError
                    if (err != null) {
                        Spacer(Modifier.height(12.dp))
                        Text("加载出错：$err", style = PixelType.Small, color = PixelColors.RedDeep)
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

/**
 * 单张待办卡（对齐 Web 版 todoCard）：emoji 方块 + 标题/元信息/连续 + 右侧分值 + 完成按钮。
 * 点「完成」开打卡弹层，按住 550ms 直接按默认时长提交（对齐 Web home.js:150-169）。
 */
@Composable
private fun TodoCard(
    t: Todo,
    busyGoalId: Long?,
    onOpenCheckin: () -> Unit,
    onInstant: () -> Unit,
) {
    val g = t.goal
    val meta = buildList {
        add(if (g.window_start != null) "${g.window_start}–${g.window_end}" else "全天")
        add("难度 ${g.difficulty}")
        t.weekly?.let { add("本周 ${it.done}/${it.need}") }
    }
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            // emoji 绿色方块
            Box(
                modifier = Modifier
                    .background(PixelColors.GreenSoft)
                    .pixelBorder(2.dp, PixelColors.Outline)
                    .padding(8.dp),
            ) {
                Text(g.emoji, style = PixelType.Title)
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(g.title, style = PixelType.Body, color = PixelColors.Ink)
                Text(meta.joinToString(" · "), style = PixelType.Small, color = PixelColors.Ink2)
                Spacer(Modifier.height(2.dp))
                Text(
                    "🔥 连续 ${t.streak} 天",
                    style = PixelType.Small,
                    color = PixelColors.OrangeDeep,
                )
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "+${fmtNum(t.pointsNow)}",
                    style = PixelType.Big,
                    color = PixelColors.Ink,
                )
                Spacer(Modifier.height(4.dp))
                val isBusy = busyGoalId == g.id
                Box(
                    modifier = Modifier
                        .background(if (isBusy) PixelColors.LineStrong else PixelColors.Green)
                        .pixelBorder(2.dp, PixelColors.Outline)
                        .clickAndLongPress(
                            onClick = { if (!isBusy) onOpenCheckin() },
                            onLongPress = { if (!isBusy) onInstant() },
                        )
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (isBusy) "…" else "✓ 完成",
                        style = PixelType.Body,
                        color = PixelColors.White,
                    )
                }
            }
        }
    }
}

/** 已完成卡（对齐 Web 版 doneCard） */
@Composable
private fun DoneCard(t: Todo) {
    val g = t.goal
    val checked = t.checked
    val hasRecord = checked?.evidenceText?.isNotBlank() == true
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .background(PixelColors.GreenSoft)
                    .pixelBorder(2.dp, PixelColors.Outline)
                    .padding(8.dp),
            ) {
                Text(g.emoji, style = PixelType.Title)
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(g.title, style = PixelType.Body, color = PixelColors.Ink)
                Text(
                    text = "${checked?.durationMin ?: 0} 分钟" + if (hasRecord) " · 有记录" else "",
                    style = PixelType.Small,
                    color = PixelColors.Ink2,
                )
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "+${fmtNum(checked?.points ?: 0)}",
                    style = PixelType.Big,
                    color = PixelColors.GreenDeep,
                )
                Spacer(Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .background(PixelColors.Green)
                        .pixelBorder(2.dp, PixelColors.Outline)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text("✓", style = PixelType.Small, color = PixelColors.White)
                }
            }
        }
    }
}

/** 板块标题：■ 前缀 + 右侧计数（对齐 Web sec-head） */
@Composable
private fun SectionHead(title: String, count: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(10.dp).background(PixelColors.Ink))
            Spacer(Modifier.width(8.dp))
            Text(title, style = PixelType.Title, color = PixelColors.Ink)
        }
        if (count.isNotBlank()) {
            Text(count, style = PixelType.Small, color = PixelColors.Ink2)
        }
    }
}

@Composable
private fun NoPermissionCard(onOpenUsageSettings: () -> Unit) {
    PixelPanel(modifier = Modifier.fillMaxWidth(), background = PixelColors.OrangeSoft) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("还没开启使用情况访问", style = PixelType.Title, color = PixelColors.Ink)
            Spacer(Modifier.height(8.dp))
            Text(
                text = "开启后脚印才能知道你今天在手机上花了多久，好让 ta 看见。" +
                    "只给 ta 看，不发给任何第三方。",
                style = PixelType.Small,
                color = PixelColors.Ink2,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "没开权限时我们不显示 0 分钟 —— 那不代表你今天没玩手机。",
                style = PixelType.Small,
                color = PixelColors.OrangeDeep,
            )
            Spacer(Modifier.height(16.dp))
            PixelSmallButton(text = "去开启", onClick = onOpenUsageSettings)
        }
    }
}

@Composable
private fun MyUsageCard(
    totalSeconds: Long,
    apps: List<AppUsage>,
    hasData: Boolean,
    syncNote: String?,
) {
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("我 · 今天", style = PixelType.Title, color = PixelColors.Ink)
                if (syncNote != null) {
                    PixelChip(text = "未同步")
                } else if (hasData) {
                    PixelChip(text = "已同步", bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
                }
            }

            Spacer(Modifier.height(8.dp))
            Text(
                text = AppViewModel.humanDuration(totalSeconds),
                style = PixelType.Huge,
                color = PixelColors.GreenDeep,
            )

            if (syncNote != null) {
                Spacer(Modifier.height(4.dp))
                Text(syncNote, style = PixelType.Small, color = PixelColors.OrangeDeep)
            }

            if (apps.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                val max = apps.first().seconds.coerceAtLeast(1L)
                for (a in AppViewModel.top(apps, 5)) {
                    AppRow(a, max, PixelColors.Green)
                }
            } else if (hasData) {
                Spacer(Modifier.height(8.dp))
                Text("今天还没有应用使用记录", style = PixelType.Small, color = PixelColors.Ink3)
            }
        }
    }
}

@Composable
private fun PartnerCard(
    username: String,
    totalSeconds: Long,
    apps: List<AppUsage>,
    lastReportAt: String?,
    hasPartner: Boolean,
) {
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("$username · 今天", style = PixelType.Title, color = PixelColors.Ink)
            Spacer(Modifier.height(8.dp))

            if (!hasPartner) {
                Text(
                    text = "还没拿到 ta 的数据。如果有搭档，多半是网络或还没同步，回到 App 会自动重试。",
                    style = PixelType.Small,
                    color = PixelColors.Ink3,
                )
                return@Column
            }

            // 没数据时绝不显示 "0 分钟" —— 那和"今天真的没玩手机"分不出来（文档 16.8 第 1 条的同一条原则）
            val noData = totalSeconds <= 0L && apps.isEmpty()
            if (noData) {
                Text(
                    text = "今天还没有 ta 的数据",
                    style = PixelType.Title,
                    color = PixelColors.Ink3,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "ta 打开脚印手机版并同步后，这里就会出现",
                    style = PixelType.Small,
                    color = PixelColors.Ink2,
                )
                return@Column
            }

            Text(
                text = AppViewModel.humanDuration(totalSeconds),
                style = PixelType.Huge,
                color = PixelColors.OrangeDeep,
            )
            Spacer(Modifier.height(4.dp))

            val clock = AppViewModel.clockOf(lastReportAt)
            Text(
                text = if (clock != null) "ta 最近一次同步于 $clock" else "ta 今天还没同步过",
                style = PixelType.Small,
                color = PixelColors.Ink2,
            )

            if (apps.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                val max = apps.first().seconds.coerceAtLeast(1L)
                for (a in AppViewModel.top(apps, 5)) {
                    AppRow(a, max, PixelColors.Orange)
                }
            }
        }
    }
}

/** 一行应用：名字 + 条形 + 时长 */
@Composable
private fun AppRow(a: AppUsage, maxSeconds: Long, color: Color) {
    Column(modifier = Modifier.padding(vertical = 6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = a.appName.ifBlank { a.packageName },
                style = PixelType.Body,
                color = PixelColors.Ink,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = AppViewModel.humanDuration(a.seconds),
                style = PixelType.Small,
                color = PixelColors.Ink2,
            )
        }
        Spacer(Modifier.height(4.dp))
        PixelBar(
            fraction = a.seconds.toFloat() / maxSeconds.toFloat(),
            modifier = Modifier.fillMaxWidth(),
            color = color,
        )
    }
}

// ==================== 首页辅助组件 ====================

/** Web 版 UI.greeting() 的等价实现：按小时问候 */
private fun greetingText(): String {
    val h = LocalDateTime.now().hour
    return when {
        h < 6 -> "夜深了"
        h < 11 -> "早上好"
        h < 14 -> "中午好"
        h < 18 -> "下午好"
        h < 23 -> "晚上好"
        else -> "夜深了"
    }
}

/** "X月X日 周X"，对齐 Web 版 date-line */
private fun todayLabel(): String {
    val d = LocalDate.now()
    val wd = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")[d.dayOfWeek.value - 1]
    return "${d.monthValue}月${d.dayOfMonth}日 $wd"
}

/** 积分横幅：深绿底白字 + 火焰连续天数 + 本月得分（对齐 Web balance-banner） */
@Composable
private fun BalanceBanner(balance: Int, currentStreak: Int, monthPoints: Int) {
    PixelPanel(modifier = Modifier.fillMaxWidth(), background = PixelColors.Green) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("✏ 可用积分", style = PixelType.Small, color = PixelColors.White)
                Text(
                    text = fmtNum(balance),
                    style = PixelType.Huge,
                    color = PixelColors.White,
                )
                Text(
                    text = "≈ ¥" + fmtYuan(balance),
                    style = PixelType.Small,
                    color = PixelColors.GreenSoft,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                PixelChip(
                    text = "🔥 $currentStreak 天连续",
                    bg = PixelColors.OrangeSoft,
                    fg = PixelColors.OrangeDeep,
                )
                Spacer(Modifier.height(8.dp))
                PixelChip(
                    text = "本月 +${fmtNum(monthPoints)}",
                    bg = PixelColors.Card,
                    fg = PixelColors.Ink2,
                )
            }
        }
    }
}

/** 进行中的小目标（首页迷你卡，对齐 Web stageMiniCard）：截止日期 + 状态 chip + 可点跳目标页 */
@Composable
private fun StageMiniList(goals: List<StageGoal>, onSelectTab: (MainTab) -> Unit) {
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("进行中的小目标", style = PixelType.Title, color = PixelColors.Ink)
                Text("${goals.size} 个", style = PixelType.Mono, color = PixelColors.Ink3)
            }
            Spacer(Modifier.height(10.dp))
            for (g in goals) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .dashedDivider()
                        .clickable { onSelectTab(MainTab.Goals) }
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(g.emoji.ifBlank { "🎯" }, style = PixelType.Title)
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(g.title, style = PixelType.Body, color = PixelColors.Ink)
                        Text(
                            text = buildList {
                                g.end_date?.let { add("截止 " + fmtDate(it)) }
                                add("达成 +" + fmtNum(g.total_points ?: 0) + " 分")
                            }.joinToString(" · "),
                            style = PixelType.Small,
                            color = PixelColors.Ink2,
                        )
                    }
                    if (g.status == "reviewing") {
                        PixelChip(text = "待验收", bg = PixelColors.OrangeSoft, fg = PixelColors.OrangeDeep)
                    } else {
                        PixelChip(text = "进行中", bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
                    }
                }
            }
        }
    }
}

/** 当前小目标（计划链已释放的，对齐 Web「当前小目标」卡；P1-#8）；点击开大目标详情 */
@Composable
private fun PlanMiniList(goals: List<PlanGoalDto>, onOpenBigGoal: (Long) -> Unit) {
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("当前小目标", style = PixelType.Title, color = PixelColors.Ink)
                Text("大目标路线", style = PixelType.Mono, color = PixelColors.Ink3)
            }
            Spacer(Modifier.height(10.dp))
            for (g in goals) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .dashedDivider()
                        .clickable { if (g.big_goal_id != 0L) onOpenBigGoal(g.big_goal_id) }
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(g.emoji ?: "🎯", style = PixelType.Title)
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(g.title, style = PixelType.Body, color = PixelColors.Ink)
                        Text(
                            text = g.big_goal_title + (g.planned_date?.let { " · 计划 " + fmtDate(it) } ?: ""),
                            style = PixelType.Small,
                            color = PixelColors.Ink2,
                        )
                    }
                    PixelChip(text = "进行中", bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
                }
            }
        }
    }
}

// ==================== 首页新增组件（全量对齐 Web 首页） ====================

/** 顶栏：问候 + 日期 + 退出（游客态不显示退出） */
@Composable
private fun HomeTopBar(
    greeting: String,
    date: String,
    showLogout: Boolean,
    onLogout: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(text = greeting, style = PixelType.Big, color = PixelColors.Ink)
            Text(text = date, style = PixelType.Small, color = PixelColors.Ink3)
        }
        if (showLogout) {
            PixelSmallButton(text = "退出", onClick = onLogout, filled = false)
        }
    }
}

/** 游客态首页：0 值积分横幅 + 空态 + 登录/注册入口（对齐 Web home.js:4-48） */
@Composable
private fun GuestHome(vm: AppViewModel, onSelectTab: (MainTab) -> Unit) {
    BalanceBanner(0, 0, 0)
    Spacer(Modifier.height(16.dp))
    SectionHead("今日待办", "")
    Spacer(Modifier.height(10.dp))
    HomeEmptyGoals(onSelectTab)
    Spacer(Modifier.height(20.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        PixelButton(text = "登录", onClick = { vm.showAuth("login") }, modifier = Modifier.weight(1f))
        PixelSmallButton(
            text = "注册",
            onClick = { vm.showAuth("register") },
            filled = false,
            modifier = Modifier.weight(1f),
        )
    }
}

/** 空态：今天还没有目标 +「去建目标」→ 目标页 */
@Composable
private fun HomeEmptyGoals(onSelectTab: (MainTab) -> Unit) {
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(20.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("🌱", style = PixelType.Huge)
            Spacer(Modifier.height(8.dp))
            Text("今天还没有目标", style = PixelType.Title, color = PixelColors.Ink)
            Spacer(Modifier.height(4.dp))
            Text(
                "去「目标」页建第一个打卡目标，两个人就都看得见了",
                style = PixelType.Small,
                color = PixelColors.Ink2,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(16.dp))
            PixelButton(
                text = "去建目标",
                onClick = { onSelectTab(MainTab.Goals) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** 首页聚合失败：😿 + 错误文案 + 重试（对齐 Web 首页 catch 分支） */
@Composable
private fun HomeError(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 72.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("😿", style = PixelType.Huge)
        Spacer(Modifier.height(12.dp))
        Text(message, style = PixelType.Body, color = PixelColors.Ink2, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        PixelButton(text = "重试", onClick = onRetry)
    }
}

/** 首页数据还没到：加载中… */
@Composable
private fun HomeLoading() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 72.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("加载中…", style = PixelType.Body, color = PixelColors.Ink2)
    }
}

/** 对方动态条（对齐 Web home.js:139-147,204-208） */
@Composable
private fun PartnerStrip(partner: UserDto, partnerToday: PartnerToday?, onGo: () -> Unit) {
    PixelPanel(modifier = Modifier.fillMaxWidth(), background = PixelColors.Bg2) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(partner.avatar ?: "🐻", style = PixelType.Title)
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(partner.username, style = PixelType.Body, color = PixelColors.Ink)
                val sub = partnerTodayText(partnerToday)
                if (sub.isNotBlank()) {
                    Text(sub, style = PixelType.Small, color = PixelColors.Ink2)
                }
            }
            Spacer(Modifier.width(8.dp))
            PixelSmallButton(text = "去看看", onClick = onGo, filled = false)
        }
    }
}

private fun partnerTodayText(pt: PartnerToday?): String {
    if (pt == null) return ""
    if (pt.checked <= 0) {
        return if (pt.expected > 0) "今天还有 ${pt.expected} 张卡没打" else "今天还没打卡"
    }
    return if (pt.expected > pt.checked) {
        "今天打了 ${pt.checked}/${pt.expected} 张卡"
    } else {
        "今天 ${pt.expected} 张卡全打完啦 🎉"
    }
}

/** 卡片依次浮入（按 index 错峰，对齐 Web home.js:196-200 的 stagger-in） */
@Composable
private fun StaggerIn(index: Int, content: @Composable () -> Unit) {
    var shown by remember { mutableStateOf(false) }
    val delay = minOf(index * 60, 360)
    val cardAlpha by animateFloatAsState(
        targetValue = if (shown) 1f else 0f,
        animationSpec = tween(durationMillis = 260, delayMillis = delay),
    )
    val cardShift by animateFloatAsState(
        targetValue = if (shown) 0f else 18f,
        animationSpec = tween(durationMillis = 260, delayMillis = delay),
    )
    LaunchedEffect(Unit) { shown = true }
    Box(
        modifier = Modifier.graphicsLayer {
            alpha = cardAlpha
            translationY = cardShift
        },
    ) {
        content()
    }
}

/**
 * 首页打卡弹层（对齐 Web CheckinSheet.open / checkin.js:3-133）：
 * 时长 chips 15/30/45/60 + −/+5 步进(1–1440)、可选文字/图片证据、实时积分预览、
 * 时长偏离提示、按钮「打卡」、防连点。提交后 toast「打卡成功，+N 分已入账」并逐条
 * 提示「🔥 连续 n 达成，额外 +X 分」（ViewModel 的 checkin 不返回 CheckinResult，
 * 这里直接走 Api.checkin 拿 bonuses；长按 instant 仍走 vm.checkin）。
 */
@Composable
private fun HomeCheckinDialog(
    goal: GoalRef,
    vm: AppViewModel,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val base = goal.duration_min.takeIf { it > 0 } ?: 30

    var duration by remember { mutableStateOf(base) }
    var evidenceText by remember { mutableStateOf("") }
    var evidenceId by remember { mutableStateOf<Long?>(null) }
    var evidenceLabel by remember { mutableStateOf<String?>(null) }
    var uploading by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var serverPoints by remember { mutableStateOf<Int?>(null) }

    // 本地公式即时给分，服务端 /api/points/preview 到了再覆盖
    val shownPoints = serverPoints ?: localPreviewPoints(goal, duration)
    val note = when {
        duration * 2 > base * 3 -> "比设定时长多了 ${duration - base} 分钟，按实际填就好"
        duration > 0 && duration * 2 < base -> "比设定时长少了一半，对方看得见哦"
        else -> ""
    }

    // 「本次预计 +N 分」：Api.previewPoints 实时算（Web app.js:13-32 同公式）
    LaunchedEffect(duration) {
        serverPoints = null
        val token = Session.token(context) ?: return@LaunchedEffect
        try {
            val r = Api.previewPoints(
                token,
                PointsPreviewRequest(
                    freq_mode = goal.freq_mode,
                    freq_n = goal.freq_n,
                    weekdays = goal.weekdays,
                    duration_min = duration,
                    difficulty = goal.difficulty,
                    window_start = goal.window_start,
                    window_end = goal.window_end,
                    custom_points = goal.custom_points,
                ),
            )
            serverPoints = r.points
        } catch (_: Exception) {
            serverPoints = null
        }
    }

    // 图片证据：选图 → 上传拿 id，提交时带进 checkin（与 GoalsScreen 同款 uploadEvidence）
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploading = true
            errorMsg = null
            try {
                evidenceId = uploadEvidence(context, uri)
                evidenceLabel = "✓ 已添加图片"
            } catch (e: Exception) {
                errorMsg = e.message ?: "图片上传失败"
            } finally {
                uploading = false
            }
        }
    }

    fun submit() {
        if (submitted || uploading) return
        submitted = true
        errorMsg = null
        val token = Session.token(context)
        if (token == null) {
            submitted = false
            errorMsg = "请先登录"
            return
        }
        scope.launch {
            try {
                val r = Api.checkin(
                    token,
                    goal.id,
                    duration,
                    evidenceText.trim().ifBlank { null },
                    evidenceId,
                )
                onDismiss()
                Toast.makeText(context, "打卡成功，+${fmtNum(r.points)} 分已入账", Toast.LENGTH_SHORT).show()
                r.bonuses.forEach { b ->
                    Toast.makeText(
                        context,
                        "🔥 连续 ${b.n} 达成，额外 +${fmtNum(b.points)} 分",
                        Toast.LENGTH_SHORT,
                    ).show()
                }
                vm.refreshAll()
            } catch (e: Exception) {
                submitted = false
                errorMsg = e.message ?: "打卡失败"
            }
        }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PixelPanel(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("打卡", style = PixelType.Title, color = PixelColors.Ink)
                    Spacer(Modifier.height(12.dp))

                    // 目标信息
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .background(PixelColors.GreenSoft)
                                .pixelBorder(2.dp, PixelColors.Outline)
                                .padding(6.dp),
                        ) {
                            Text(goal.emoji, style = PixelType.Title)
                        }
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(goal.title, style = PixelType.Body, color = PixelColors.Ink)
                            Text(
                                text = if (goal.window_start != null) {
                                    "窗口 ${goal.window_start}–${goal.window_end} · 难度 ${goal.difficulty}"
                                } else {
                                    "全天可打 · 难度 ${goal.difficulty}"
                                },
                                style = PixelType.Small,
                                color = PixelColors.Ink2,
                            )
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    // 实际时长 chips：15/30/45/60
                    Text("实际时长", style = PixelType.Small, color = PixelColors.Ink2)
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        for (c in listOf(15, 30, 45, 60)) {
                            val on = duration == c
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .background(if (on) PixelColors.GreenSoft else PixelColors.Card)
                                    .pixelBorder(2.dp, if (on) PixelColors.Green else PixelColors.Outline)
                                    .clickable { duration = c }
                                    .padding(vertical = 8.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("$c′", style = PixelType.Small, color = if (on) PixelColors.GreenDeep else PixelColors.Ink2)
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    // −/+5 步进，范围 1–1440
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        PixelSmallButton(text = "−", filled = false, onClick = { duration = maxOf(1, duration - 5) })
                        Spacer(Modifier.width(12.dp))
                        Text("$duration 分钟", style = PixelType.Mono, color = PixelColors.Ink)
                        Spacer(Modifier.width(12.dp))
                        PixelSmallButton(text = "+", filled = false, onClick = { duration = minOf(1440, duration + 5) })
                    }

                    Spacer(Modifier.height(14.dp))

                    // 留句话或图（可选）
                    Text("留句话或图（可选）", style = PixelType.Small, color = PixelColors.Ink2)
                    Spacer(Modifier.height(6.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(PixelColors.Card)
                            .pixelBorder(2.dp, PixelColors.Outline)
                            .padding(12.dp),
                    ) {
                        if (evidenceText.isEmpty()) {
                            Text("比如：今天背了 50 个新词", style = PixelType.Body, color = PixelColors.Ink3)
                        }
                        BasicTextField(
                            value = evidenceText,
                            onValueChange = { if (it.length <= 200) evidenceText = it },
                            textStyle = PixelType.Body.copy(color = PixelColors.Ink),
                            cursorBrush = SolidColor(PixelColors.Green),
                            minLines = 2,
                            maxLines = 3,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PixelSmallButton(
                            text = if (uploading) "上传中…" else "📷 加一张图",
                            filled = false,
                            onClick = { if (!uploading) pickImage.launch("image/*") },
                        )
                        if (evidenceLabel != null) {
                            Spacer(Modifier.width(10.dp))
                            Text(evidenceLabel!!, style = PixelType.Small, color = PixelColors.GreenDeep)
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    // 本次预计 +N 分
                    PixelPanel(background = PixelColors.Bg2, borderColor = PixelColors.LineStrong) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("本次预计", style = PixelType.Small, color = PixelColors.Ink3)
                            Spacer(Modifier.weight(1f))
                            Text("+${fmtNum(shownPoints)}", style = PixelType.Big, color = PixelColors.GreenDeep)
                        }
                    }
                    if (note.isNotBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text(note, style = PixelType.Small, color = PixelColors.OrangeDeep)
                    }
                    if (errorMsg != null) {
                        Spacer(Modifier.height(6.dp))
                        Text(errorMsg!!, style = PixelType.Small, color = PixelColors.RedDeep)
                    }

                    Spacer(Modifier.height(16.dp))

                    Row(modifier = Modifier.fillMaxWidth()) {
                        PixelSmallButton(
                            text = "取消",
                            onClick = onDismiss,
                            filled = false,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(12.dp))
                        PixelButton(
                            text = if (submitted) "打卡中…" else "打卡",
                            onClick = { submit() },
                            enabled = !submitted,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

// ==================== 首页工具函数 ====================

/** 选图 → 读字节 → 上传证据，返回后端 file id（与 GoalsScreen 同款写法） */
private suspend fun uploadEvidence(context: android.content.Context, uri: Uri): Long {
    val token = Session.token(context) ?: throw IllegalStateException("未登录")
    val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
    val ext = when {
        mime.contains("png") -> "png"
        mime.contains("webp") -> "webp"
        mime.contains("gif") -> "gif"
        else -> "jpg"
    }
    val bytes = withContext(Dispatchers.IO) {
        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
    } ?: throw IllegalStateException("读不到图片")
    if (bytes.size > 10 * 1024 * 1024) throw IllegalStateException("图片别超过 10MB")
    return Api.uploadEvidence(token, bytes, ext).id
}

/** 点击开弹层、按住 550ms 直接打卡（对齐 Web home.js:150-169 的长按计时） */
private fun Modifier.clickAndLongPress(
    onClick: () -> Unit,
    onLongPress: () -> Unit,
): Modifier = pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown()
        down.consume()
        try {
            withTimeout(550L) {
                // 等这根手指抬起
                while (true) {
                    val event = awaitPointerEvent()
                    val change = event.changes.firstOrNull { it.id == down.id }
                    if (change == null || change.changedToUp()) {
                        change?.consume()
                        break
                    }
                    event.changes.forEach { it.consume() }
                }
            }
            onClick()
        } catch (_: TimeoutCancellationException) {
            onLongPress()
            // 长按后等所有指针抬起，别把松手又当成一次点击
            while (true) {
                val event = awaitPointerEvent()
                val released = event.changes.all { !it.pressed }
                event.changes.forEach { it.consume() }
                if (released) break
            }
        }
    }
}

/** 千分位（对齐 Web UI.fmtNum） */
private fun fmtNum(n: Int): String = String.format(Locale.US, "%,d", n)

/** ≈ ¥ 后的金额：无小数时省略 .0，最多一位小数、带千分位（对齐 Web UI.fmtYuan） */
private fun fmtYuan(points: Int): String {
    val whole = points / 10
    val frac = points % 10
    val w = String.format(Locale.US, "%,d", whole)
    return if (frac == 0) w else "$w.$frac"
}

/** '2026-11-02' → '11月2日'（对齐 Web UI.fmtDate） */
private fun fmtDate(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val parts = iso.split("-")
    if (parts.size < 3) return iso
    val m = parts[1].toIntOrNull() ?: return iso
    val d = parts[2].toIntOrNull() ?: return iso
    return "${m}月${d}日"
}

/**
 * Web app.js:13-32 __calcClient 的本地等价：改时长立刻给分，网络预览到了再覆盖。
 * B=min(duration*unit,cap)，D=difficulty，F=freq，T=窗户内/窗外/无，最终 min(round(B*D*F*T), maxPer)。
 */
private fun localPreviewPoints(goal: GoalRef, duration: Int): Int {
    val cp = goal.custom_points
    if (cp != null && cp > 0) return cp
    val b = minOf(duration * 0.5, 60.0)
    val d = when (goal.difficulty) {
        1 -> 1.0
        2 -> 1.2
        3 -> 1.5
        4 -> 1.8
        5 -> 2.2
        else -> 1.5
    }
    val f = when (goal.freq_mode) {
        "daily" -> 1.0
        "weekly" -> if (goal.freq_n >= 3) 1.2 else 1.5
        else -> 1.0
    }
    val ws = goal.window_start
    val we = goal.window_end
    val inWin = if (ws != null && we != null) {
        val now = LocalDateTime.now()
        val cur = now.hour * 60 + now.minute
        val (h1, m1) = parseHM(ws)
        val (h2, m2) = parseHM(we)
        cur >= h1 * 60 + m1 && cur < h2 * 60 + m2
    } else {
        false
    }
    val t = if (inWin) 1.1 else if (ws != null) 0.8 else 1.0
    return minOf(kotlin.math.round(b * d * f * t).toInt(), 300)
}

/** "HH:mm" → Pair(时, 分) */
private fun parseHM(s: String): Pair<Int, Int> {
    val p = s.split(":")
    return (p.getOrNull(0)?.toIntOrNull() ?: 0) to (p.getOrNull(1)?.toIntOrNull() ?: 0)
}
