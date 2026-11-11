// 大目标 UI（P1-#8）：列表概览、整条路线详情（含未启动）、手改、顺延/提前、新建/编辑。
// 规则对齐 Web：未启动的不进统计/对方页；手改优先于 AI 重排；重排只碰 planned。
package me.footprint.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import me.footprint.app.net.Api
import me.footprint.app.net.BigGoalDetailResponse
import me.footprint.app.net.BigGoalDto
import me.footprint.app.net.BigGoalPayload
import me.footprint.app.net.ChainBindPayload
import me.footprint.app.net.ChainEditPayload
import me.footprint.app.net.ChainGoalDto
import me.footprint.app.net.GoalPayload
import me.footprint.app.net.Session
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType

/** 上海时区的今天（yyyy-MM-dd） */
private fun todayShanghai(): String =
    java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString()

/** ISO 时间戳 → 'M月d日 HH:mm'（对齐 Web UI.fmtTimeIso） */
private fun fmtDateTime(iso: String): String {
    return try {
        val t = java.time.Instant.parse(iso).atZone(java.time.ZoneId.of("Asia/Shanghai"))
        "${t.monthValue}月${t.dayOfMonth}日 ${String.format("%02d", t.hour)}:${String.format("%02d", t.minute)}"
    } catch (e: Exception) {
        iso
    }
}

/** 大目标状态文案（对齐 Web statusText） */
private fun bigStatusText(status: String): String = when (status) {
    "active" -> "推进中"
    "done" -> "已达成"
    "archived" -> "已归档"
    else -> ""
}

/** '2026-11-02' → '11月2日'（对齐 Web UI.fmtDate；GoalsScreen 的 fmtDate 是 file-private，这里自带一份） */
private fun fmtDateSh(s: String?): String {
    if (s.isNullOrBlank()) return ""
    val p = s.split('-')
    if (p.size < 3) return s
    val m = p[1].toIntOrNull() ?: return s
    val d = p[2].toIntOrNull() ?: return s
    return "${m}月${d}日"
}

