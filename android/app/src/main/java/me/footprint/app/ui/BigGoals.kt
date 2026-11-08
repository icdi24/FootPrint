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
import me.footprint.app.net.ChainEditPayload
import me.footprint.app.net.ChainGoalDto
import me.footprint.app.net.Session
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType

/** 大目标列表：概览卡（进度条 + 客观计数 + AI 进度说明），点卡开详情 */
@Composable
fun BigGoalsView(
    goals: List<BigGoalDto>?,
    loading: Boolean,
    onNew: () -> Unit,
    onOpen: (Long) -> Unit,
    onLifecycle: (BigGoalDto) -> Unit,
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
    val visible = list.filter { it.status != "abandoned" }
    val abandoned = list.filter { it.status == "abandoned" }
    for ((isAbandoned, group) in listOf(false to visible, true to abandoned)) {
        if (group.isEmpty()) continue
        if (isAbandoned) {
            Text("已放弃的大目标", style = PixelType.Title, color = PixelColors.Ink)
            Spacer(Modifier.height(8.dp))
        }
        for (b in group) {
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
                        if (isAbandoned) {
                            PixelChip(text = "已放弃", bg = PixelColors.Bg2, fg = PixelColors.Ink3)
                        } else {
                            PixelChip(text = "${b.progress}%", bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    PixelBar(fraction = b.progress / 100f)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "客观 ${b.done}/${b.total} 个小目标达成" + (b.progress_note.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
                        style = PixelType.Small,
                        color = PixelColors.Ink2,
                    )
                    if (b.status == "active" || isAbandoned) {
                        Spacer(Modifier.height(8.dp))
                        PixelSmallButton(text = if (isAbandoned) "删除" else "放弃", onClick = { onLifecycle(b) }, filled = false)
                    }
                }
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
    onLifecycle: (BigGoalDto) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<BigGoalDetailResponse?>(null) }
    var toast by remember { mutableStateOf<String?>(null) }
    var editTarget by remember { mutableStateOf<ChainGoalDto?>(null) }
    var showShift by remember { mutableStateOf(false) }

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
                                Text("客观 ${d.done}/${d.total} 个小目标达成", style = PixelType.Small, color = PixelColors.Ink2)
                            }
                            if (bg.status == "abandoned") {
                                PixelChip(text = "已放弃", bg = PixelColors.Bg2, fg = PixelColors.Ink3)
                            } else {
                                PixelChip(text = "${bg.progress}%", bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        PixelBar(fraction = bg.progress / 100f)
                        if (bg.progress_note.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text("zoowy：${bg.progress_note}", style = PixelType.Small, color = PixelColors.Ink2)
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
                                            append(g.planned_date?.let { "计划 $it" } ?: "未排日期")
                                            append(" · ")
                                            append(
                                                when {
                                                    g.status == "abandoned" -> "已放弃"
                                                    g.plan_status == "planned" -> "未启动"
                                                    g.plan_status == "released" -> "进行中"
                                                    g.plan_status == "done" -> "已达成"
                                                    else -> "未绑定"
                                                },
                                            )
                                            if (g.status == "achieved") append(" ✓")
                                        },
                                        style = PixelType.Small,
                                        color = PixelColors.Ink2,
                                    )
                                    g.accept_criteria?.takeIf { it.isNotBlank() }?.let {
                                        Text(it, style = PixelType.Small, color = PixelColors.Ink3, maxLines = 2)
                                    }
                                }
                                if (bg.status != "abandoned" && g.status != "achieved" && g.status != "abandoned") {
                                    PixelSmallButton(text = "改", onClick = { editTarget = g })
                                }
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        if (bg.status == "active" || bg.status == "abandoned") {
                            PixelSmallButton(text = if (bg.status == "abandoned") "删除" else "放弃", onClick = { onLifecycle(bg) }, filled = false)
                            Spacer(Modifier.height(8.dp))
                        }
                        Row(modifier = Modifier.fillMaxWidth()) {
                            if (bg.status != "abandoned") {
                                PixelSmallButton(text = "编辑", onClick = { onEdit(bg) }, filled = false)
                                Spacer(Modifier.width(8.dp))
                                PixelSmallButton(text = "顺延 / 提前", onClick = { showShift = true }, filled = false)
                                Spacer(Modifier.width(8.dp))
                            }
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
            onSaved = {
                showShift = false
                reload()
                onChanged()
            },
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
    onSaved: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var days by remember { mutableStateOf("7") }
    var saving by remember { mutableStateOf(false) }
    val today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString()

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("整体顺延 / 提前", style = PixelType.Title, color = PixelColors.Ink)
                Spacer(Modifier.height(8.dp))
                Text("从今天（$today）起，把未启动的小目标整体挪动：", style = PixelType.Small, color = PixelColors.Ink2)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PixelSmallButton(text = "−1", onClick = { days = ((days.toIntOrNull() ?: 0) - 1).toString() })
                    Spacer(Modifier.width(10.dp))
                    PixelTextField(value = days, onValueChange = { days = it }, placeholder = "天数", modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(10.dp))
                    PixelSmallButton(text = "+1", onClick = { days = ((days.toIntOrNull() ?: 0) + 1).toString() })
                }
                Spacer(Modifier.height(6.dp))
                Text("负数 = 提前。已进行中 / 待验收 / 已达成的不动", style = PixelType.Small, color = PixelColors.Ink3)
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
                                    Api.shiftPlan(token, bigGoalId, today, d)
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
                PixelTextField(value = title, onValueChange = { title = it }, placeholder = "比如：找到 Agent 开发工程师的工作")
                Spacer(Modifier.height(8.dp))
                PixelTextField(value = desc, onValueChange = { desc = it }, placeholder = "描述（会喂给 zoowy 帮你拆计划）")
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