/** 大目标列表：概览卡（进度条 + 客观计数 + AI 进度说明），点卡开详情 */
@Composable
fun BigGoalsView(
    goals: List<BigGoalDto>?,
    loading: Boolean,
    onNew: () -> Unit,
    onOpen: (Long) -> Unit,
    onZoovy: (Long) -> Unit = {},
) {
    if (loading && goals == null) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Text("加载中…", style = PixelType.Body, color = PixelColors.Ink2, modifier = Modifier.padding(16.dp))
        }
        return
    }
    val list = goals ?: emptyList()
    if (list.isEmpty()) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("🏔️", style = PixelType.Big)
                Spacer(Modifier.height(6.dp))
                Text("还没有大目标", style = PixelType.Title, color = PixelColors.Ink)
                Spacer(Modifier.height(4.dp))
                Text(
                    "大目标是长期方向，不能打卡，\n只能靠路线上的小目标推进",
                    style = PixelType.Small,
                    color = PixelColors.Ink2,
                )
                Spacer(Modifier.height(12.dp))
                PixelButton(text = "建一个大目标", onClick = onNew)
            }
        }
        return
    }
    for (b in list) {
        PixelPanel(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 10.dp)
                .clickable { onOpen(b.id) },
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(b.emoji, style = PixelType.Title)
                    Spacer(Modifier.width(8.dp))
                    Text(b.title, style = PixelType.Title, color = PixelColors.Ink, modifier = Modifier.weight(1f))
                    PixelChip(text = "${b.progress}%", bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
                }
                Spacer(Modifier.height(8.dp))
                PixelBar(fraction = b.progress / 100f)
                Spacer(Modifier.height(6.dp))
                Text(
                    "客观 ${b.done}/${b.total} 个小目标达成" + (b.progress_note.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
                    style = PixelType.Small,
                    color = PixelColors.Ink2,
                )
                Spacer(Modifier.height(10.dp))
                // 对齐 Web bigCard：每张卡直接给一个 zoowy 拆计划入口
                PixelSmallButton(
                    text = "🐾 让 zoowy 拆计划",
                    onClick = { onZoovy(b.id) },
                    filled = false,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
    Spacer(Modifier.height(8.dp))
    PixelButton(text = "＋ 再建一个大目标", onClick = onNew, modifier = Modifier.fillMaxWidth())
}

/** 大目标详情：整条路线（含未启动）+ 手改 + 顺延 + 解绑 */
@Composable
fun BigGoalDetailDialog(
    bigGoalId: Long,
    context: android.content.Context,
    onDismiss: () -> Unit,
    onChanged: () -> Unit,
    onEdit: (BigGoalDto) -> Unit,
    // 给默认值：Screens.kt 的 5 参数调用不受影响
    onZoovy: (Long) -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<BigGoalDetailResponse?>(null) }
    var toast by remember { mutableStateOf<String?>(null) }
    var editTarget by remember { mutableStateOf<ChainGoalDto?>(null) }
    var showShift by remember { mutableStateOf(false) }
    var showAddChain by remember { mutableStateOf(false) }
    var unbindTarget by remember { mutableStateOf<ChainGoalDto?>(null) }

    fun reload() {
        val token = Session.token(context) ?: return
        scope.launch {
            try {
                detail = Api.getBigGoal(token, bigGoalId)
            } catch (e: Exception) {
                toast = e.message ?: "加载失败"
            }
        }
    }
    LaunchedEffect(bigGoalId) { reload() }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
        ) {
            PixelPanel(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    val d = detail
                    if (d == null) {
                        Text("加载中…", style = PixelType.Body, color = PixelColors.Ink2)
                    } else {
                        val bg = d.bigGoal
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(bg.emoji, style = PixelType.Big)
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(bg.title, style = PixelType.Title, color = PixelColors.Ink)
                                Text(
                                    "${bigStatusText(bg.status)} · 客观 ${d.done}/${d.total} 个小目标达成",
                                    style = PixelType.Small,
                                    color = PixelColors.Ink2,
                                )
                            }
                            PixelChip(text = "${bg.progress}%", bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
                        }
                        Spacer(Modifier.height(8.dp))
                        PixelBar(fraction = bg.progress / 100f)
                        Spacer(Modifier.height(4.dp))
                        // 对齐 Web：zoowy 估的进度
                        Text("zoowy 估的进度 ${bg.progress}%", style = PixelType.Small, color = PixelColors.Ink3)
                        if (bg.progress_note.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "zoowy：${bg.progress_note}" + (bg.progress_at?.let { " · ${fmtDateTime(it)}" } ?: ""),
                                style = PixelType.Small,
                                color = PixelColors.Ink2,
                            )
                        }
                        if (bg.description.isNotBlank()) {
                            Spacer(Modifier.height(6.dp))
                            Text(bg.description, style = PixelType.Small, color = PixelColors.Ink2)
                        }
                        Spacer(Modifier.height(12.dp))
                        Text("整条路线（含未启动）", style = PixelType.Mono, color = PixelColors.Ink2)
                        Spacer(Modifier.height(6.dp))
                        if (d.chain.isEmpty()) {
                            Text("还没有小目标，去「小目标」页建一个，再回来挂在路线上", style = PixelType.Small, color = PixelColors.Ink3)
                        }
                        for (g in d.chain) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .dashedDivider()
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("${g.emoji ?: "🎯"} ${g.title}", style = PixelType.Body, color = PixelColors.Ink)
                                    Text(
                                        text = buildString {
                                            append(g.planned_date?.let { "计划 ${fmtDateSh(it)}" } ?: "未排日期")
                                            // 已逾期：有计划日期、未达成、还没做完的
                                            val pd = g.planned_date
                                            val overdue = pd != null && g.plan_status != "done" &&
                                                g.status != "achieved" && pd < todayShanghai()
                                            if (overdue) append(" 已逾期")
                                            append(" · ")
                                            append(
                                                when (g.plan_status) {
                                                    "planned" -> "未启动"
                                                    "released" -> "进行中"
                                                    "done" -> "已达成"
                                                    else -> "未绑定"
                                                },
                                            )
                                            // 对齐 Web stateLabel：待验收 / 已放弃 / 已达成
                                            val stateLabel = when (g.status) {
                                                "achieved" -> "已达成 ✓"
                                                "reviewing" -> "待验收"
                                                "abandoned" -> "已放弃"
                                                else -> ""
                                            }
                                            if (stateLabel.isNotBlank()) append(" · $stateLabel")
                                        },
                                        style = PixelType.Small,
                                        color = PixelColors.Ink2,
                                    )
                                    g.accept_criteria?.takeIf { it.isNotBlank() }?.let {
                                        Text(it, style = PixelType.Small, color = PixelColors.Ink3, maxLines = 2)
                                    }
                                }
                                if (g.status != "achieved" && g.status != "abandoned") {
                                    PixelSmallButton(text = "改", onClick = { editTarget = g })
                                    // 对齐 Web：只有未启动(planned) 才能从路线里移出
                                    if (g.plan_status == "planned") {
                                        Spacer(Modifier.width(6.dp))
                                        PixelSmallButton(text = "移出", onClick = { unbindTarget = g }, filled = false)
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(modifier = Modifier.fillMaxWidth()) {
                            PixelSmallButton(text = "和 zoowy 讨论", onClick = { onZoovy(bigGoalId) }, filled = false, modifier = Modifier.weight(1f))
                            Spacer(Modifier.width(8.dp))
                            PixelSmallButton(text = "加个小目标", onClick = { showAddChain = true }, filled = false, modifier = Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(modifier = Modifier.fillMaxWidth()) {
                            PixelSmallButton(text = "编辑", onClick = { onEdit(bg) }, filled = false, modifier = Modifier.weight(1f))
                            Spacer(Modifier.width(8.dp))
                            PixelSmallButton(text = "顺延 / 提前", onClick = { showShift = true }, filled = false, modifier = Modifier.weight(1f))
                            Spacer(Modifier.width(8.dp))
                            PixelButton(text = "关掉", onClick = onDismiss, modifier = Modifier.weight(1f))
                        }
                    }
                    toast?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = PixelType.Small, color = PixelColors.OrangeDeep)
                    }
                }
            }
        }
    }

    editTarget?.let { g ->
        ChainGoalEditDialog(
            goal = g,
            context = context,
            bigGoalId = bigGoalId,
            onDismiss = { editTarget = null },
            onSaved = {
                editTarget = null
                reload()
                onChanged()
            },
        )
    }

    if (showShift) {
        ShiftDialog(
            context = context,
            bigGoalId = bigGoalId,
            onDismiss = { showShift = false },
            onSaved = { moved ->
                showShift = false
                toast = "挪了 $moved 项"
                reload()
                onChanged()
            },
        )
    }

    // 往路线末尾加个小目标（先建 stage 目标，再挂链）
    if (showAddChain) {
        AddChainGoalDialog(
            bigGoalId = bigGoalId,
            chainLen = detail?.chain?.size ?: 0,
            context = context,
            onDismiss = { showAddChain = false },
            onSaved = {
                showAddChain = false
                toast = "已挂到路线末尾"
                reload()
                onChanged()
            },
        )
    }

    // 移出路线：二次确认（Web 文案）→ unbindChainGoal
    unbindTarget?.let { target ->
        PixelConfirmDialog(
            title = "从路线里移出",
            message = "把「${target.title}」从路线里移出？目标本身不删，只是不再挂在路线上。",
            okLabel = "移出",
            cancelLabel = "再想想",
            onOk = {
                val token = Session.token(context)
                if (token == null) {
                    unbindTarget = null
                } else {
                    scope.launch {
                        try {
                            Api.unbindChainGoal(token, bigGoalId, target.id)
                            toast = "已移出路线"
                            unbindTarget = null
                            reload()
                            onChanged()
                        } catch (e: Exception) {
                            toast = e.message ?: "操作失败"
                            unbindTarget = null
                        }
                    }
                }
            },
            onCancel = { unbindTarget = null },
        )
    }
}

/** 手改链上小目标：日期 / 名称 / 验收标准 / 顺序（手改过的，zoowy 重排时默认不动） */
@Composable
private fun ChainGoalEditDialog(
    goal: ChainGoalDto,
    context: android.content.Context,
    bigGoalId: Long,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf(goal.title) }
    var date by remember { mutableStateOf(goal.planned_date ?: "") }
    var criteria by remember { mutableStateOf(goal.accept_criteria ?: "") }
    var order by remember { mutableStateOf((goal.plan_order ?: 1).toString()) }
    var saving by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("改路线上的小目标", style = PixelType.Title, color = PixelColors.Ink)
                Spacer(Modifier.height(10.dp))
                PixelTextField(value = title, onValueChange = { title = it }, placeholder = "名称")
                Spacer(Modifier.height(8.dp))
                PixelTextField(value = date, onValueChange = { date = it }, placeholder = "计划日期 YYYY-MM-DD")
                Spacer(Modifier.height(8.dp))
                PixelTextField(value = criteria, onValueChange = { criteria = it }, placeholder = "验收标准")
                Spacer(Modifier.height(8.dp))
                PixelTextField(
                    value = order,
                    onValueChange = { order = it.filter { c -> c.isDigit() } },
                    placeholder = "顺序（1 = 最先做）",
                )
                Spacer(Modifier.height(6.dp))
                Text("手改过的，zoowy 重排时默认不动", style = PixelType.Small, color = PixelColors.Ink3)
                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth()) {
                    PixelButton(text = "取消", onClick = onDismiss, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(12.dp))
                    PixelButton(
                        text = if (saving) "保存中…" else "保存",
                        onClick = {
                            if (saving) return@PixelButton
                            val token = Session.token(context) ?: return@PixelButton
                            saving = true
                            scope.launch {
                                try {
                                    Api.patchChainGoal(
                                        token,
                                        bigGoalId,
                                        goal.id,
                                        ChainEditPayload(
                                            planned_date = date.takeIf { it != goal.planned_date },
                                            title = title.takeIf { it != goal.title },
                                            accept_criteria = criteria.takeIf { it != (goal.accept_criteria ?: "") },
                                            plan_order = order.toIntOrNull()?.takeIf { it != goal.plan_order },
                                        ),
                                    )
                                    onSaved()
                                } catch (e: Exception) {
                                    saving = false
                                }
                            }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

/** 整体顺延 / 提前：只动未启动的 */
@Composable
private fun ShiftDialog(
    context: android.content.Context,
    bigGoalId: Long,
    onDismiss: () -> Unit,
    onSaved: (Int) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var days by remember { mutableStateOf("7") }
    // 对齐 Web shiftSheet：起算日期可改，别写死 today
    var fromDate by remember { mutableStateOf(todayShanghai()) }
    var saving by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("整体顺延 / 提前", style = PixelType.Title, color = PixelColors.Ink)
                Spacer(Modifier.height(8.dp))
                Text("从哪天起", style = PixelType.Small, color = PixelColors.Ink3)
                Spacer(Modifier.height(4.dp))
                PixelTextField(value = fromDate, onValueChange = { fromDate = it }, placeholder = "YYYY-MM-DD", modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                Text("挪几天（负数 = 提前），把未启动的小目标整体挪动：", style = PixelType.Small, color = PixelColors.Ink2)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PixelSmallButton(text = "−1", onClick = { days = ((days.toIntOrNull() ?: 0) - 1).toString() })
                    Spacer(Modifier.width(10.dp))
                    PixelTextField(value = days, onValueChange = { days = it }, placeholder = "天数", modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(10.dp))
                    PixelSmallButton(text = "+1", onClick = { days = ((days.toIntOrNull() ?: 0) + 1).toString() })
                }
                Spacer(Modifier.height(6.dp))
                Text("只挪「未启动」的；已进行中 / 待验收 / 已达成的不动", style = PixelType.Small, color = PixelColors.Ink3)
                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth()) {
                    PixelButton(text = "取消", onClick = onDismiss, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(12.dp))
                    PixelButton(
                        text = if (saving) "挪…" else "挪",
                        onClick = {
                            val d = days.toIntOrNull()
                            if (d == null || d == 0 || saving) return@PixelButton
                            val token = Session.token(context) ?: return@PixelButton
                            saving = true
                            scope.launch {
                                try {
                                    val moved = Api.shiftPlan(token, bigGoalId, fromDate, d)
                                    onSaved(moved)
                                } catch (e: Exception) {
                                    saving = false
                                }
                            }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

/** 大目标新建 / 编辑 */
@Composable
fun BigGoalEditorDialog(
    existing: BigGoalDto?,
    context: android.content.Context,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val editing = existing != null
    var title by remember { mutableStateOf(existing?.title ?: "") }
    var emoji by remember { mutableStateOf(existing?.emoji ?: "🏔️") }
    var desc by remember { mutableStateOf(existing?.description ?: "") }
    var saving by remember { mutableStateOf(false) }
    val emojis = listOf("🏔️", "🚀", "🎓", "💼", "🏃", "📖", "💻", "🏆", "🌱", "✈️")

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(if (editing) "编辑大目标" else "新建大目标", style = PixelType.Title, color = PixelColors.Ink)
                Spacer(Modifier.height(10.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                ) {
                    for (e in emojis) {
                        Box(
                            modifier = Modifier
                                .background(if (e == emoji) PixelColors.GreenSoft else PixelColors.Card)
                                .pixelBorder(2.dp, if (e == emoji) PixelColors.Green else PixelColors.Outline)
                                .clickable { emoji = e }
                                .padding(6.dp),
                        ) { Text(e, style = PixelType.Body) }
                    }
                }
                Spacer(Modifier.height(8.dp))
                // 对齐 Web BigGoalForm：名称 maxlength 40
                PixelTextField(value = title, onValueChange = { title = it.take(40) }, placeholder = "比如：找到 Agent 开发工程师的工作", modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                // 对齐 Web BigGoalForm：label + 描述 maxlength 500
                Text("描述（这段会作为背景给 zoowy 参考）", style = PixelType.Small, color = PixelColors.Ink3)
                Spacer(Modifier.height(4.dp))
                PixelTextField(value = desc, onValueChange = { desc = it.take(500) }, placeholder = "想到哪写到哪：为什么想做、现在什么水平、大概多久想成", modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth()) {
                    PixelButton(text = "取消", onClick = onDismiss, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(12.dp))
                    PixelButton(
                        text = if (saving) "保存中…" else if (editing) "保存" else "创建",
                        onClick = {
                            if (title.isBlank() || saving) return@PixelButton
                            val token = Session.token(context) ?: return@PixelButton
                            saving = true
                            scope.launch {
                                try {
                                    val body = BigGoalPayload(title = title.trim(), emoji = emoji, description = desc.trim())
                                    if (editing) Api.updateBigGoal(token, existing!!.id, body) else Api.createBigGoal(token, body)
                                    onSaved()
                                } catch (e: Exception) {
                                    saving = false
                                }
                            }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

/** 往路线末尾加个小目标：先 createGoal(stage) 再 bindChainGoal（对齐 Web addChainGoal） */
@Composable
private fun AddChainGoalDialog(
    bigGoalId: Long,
    chainLen: Int,
    context: android.content.Context,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var date by remember {
        mutableStateOf(
            java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).plusDays(1).toString()
        )
    }
    var criteria by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("加个小目标", style = PixelType.Title, color = PixelColors.Ink)
                Spacer(Modifier.height(10.dp))
                Text("小目标名称", style = PixelType.Small, color = PixelColors.Ink3)
                Spacer(Modifier.height(4.dp))
                PixelTextField(value = title, onValueChange = { title = it.take(30) }, placeholder = "比如：写完简历初稿", modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Text("计划日期", style = PixelType.Small, color = PixelColors.Ink3)
                Spacer(Modifier.height(4.dp))
                PixelTextField(value = date, onValueChange = { date = it }, placeholder = "YYYY-MM-DD", modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Text("验收标准（必填）", style = PixelType.Small, color = PixelColors.Ink3)
                Spacer(Modifier.height(4.dp))
                PixelTextField(value = criteria, onValueChange = { criteria = it.take(500) }, placeholder = "写成能被「是/否」回答的标准", modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                Text("建成即挂到路线末尾，未启动前不进统计、对方看不见", style = PixelType.Small, color = PixelColors.Ink3)
                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, style = PixelType.Small, color = PixelColors.RedDeep)
                }
                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth()) {
                    PixelButton(text = "取消", onClick = onDismiss, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(12.dp))
                    PixelButton(
                        text = if (saving) "创建中…" else "创建",
                        onClick = {
                            if (saving) return@PixelButton
                            if (title.isBlank()) {
                                error = "起个名字"
                                return@PixelButton
                            }
                            if (criteria.isBlank()) {
                                error = "验收标准必填"
                                return@PixelButton
                            }
                            val token = Session.token(context) ?: return@PixelButton
                            saving = true
                            error = null
                            scope.launch {
                                try {
                                    val created = Api.createGoal(
                                        token,
                                        GoalPayload(
                                            type = "stage",
                                            title = title.trim(),
                                            accept_criteria = criteria.trim(),
                                            start_date = date.ifBlank { null },
                                        ),
                                    )
                                    Api.bindChainGoal(
                                        token,
                                        bigGoalId,
                                        ChainBindPayload(
                                            goal_id = created.id,
                                            planned_date = date.ifBlank { null },
                                            plan_order = chainLen + 1,
                                        ),
                                    )
                                    onSaved()
                                } catch (e: Exception) {
                                    error = e.message ?: "创建失败"
                                    saving = false
                                }
                            }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
