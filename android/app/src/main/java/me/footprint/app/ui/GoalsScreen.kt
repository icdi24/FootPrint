package me.footprint.app.ui

import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.footprint.app.net.Api
import me.footprint.app.net.ApiException
import me.footprint.app.net.BigGoalDetailResponse
import me.footprint.app.net.BigGoalDto
import me.footprint.app.net.BigGoalPayload
import me.footprint.app.net.ChainEditPayload
import me.footprint.app.net.CheckinResult
import me.footprint.app.net.GoalDetail
import me.footprint.app.net.GoalPayload
import me.footprint.app.net.MonthCell
import me.footprint.app.net.MonthGoal
import me.footprint.app.net.MonthView
import me.footprint.app.net.Session
import me.footprint.app.net.WeekCell
import me.footprint.app.net.WeekGoal
import me.footprint.app.net.WeekView
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * 目标页：周/月视图网格 + 新建/编辑目标 + 打卡 + 放弃。
 *
 * 状态自己用 remember 管，直接调 Api（token 从 Session 拿）。
 * 周视图 start 取「本周周一」，月视图 month 取 yyyy-MM，都用上海时区。
 * 小目标（stage）只展示，验收提交留给「我们」页对方那里处理。
 */

/** 周视图网格一格的边长，格子要能点得动又不能太挤 */
private val CELL = 32.dp

/** 上海时区，算周/月边界统一用它 */
private val ZONE = ZoneId.of("Asia/Shanghai")

/** 周一到周日的单字标题 */
private val WD_LABELS = listOf("一", "二", "三", "四", "五", "六", "日")

/** 常用 emoji，新建目标时点选 */
private val EMOJI_OPTIONS = listOf("🎯", "📖", "🏃", "💪", "🧘", "💧", "🌙", "🎨", "🎹", "✍️")

/** 频率选项：mode / 文案 */
private val FREQ_OPTIONS = listOf(
  Triple("daily", "每天", null),
  Triple("weekly", "每周N次", 3),
  Triple("weekdays", "指定星期", 3),
)

/** 难度 1-5 的文案 */
private val DIFFICULTY_LABELS = listOf("1 轻松", "2 简单", "3 中等", "4 较难", "5 挑战")

@Composable
fun GoalsScreen(vm: AppViewModel) {
  val loggedIn by vm.loggedIn.collectAsStateWithLifecycle()
  if (!loggedIn) {
    GuestEmpty(vm = vm, emoji = "🎯", title = "登录后一起定目标", sub = "两个人的打卡目标，从登录开始")
    return
  }
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  // ---------------- 页面状态 ----------------

  // 0 = 日常目标，1 = 小目标，2 = 大目标（对齐 Web 版三段切换）
  var mode by remember { mutableStateOf(0) }
  // 日常目标内：0 = 周视图，1 = 月视图
  var tab by remember { mutableStateOf(0) }
  // 周视图锚点（默认本周周一，可前后翻页）；月视图锚点（默认本月）
  var weekAnchor by remember { mutableStateOf(LocalDate.now(ZONE).with(DayOfWeek.MONDAY)) }
  var monthAnchor by remember { mutableStateOf(YearMonth.now(ZONE)) }
  var week by remember { mutableStateOf<WeekView?>(null) }
  var month by remember { mutableStateOf<MonthView?>(null) }
  // 日历：目标定义（推算未来日期用）+ 展开态 + 锚定月 + 点日期弹当天目标
  var goalDefs by remember { mutableStateOf<List<GoalDetail>>(emptyList()) }
  var calOpen by remember { mutableStateOf(true) }
  var calMonth by remember { mutableStateOf(YearMonth.now(ZONE).toString()) }
  var daySheetDate by remember { mutableStateOf<String?>(null) }
  // 小目标列表
  var stageGoals by remember { mutableStateOf<List<GoalDetail>?>(null) }
  // 大目标列表（P1-#8）
  var bigGoals by remember { mutableStateOf<List<BigGoalDto>?>(null) }
  // 打开的大目标详情
  var bigDetailId by remember { mutableStateOf<Long?>(null) }
  // 大目标编辑弹层（null = 关；"new" = 新建；其余 = 编辑该大目标）
  var bigEditorTarget by remember { mutableStateOf<BigGoalDto?>(null) }
  var showBigEditor by remember { mutableStateOf(false) }
  var loading by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  // 编辑弹层
  var editing by remember { mutableStateOf<GoalDetail?>(null) }
  var showEditor by remember { mutableStateOf(false) }

  // 打卡确认弹层
  var checkinGoal by remember { mutableStateOf<WeekGoal?>(null) }
  var checkinDate by remember { mutableStateOf<String?>(null) }

  // 放弃确认弹层（id + 标题即可）
  var abandonTarget by remember { mutableStateOf<Pair<Long, String>?>(null) }

  // 一次性提示
  var toast by remember { mutableStateOf<String?>(null) }

  // ---------------- 加载数据 ----------------

  fun reload() {
    val token = Session.token(context) ?: return
    scope.launch {
      loading = true
      error = null
      try {
        if (mode == 1) {
          // 小目标：走 /api/goals?type=stage
          stageGoals = Api.listGoals(token, "stage")
        } else if (mode == 2) {
          // 大目标：整条路线在详情里看，列表只要概览
          bigGoals = Api.listBigGoals(token)
        } else if (tab == 0) {
          week = Api.getWeek(token, weekAnchor.format(DateTimeFormatter.ISO_LOCAL_DATE))
        } else {
          month = Api.getMonth(token, monthAnchor.format(DateTimeFormatter.ofPattern("yyyy-MM")))
        }
        // 日历用的目标定义（日常目标，推算未来日期）
        if (mode == 0) {
          try {
            goalDefs = Api.listGoals(token, "daily")
          } catch (e: Exception) {
            goalDefs = emptyList()
          }
        }
      } catch (e: ApiException) {
        error = e.message ?: "加载失败"
      } catch (e: Exception) {
        error = e.message ?: "加载失败"
      } finally {
        loading = false
      }
    }
  }

  LaunchedEffect(mode, tab, weekAnchor, monthAnchor) {
    reload()
  }

  // ---------------- 动作 ----------------

  fun doCheckin(goalId: Long, date: String, durationMin: Int?, evidenceText: String?) {
    val token = Session.token(context) ?: return
    scope.launch {
      try {
        val r: CheckinResult = Api.checkin(token, goalId, durationMin, evidenceText)
        val bonus = if (r.bonuses.isNotEmpty()) "（${r.bonuses.joinToString("、")}）" else ""
        toast = "打卡成功 +${r.points} 分$bonus"
        checkinGoal = null
        checkinDate = null
        reload()
      } catch (e: ApiException) {
        toast = e.message ?: "打卡失败"
      } catch (e: Exception) {
        toast = e.message ?: "打卡失败"
      }
    }
  }

  fun doAbandon(goalId: Long) {
    val token = Session.token(context) ?: return
    scope.launch {
      try {
        Api.abandonGoal(token, goalId)
        toast = "已放弃该目标"
        abandonTarget = null
        reload()
      } catch (e: ApiException) {
        toast = e.message ?: "操作失败"
      } catch (e: Exception) {
        toast = e.message ?: "操作失败"
      }
    }
  }

  // 小目标：草稿 → 进行中
  fun doStartStage(goalId: Long) {
    val token = Session.token(context) ?: return
    scope.launch {
      try {
        Api.startGoal(token, goalId)
        toast = "已开始，加油 🌱"
        reload()
      } catch (e: ApiException) {
        toast = e.message ?: "操作失败"
      } catch (e: Exception) {
        toast = e.message ?: "操作失败"
      }
    }
  }

  // 小目标：提交验收
  fun doSubmitStage(goalId: Long) {
    val token = Session.token(context) ?: return
    scope.launch {
      try {
        Api.submitGoal(token, goalId, "我完成了，请验收")
        toast = "已提交验收，等对方处理"
        reload()
      } catch (e: ApiException) {
        toast = e.message ?: "提交失败"
      } catch (e: Exception) {
        toast = e.message ?: "提交失败"
      }
    }
  }

  // ---------------- 页面 ----------------

  Screen {
    Box(modifier = Modifier.fillMaxSize()) {
      Column(modifier = Modifier.fillMaxSize()) {
        // 标题
        Text("目标", style = PixelType.Big, color = PixelColors.Ink)

      Spacer(Modifier.height(12.dp))

      // 日常目标 / 小目标 切换（对齐 Web 版：居中窄条）
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
      ) {
        PixelSmallButton(
          text = "日常目标",
          onClick = { mode = 0 },
          filled = mode == 0,
        )
        Spacer(Modifier.width(8.dp))
        PixelSmallButton(
          text = "小目标",
          onClick = { mode = 1 },
          filled = mode == 1,
        )
        Spacer(Modifier.width(8.dp))
        PixelSmallButton(
          text = "大目标",
          onClick = { mode = 2 },
          filled = mode == 2,
        )
      }

      // 日常目标内再有「周 / 月」切换
      if (mode == 0) {
        Spacer(Modifier.height(8.dp))
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.Center,
        ) {
          PixelSmallButton(
            text = "周",
            onClick = { tab = 0 },
            filled = tab == 0,
          )
          Spacer(Modifier.width(8.dp))
          PixelSmallButton(
            text = "月",
            onClick = { tab = 1 },
            filled = tab == 1,
          )
        }

        // 翻页导航：‹ 上一段 / 下一段 ›
        Spacer(Modifier.height(8.dp))
        Row(
          modifier = Modifier.fillMaxWidth(),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween,
        ) {
          PixelSmallButton(
            text = "‹",
            filled = false,
            onClick = {
              if (tab == 0) weekAnchor = weekAnchor.minusWeeks(1)
              else monthAnchor = monthAnchor.minusMonths(1)
            },
          )
          Text(
            text = if (tab == 0) {
              val wk = weekAnchor.get(java.time.temporal.IsoFields.WEEK_OF_WEEK_BASED_YEAR)
              "${weekAnchor.monthValue}月 第$wk 周"
            } else {
              "${monthAnchor.year}年${monthAnchor.monthValue}月"
            },
            style = PixelType.Mono,
            color = PixelColors.Ink,
          )
          PixelSmallButton(
            text = "›",
            filled = false,
            onClick = {
              if (tab == 0) weekAnchor = weekAnchor.plusWeeks(1)
              else monthAnchor = monthAnchor.plusMonths(1)
            },
          )
        }
      }

      Spacer(Modifier.height(12.dp))

      // 提示 / 错误
      if (toast != null) {
        PixelChip(text = toast.orEmpty(), bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
        Spacer(Modifier.height(8.dp))
      }
      if (error != null) {
        PixelChip(text = error.orEmpty(), bg = PixelColors.OrangeSoft, fg = PixelColors.OrangeDeep)
        Spacer(Modifier.height(8.dp))
      }

      // 主体
      Column(
        modifier = Modifier
          .fillMaxSize()
          .verticalScroll(rememberScrollState()),
      ) {
        if (mode == 1) {
          StageListView(
            goals = stageGoals,
            loading = loading,
            onNew = {
              editing = null
              showEditor = true
            },
            onEdit = { g ->
              editing = g
              showEditor = true
            },
            onStart = { g -> doStartStage(g.id) },
            onSubmit = { g -> doSubmitStage(g.id) },
            onAbandon = { g ->
              abandonTarget = g.id to g.title
            },
          )
        } else if (mode == 2) {
          BigGoalsView(
            goals = bigGoals,
            loading = loading,
            onNew = {
              bigEditorTarget = null
              showBigEditor = true
            },
            onOpen = { bigDetailId = it },
          )
        } else if (tab == 0) {
          // 日历（对齐 Web calendarHtml）：可折叠 + 点日期看当天目标
          CalendarCard(
            monthData = month,
            goalDefs = goalDefs,
            today = LocalDate.now(ZONE).toString(),
            calMonth = calMonth,
            open = calOpen,
            onToggle = { calOpen = !calOpen },
            onPrev = { calMonth = shiftMonth(calMonth, -1) },
            onNext = { calMonth = shiftMonth(calMonth, 1) },
            onToday = { calMonth = YearMonth.now(ZONE).toString() },
            onDayClick = { daySheetDate = it },
          )
          Spacer(Modifier.height(12.dp))
          WeekView(
            week = week,
            loading = loading,
            onCellClick = { goal, cell ->
              // 仅 today / todo 可打卡；today 由 date == week.today 判断（状态仍是 todo）
              if (cell.state == "todo") {
                checkinGoal = goal
                checkinDate = cell.date
              }
            },
          )
        } else {
          // 日历（月视图也显示）
          CalendarCard(
            monthData = month,
            goalDefs = goalDefs,
            today = LocalDate.now(ZONE).toString(),
            calMonth = calMonth,
            open = calOpen,
            onToggle = { calOpen = !calOpen },
            onPrev = { calMonth = shiftMonth(calMonth, -1) },
            onNext = { calMonth = shiftMonth(calMonth, 1) },
            onToday = { calMonth = YearMonth.now(ZONE).toString() },
            onDayClick = { daySheetDate = it },
          )
          Spacer(Modifier.height(12.dp))
          MonthView(month = month, loading = loading)
        }
        Spacer(Modifier.height(24.dp))
      }
      }

      // 右下角 FAB：新建目标（对齐 Web 的浮动 + 号）
      Box(
        modifier = Modifier
          .align(Alignment.BottomEnd)
          .padding(20.dp),
      ) {
        Box(
          modifier = Modifier
            .size(64.dp)
            .pixelHardShadow(4.dp, PixelColors.Outline)
            .background(PixelColors.Green)
            .pixelBorder(2.dp, PixelColors.Outline)
            .clickable { editing = null; showEditor = true },
          contentAlignment = Alignment.Center,
        ) {
          Text("+", style = PixelType.Huge, color = PixelColors.White)
        }
      }
    }
  }

  // ---------------- 弹层 ----------------

  if (showEditor) {
    GoalEditorDialog(
      existing = editing,
      onDismiss = { showEditor = false },
      onSaved = {
        showEditor = false
        reload()
      },
      onAbandon = { goal ->
        showEditor = false
        abandonTarget = goal.id to goal.title
      },
      defaultType = if (mode == 1) "stage" else "daily",
    )
  }

  // 大目标：详情弹层（P1-#8）
  bigDetailId?.let { id ->
    BigGoalDetailDialog(
      bigGoalId = id,
      context = context,
      onDismiss = { bigDetailId = null },
      onChanged = { reload() },
      onEdit = { bg ->
        bigEditorTarget = bg
        showBigEditor = true
      },
    )
  }

  // 大目标：新建 / 编辑弹层
  if (showBigEditor) {
    BigGoalEditorDialog(
      existing = bigEditorTarget,
      context = context,
      onDismiss = { showBigEditor = false },
      onSaved = {
        showBigEditor = false
        reload()
      },
    )
  }

  if (checkinGoal != null) {
    CheckinDialog(
      goal = checkinGoal!!,
      date = checkinDate,
      onDismiss = {
        checkinGoal = null
        checkinDate = null
      },
      onConfirm = { durationMin, evidence ->
        doCheckin(checkinGoal!!.id, checkinDate.orEmpty(), durationMin, evidence)
      },
    )
  }

  // 日历：点日期弹当天目标
  daySheetDate?.let { date ->
    DaySheetDialog(
      date = date,
      monthData = month,
      goalDefs = goalDefs,
      today = LocalDate.now(ZONE).toString(),
      onDismiss = { daySheetDate = null },
      onViewWeek = {
        daySheetDate = null
        tab = 0
        weekAnchor = LocalDate.parse(date).with(DayOfWeek.MONDAY)
      },
    )
  }

  if (abandonTarget != null) {
    ConfirmDialog(
      title = "放弃目标",
      message = "确定要放弃「${abandonTarget!!.second}」吗？放弃后无法恢复打卡记录。",
      confirmText = "放弃",
      danger = true,
      onDismiss = { abandonTarget = null },
      onConfirm = { doAbandon(abandonTarget!!.first) },
    )
  }
}

// ==================== 周视图 ====================

@Composable
private fun WeekView(
  week: WeekView?,
  loading: Boolean,
  onCellClick: (WeekGoal, WeekCell) -> Unit,
) {
  if (loading && week == null) {
    Text("加载中…", style = PixelType.Body, color = PixelColors.Ink3)
    return
  }
  val w = week ?: run {
    Text("暂无周数据", style = PixelType.Body, color = PixelColors.Ink3)
    return
  }

  // 顶部统计三联卡（对齐 Web：周得分 / 打卡人次 / 进行中目标）
  PixelPanel(
    modifier = Modifier.fillMaxWidth(),
    background = PixelColors.Bg2,
  ) {
    Column(modifier = Modifier.padding(12.dp)) {
      Text(
        text = "${w.weekStart} ~ ${w.weekEnd}",
        style = PixelType.Small,
        color = PixelColors.Ink3,
      )
      Spacer(Modifier.height(6.dp))
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
        Metric(text = "周得分", value = w.weekPoints.toString(), color = PixelColors.Gold)
        Metric(text = "打卡人次", value = "${w.weekDone}/${w.weekExpected}", color = PixelColors.Green)
        Metric(text = "进行中目标", value = w.goals.count { it.status == "active" }.toString(), color = PixelColors.Green)
      }
    }
  }

  Spacer(Modifier.height(12.dp))

  if (w.goals.isEmpty()) {
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
      Text(
        text = "还没有目标，点右下角「+」创建一个吧",
        style = PixelType.Small,
        color = PixelColors.Ink3,
        modifier = Modifier.padding(12.dp),
      )
    }
    return
  }

  // 表格式周网格（对齐 Web）：一行一个目标 = 名称 | 分数 | 一~日
  PixelPanel(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(10.dp)) {
      // 表头
      Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("名称", style = PixelType.Small, color = PixelColors.Ink3, modifier = Modifier.weight(1f))
        Text("分数", style = PixelType.Small, color = PixelColors.Ink3, modifier = Modifier.width(40.dp))
        WD_LABELS.forEach { label ->
          Text(
            label,
            style = PixelType.Small,
            color = PixelColors.Ink3,
            modifier = Modifier.width(CELL),
            textAlign = TextAlign.Center,
          )
        }
      }
      Spacer(Modifier.height(6.dp))
      // 数据行
      w.goals.forEach { goal ->
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .dashedDivider()
            .padding(vertical = 6.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            Text(goal.emoji, style = PixelType.Body)
            Spacer(Modifier.width(4.dp))
            Text(
              goal.title,
              style = PixelType.Body,
              color = PixelColors.Ink,
              maxLines = 1,
              softWrap = false,
              modifier = Modifier.weight(1f, fill = false),
            )
          }
          Text(
            goal.perCheckinPoints.toString(),
            style = PixelType.Mono,
            color = PixelColors.Ink2,
            modifier = Modifier.width(40.dp),
          )
          WD_LABELS.forEachIndexed { i, _ ->
            val cell = goal.cells.getOrNull(i)
            if (cell == null) {
              Box(
                modifier = Modifier
                  .size(CELL - 4.dp)
                  .background(PixelColors.Line)
                  .pixelBorder(1.dp, PixelColors.LineStrong),
              )
            } else {
              CellBox(cell = cell, today = w.today, clickable = goal.type != "stage", onClick = { onCellClick(goal, cell) })
            }
          }
        }
      }
      Spacer(Modifier.height(8.dp))
      // 图例（对齐 Web：✓已打 / □漏了 / □今天 三个图形图例，居中）
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        // 已打
        Box(
          modifier = Modifier
            .size(16.dp)
            .background(PixelColors.Green)
            .pixelBorder(1.dp, PixelColors.GreenDeep),
          contentAlignment = Alignment.Center,
        ) {
          Text("✓", style = PixelType.Small, color = PixelColors.White)
        }
        Spacer(Modifier.width(4.dp))
        Text("已打", style = PixelType.Small, color = PixelColors.Ink2)
        Spacer(Modifier.width(10.dp))
        // 漏了
        Box(
          modifier = Modifier
            .size(16.dp)
            .background(PixelColors.Card)
            .pixelBorder(1.dp, PixelColors.LineStrong),
        )
        Spacer(Modifier.width(4.dp))
        Text("漏了", style = PixelType.Small, color = PixelColors.Ink2)
        Spacer(Modifier.width(10.dp))
        // 今天
        Box(
          modifier = Modifier
            .size(16.dp)
            .background(PixelColors.Card)
            .pixelBorder(2.dp, PixelColors.Orange),
        )
        Spacer(Modifier.width(4.dp))
        Text("今天", style = PixelType.Small, color = PixelColors.Ink2)
      }
    }
  }
}

@Composable
private fun Metric(text: String, value: String, color: Color) {
  Column {
    Text(text = text, style = PixelType.Small, color = PixelColors.Ink3)
    Text(text = value, style = PixelType.Mono, color = color)
  }
}

@Composable
private fun CellBox(
  cell: WeekCell,
  today: String,
  clickable: Boolean,
  onClick: () -> Unit,
) {
  // 状态 → 颜色（对齐 Web：已打=绿底白勾，漏了=白底空框，今天=白底橙框，未来=白底浅框）
  val bg: Color
  val border: Color
  when (cell.state) {
    "done" -> {
      bg = PixelColors.Green
      border = PixelColors.GreenDeep
    }
    "missed" -> {
      bg = PixelColors.Card
      border = PixelColors.LineStrong
    }
    "todo" -> {
      bg = PixelColors.Card
      border = PixelColors.Orange
    }
    else -> {
      bg = PixelColors.Card
      border = PixelColors.LineStrong
    }
  }

  val isToday = cell.date == today
  val canClick = clickable && cell.state == "todo"

  Box(
    modifier = Modifier
      .size(CELL)
      .background(bg)
      .pixelBorder(2.dp, border)
      .then(if (canClick) Modifier.clickable(onClick = onClick) else Modifier),
    contentAlignment = Alignment.Center,
  ) {
    // 已打 = 绿底白勾；漏了/未来/今天未打 = 空框（对齐 Web，不显示分数和 ✗）
    if (cell.state == "done") {
      Text("✓", style = PixelType.Body, color = PixelColors.White)
    }
  }
}

// ==================== 月视图 ====================

@Composable
private fun MonthView(month: MonthView?, loading: Boolean) {
  if (loading && month == null) {
    Text("加载中…", style = PixelType.Body, color = PixelColors.Ink3)
    return
  }
  val m = month ?: run {
    Text("暂无月数据", style = PixelType.Body, color = PixelColors.Ink3)
    return
  }

  // 顶部统计三联卡（对齐 Web：月得分 / 打卡人次 / 进行中目标）
  PixelPanel(
    modifier = Modifier.fillMaxWidth(),
    background = PixelColors.Bg2,
  ) {
    Column(modifier = Modifier.padding(12.dp)) {
      Text(
        text = "${m.month}",
        style = PixelType.Small,
        color = PixelColors.Ink3,
      )
      Spacer(Modifier.height(6.dp))
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
        Metric(text = "月得分", value = m.monthPoints.toString(), color = PixelColors.Gold)
        Metric(text = "打卡人次", value = "${m.monthDone}/${m.monthExpected}", color = PixelColors.Green)
        Metric(text = "进行中目标", value = m.goals.count { it.id > 0 }.toString(), color = PixelColors.Green)
      }
    }
  }

  Spacer(Modifier.height(12.dp))

  if (m.goals.isEmpty()) {
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
      Text(
        text = "还没有目标，点右下角「+」创建一个吧",
        style = PixelType.Small,
        color = PixelColors.Ink3,
        modifier = Modifier.padding(12.dp),
      )
    }
    return
  }

  // 表格式月视图（对齐 Web）：一行一个目标 = 标题 | N 次 · N 分 + 下方每天小方块
  PixelPanel(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(10.dp)) {
      m.goals.forEach { goal ->
        // 行1：emoji + 标题 …… 右侧 N 次 · N 分
        Row(
          modifier = Modifier.fillMaxWidth(),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(goal.emoji, style = PixelType.Body)
          Spacer(Modifier.width(6.dp))
          Text(goal.title, style = PixelType.Body, color = PixelColors.Ink, modifier = Modifier.weight(1f))
          val doneCount = goal.cells.count { it.state == "done" }
          val totalPoints = goal.cells.sumOf { it.points }
          Text(
            text = "${doneCount} 次 · ${totalPoints} 分",
            style = PixelType.Small,
            color = PixelColors.Ink2,
          )
        }
        Spacer(Modifier.height(4.dp))
        // 行2：每天小方块（绿=已打，橙框=今天，白=未打/未来）
        Row(modifier = Modifier.horizontalScroll(rememberScrollState())) {
          goal.cells.forEach { day ->
            val isToday = day.date == m.today
            val done = day.state == "done"
            val bg = if (done) PixelColors.Green else PixelColors.Card
            val border = when {
              isToday -> PixelColors.Orange
              done -> PixelColors.GreenDeep
              else -> PixelColors.LineStrong
            }
            Box(
              modifier = Modifier
                .size(14.dp)
                .background(bg)
                .pixelBorder(if (isToday) 2.dp else 1.dp, border),
            )
            Spacer(Modifier.width(3.dp))
          }
        }
        Spacer(Modifier.height(8.dp))
        if (goal !== m.goals.last()) {
          Box(
            modifier = Modifier
              .fillMaxWidth()
              .height(2.dp)
              .dashedDivider(),
          )
        }
      }
    }
  }
}

@Composable
private fun GoalEditorDialog(
  existing: GoalDetail?,
  onDismiss: () -> Unit,
  onSaved: () -> Unit,
  onAbandon: (GoalDetail) -> Unit,
  defaultType: String = "daily",
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  // 表单字段
  var title by remember { mutableStateOf(existing?.title.orEmpty()) }
  var emoji by remember { mutableStateOf(existing?.emoji ?: "🎯") }
  var type by remember { mutableStateOf(existing?.type ?: defaultType) }
  var difficulty by remember { mutableStateOf(existing?.difficulty ?: 3) }
  var durationMin by remember { mutableStateOf((existing?.duration_min ?: 30).toString()) }
  var freqMode by remember { mutableStateOf(existing?.freq_mode ?: "daily") }
  var freqN by remember { mutableStateOf((existing?.freq_n ?: 1).toString()) }
  var weekdays by remember { mutableStateOf(existing?.weekdays.orEmpty()) }
  var windowStart by remember { mutableStateOf(existing?.window_start.orEmpty()) }
  var windowEnd by remember { mutableStateOf(existing?.window_end.orEmpty()) }
  var acceptCriteria by remember { mutableStateOf(existing?.accept_criteria.orEmpty()) }
  var estTotalMin by remember { mutableStateOf(existing?.est_total_min?.toString().orEmpty()) }

  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  fun save() {
    if (title.isBlank()) {
      error = "标题不能为空"
      return
    }
    val token = Session.token(context) ?: return
    val payload = GoalPayload(
      title = title.trim(),
      type = type,
      emoji = emoji,
      description = null,
      freq_mode = freqMode,
      freq_n = freqN.toIntOrNull(),
      weekdays = weekdays.ifBlank { null },
      window_start = windowStart.ifBlank { null },
      window_end = windowEnd.ifBlank { null },
      duration_min = durationMin.toIntOrNull(),
      difficulty = difficulty,
      start_date = null,
      end_date = null,
      est_total_min = estTotalMin.toIntOrNull(),
      accept_criteria = if (type == "stage") acceptCriteria.ifBlank { null } else null,
      custom_points = null,
    )
    busy = true
    error = null
    scope.launch {
      try {
        if (existing == null) {
          Api.createGoal(token, payload)
        } else {
          Api.updateGoal(token, existing.id, payload)
        }
        onSaved()
      } catch (e: ApiException) {
        error = e.message ?: "保存失败"
      } catch (e: Exception) {
        error = e.message ?: "保存失败"
      } finally {
        busy = false
      }
    }
  }

  Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .verticalScroll(rememberScrollState())
        .padding(24.dp),
    ) {
      PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
          Text(
            text = if (existing == null) "新建目标" else "编辑目标",
            style = PixelType.Title,
            color = PixelColors.Ink,
          )
          Spacer(Modifier.height(12.dp))

          FieldLabel("标题")
          PixelTextField(value = title, onValueChange = { title = it }, placeholder = "例如：每天读 30 分钟", modifier = Modifier.fillMaxWidth())

          Spacer(Modifier.height(12.dp))

          FieldLabel("表情")
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .horizontalScroll(rememberScrollState()),
          ) {
            EMOJI_OPTIONS.forEach { e ->
              Box(
                modifier = Modifier
                  .size(36.dp)
                  .background(if (emoji == e) PixelColors.GreenSoft else PixelColors.Card)
                  .pixelBorder(2.dp, if (emoji == e) PixelColors.Green else PixelColors.Outline)
                  .clickable { emoji = e },
                contentAlignment = Alignment.Center,
              ) {
                Text(e, style = PixelType.Title)
              }
              Spacer(Modifier.width(6.dp))
            }
          }

          Spacer(Modifier.height(12.dp))

          FieldLabel("类型")
          Row {
            TypeOption(text = "日常", selected = type == "daily", onClick = { type = "daily" })
            Spacer(Modifier.width(8.dp))
            TypeOption(text = "小目标", selected = type == "stage", onClick = { type = "stage" })
          }

          Spacer(Modifier.height(12.dp))

          FieldLabel("难度")
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .horizontalScroll(rememberScrollState()),
          ) {
            DIFFICULTY_LABELS.forEachIndexed { i, label ->
              val d = i + 1
              Box(
                modifier = Modifier
                  .background(if (difficulty == d) PixelColors.GreenSoft else PixelColors.Card)
                  .pixelBorder(2.dp, if (difficulty == d) PixelColors.Green else PixelColors.Outline)
                  .clickable { difficulty = d }
                  .padding(horizontal = 10.dp, vertical = 6.dp),
              ) {
                Text(label, style = PixelType.Small, color = PixelColors.Ink)
              }
              Spacer(Modifier.width(6.dp))
            }
          }

          Spacer(Modifier.height(12.dp))

          FieldLabel("时长（分钟）")
          PixelTextField(value = durationMin, onValueChange = { durationMin = it }, placeholder = "30", modifier = Modifier.fillMaxWidth())

          Spacer(Modifier.height(12.dp))

          FieldLabel("频率")
          Row {
            FREQ_OPTIONS.forEach { opt ->
              Box(
                modifier = Modifier
                  .background(if (freqMode == opt.first) PixelColors.GreenSoft else PixelColors.Card)
                  .pixelBorder(2.dp, if (freqMode == opt.first) PixelColors.Green else PixelColors.Outline)
                  .clickable { freqMode = opt.first }
                  .padding(horizontal = 10.dp, vertical = 6.dp),
              ) {
                Text(opt.second, style = PixelType.Small, color = PixelColors.Ink)
              }
              Spacer(Modifier.width(6.dp))
            }
          }

          if (freqMode == "weekly") {
            Spacer(Modifier.height(8.dp))
            FieldLabel("每周次数")
            PixelTextField(value = freqN, onValueChange = { freqN = it }, placeholder = "3", modifier = Modifier.fillMaxWidth())
          }

          if (freqMode == "weekdays") {
            Spacer(Modifier.height(8.dp))
            FieldLabel("指定星期（1-7，逗号分隔）")
            PixelTextField(value = weekdays, onValueChange = { weekdays = it }, placeholder = "1,3,5", modifier = Modifier.fillMaxWidth())
          }

          Spacer(Modifier.height(12.dp))

          FieldLabel("打卡窗口（起止，HH:mm）")
          Row(verticalAlignment = Alignment.CenterVertically) {
            PixelTextField(value = windowStart, onValueChange = { windowStart = it }, placeholder = "06:00", modifier = Modifier.weight(1f))
            Text(" ~ ", style = PixelType.Body, color = PixelColors.Ink3)
            PixelTextField(value = windowEnd, onValueChange = { windowEnd = it }, placeholder = "22:00", modifier = Modifier.weight(1f))
          }

          if (type == "stage") {
            Spacer(Modifier.height(12.dp))
            FieldLabel("验收标准")
            PixelTextField(value = acceptCriteria, onValueChange = { acceptCriteria = it }, placeholder = "例如：读完一整本书", modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            FieldLabel("预估总时长（分钟）")
            PixelTextField(value = estTotalMin, onValueChange = { estTotalMin = it }, placeholder = "600", modifier = Modifier.fillMaxWidth())
          }

          if (error != null) {
            Spacer(Modifier.height(8.dp))
            PixelChip(text = error.orEmpty(), bg = PixelColors.OrangeSoft, fg = PixelColors.OrangeDeep)
          }

          Spacer(Modifier.height(16.dp))

          Row(modifier = Modifier.fillMaxWidth()) {
            PixelButton(
              text = "取消",
              onClick = onDismiss,
              enabled = !busy,
              modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(12.dp))
            PixelButton(
              text = if (busy) "保存中…" else "保存",
              onClick = { save() },
              enabled = !busy,
              modifier = Modifier.weight(1f),
            )
          }

          // 编辑已有目标时提供「放弃」入口
          if (existing != null) {
            Spacer(Modifier.height(12.dp))
            Box(
              modifier = Modifier
                .fillMaxWidth()
                .pixelHardShadow(4.dp, PixelColors.Outline)
                .background(PixelColors.Red)
                .pixelBorder(2.dp, PixelColors.Outline)
                .clickable(enabled = !busy) { onAbandon(existing) }
                .padding(horizontal = 20.dp, vertical = 12.dp),
              contentAlignment = Alignment.Center,
            ) {
              Text(text = "放弃此目标", style = PixelType.Body, color = PixelColors.White)
            }
          }
        }
      }
    }
  }
}

@Composable
internal fun FieldLabel(text: String) {
  Text(text = text, style = PixelType.Small, color = PixelColors.Ink3)
  Spacer(Modifier.height(4.dp))
}

@Composable
private fun TypeOption(text: String, selected: Boolean, onClick: () -> Unit) {
  Box(
    modifier = Modifier
      .background(if (selected) PixelColors.GreenSoft else PixelColors.Card)
      .pixelBorder(2.dp, if (selected) PixelColors.Green else PixelColors.Outline)
      .clickable(onClick = onClick)
      .padding(horizontal = 14.dp, vertical = 8.dp),
  ) {
    Text(text, style = PixelType.Body, color = PixelColors.Ink)
  }
}

// ==================== 打卡确认弹层 ====================

@Composable
private fun CheckinDialog(
  goal: WeekGoal,
  date: String?,
  onDismiss: () -> Unit,
  onConfirm: (Int?, String?) -> Unit,
) {
  var duration by remember { mutableStateOf("") }
  var evidence by remember { mutableStateOf("") }

  // 积分预览：custom_points 固定分值优先；否则按 perCheckinPoints 按时长比例估算
  fun previewPoints(): Int {
    val cp = goal.custom_points
    if (cp != null && cp > 0) return cp
    val base = goal.perCheckinPoints
    if (base <= 0) return 0
    val d = duration.toIntOrNull()
    if (d == null || d <= 0) return base
    // 后端公式大致按时长线性，这里做简化预览
    return maxOf(1, (base * d / 30))
  }

  Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(24.dp),
      verticalArrangement = Arrangement.Center,
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Column(
          modifier = Modifier
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        ) {
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
            Column(Modifier.weight(1f)) {
              Text(goal.title, style = PixelType.Body, color = PixelColors.Ink)
              if (date != null) {
                Text(date, style = PixelType.Small, color = PixelColors.Ink3)
              }
            }
          }

          Spacer(Modifier.height(12.dp))

          // 时长 chips（对齐 Web：15/30/45/60）
          FieldLabel("实际时长（分钟）")
          Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(15, 30, 45, 60).forEach { c ->
              val on = duration.toIntOrNull() == c
              Box(
                modifier = Modifier
                  .weight(1f)
                  .background(if (on) PixelColors.GreenSoft else PixelColors.Card)
                  .pixelBorder(2.dp, if (on) PixelColors.Green else PixelColors.Outline)
                  .clickable { duration = c.toString() }
                  .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
              ) {
                Text("$c′", style = PixelType.Small, color = if (on) PixelColors.GreenDeep else PixelColors.Ink2)
              }
            }
          }

          Spacer(Modifier.height(8.dp))

          // stepper：-5 / 值 / +5
          Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
          ) {
            PixelSmallButton(text = "−", filled = false, onClick = {
              val d = (duration.toIntOrNull() ?: 30) - 5
              duration = maxOf(1, d).toString()
            })
            Spacer(Modifier.width(12.dp))
            Text(
              text = "${duration.toIntOrNull() ?: "—"} 分钟",
              style = PixelType.Mono,
              color = PixelColors.Ink,
            )
            Spacer(Modifier.width(12.dp))
            PixelSmallButton(text = "+", filled = false, onClick = {
              val d = (duration.toIntOrNull() ?: 30) + 5
              duration = minOf(1440, d).toString()
            })
          }

          Spacer(Modifier.height(12.dp))

          FieldLabel("打卡说明（可选）")
          PixelTextField(value = evidence, onValueChange = { evidence = it }, placeholder = "例如：读完了第 3 章", modifier = Modifier.fillMaxWidth())

          Spacer(Modifier.height(12.dp))

          // 积分预览
          PixelPanel(background = PixelColors.Bg2, borderColor = PixelColors.LineStrong) {
            Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
              Text("本次预计", style = PixelType.Small, color = PixelColors.Ink3)
              Spacer(Modifier.weight(1f))
              Text("+${previewPoints()}", style = PixelType.Big, color = PixelColors.GreenDeep)
            }
          }

          Spacer(Modifier.height(16.dp))

          Row(modifier = Modifier.fillMaxWidth()) {
            PixelButton(text = "取消", onClick = onDismiss, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(12.dp))
            PixelButton(
              text = "确认打卡",
              onClick = { onConfirm(duration.toIntOrNull(), evidence.ifBlank { null }) },
              modifier = Modifier.weight(1f),
            )
          }
        }
      }
    }
  }
}

// ==================== 通用确认弹层 ====================

@Composable
private fun ConfirmDialog(
  title: String,
  message: String,
  confirmText: String,
  danger: Boolean,
  onDismiss: () -> Unit,
  onConfirm: () -> Unit,
) {
  Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(24.dp),
      verticalArrangement = Arrangement.Center,
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      PixelPanel(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
          Text(text = title, style = PixelType.Title, color = PixelColors.Ink)
          Spacer(Modifier.height(8.dp))
          Text(text = message, style = PixelType.Body, color = PixelColors.Ink2)
          Spacer(Modifier.height(16.dp))
          Row(modifier = Modifier.fillMaxWidth()) {
            PixelButton(text = "取消", onClick = onDismiss, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(12.dp))
            Box(
              modifier = Modifier
                .weight(1f)
                .pixelHardShadow(4.dp, PixelColors.Outline)
                .background(if (danger) PixelColors.Red else PixelColors.Green)
                .pixelBorder(2.dp, PixelColors.Outline)
                .clickable(onClick = onConfirm)
                .padding(horizontal = 20.dp, vertical = 12.dp),
              contentAlignment = Alignment.Center,
            ) {
              Text(text = confirmText, style = PixelType.Body, color = PixelColors.White)
            }
          }
        }
      }
    }
  }
}

// ==================== 小目标列表 ====================

/** 小目标状态徽章文案 + 颜色 */
private data class StageBadge(val label: String, val bg: Color, val fg: Color)

private fun stageBadge(status: String): StageBadge = when (status) {
  "active" -> StageBadge("进行中", PixelColors.GreenSoft, PixelColors.GreenDeep)
  "reviewing" -> StageBadge("等待验收", PixelColors.OrangeSoft, PixelColors.OrangeDeep)
  "achieved" -> StageBadge("已达成", PixelColors.GreenSoft, PixelColors.GreenDeep)
  "abandoned" -> StageBadge("已放弃", PixelColors.Bg2, PixelColors.Ink3)
  "draft" -> StageBadge("草稿", PixelColors.Bg2, PixelColors.Ink2)
  else -> StageBadge(status, PixelColors.Bg2, PixelColors.Ink2)
}

/**
 * 小目标列表：对齐 Web 版 drawStage。
 * 每个卡片：emoji + 标题 + 截止/难度 + 状态徽章 + 验收标准 + 达成分值 + 按状态的操作按钮。
 */
@Composable
private fun StageListView(
  goals: List<GoalDetail>?,
  loading: Boolean,
  onNew: () -> Unit,
  onEdit: (GoalDetail) -> Unit,
  onStart: (GoalDetail) -> Unit,
  onSubmit: (GoalDetail) -> Unit,
  onAbandon: (GoalDetail) -> Unit,
) {
  if (loading && goals == null) {
    Text("加载中…", style = PixelType.Small, color = PixelColors.Ink3)
    return
  }
  val list = goals.orEmpty()
  if (list.isEmpty()) {
    Column(
      modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Text("🌱", style = PixelType.Huge)
      Spacer(Modifier.height(8.dp))
      Text("还没有小目标", style = PixelType.Title, color = PixelColors.Ink)
      Spacer(Modifier.height(6.dp))
      Text(
        "定一个阶段要够到的东西，做完请对方验收，一次入账一大笔积分",
        style = PixelType.Small,
        color = PixelColors.Ink2,
      )
      Spacer(Modifier.height(16.dp))
      PixelSmallButton(text = "+ 新建小目标", onClick = onNew)
    }
    return
  }

  for (g in list) {
    Spacer(Modifier.height(12.dp))
    StageCard(g, onEdit, onStart, onSubmit, onAbandon)
  }
}

@Composable
private fun StageCard(
  g: GoalDetail,
  onEdit: (GoalDetail) -> Unit,
  onStart: (GoalDetail) -> Unit,
  onSubmit: (GoalDetail) -> Unit,
  onAbandon: (GoalDetail) -> Unit,
) {
  val badge = stageBadge(g.status)
  val points = g.total_points ?: 0
  val crit = g.accept_criteria.orEmpty()

  PixelPanel(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(14.dp)) {
      // 头部：emoji + 标题 + 状态徽章
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(g.emoji, style = PixelType.Title)
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
          Text(g.title, style = PixelType.Body, color = PixelColors.Ink)
          Text(
            text = "${if (g.end_date != null) "截止 ${g.end_date}" else "长期"} · 难度 ${g.difficulty}",
            style = PixelType.Small,
            color = PixelColors.Ink3,
          )
        }
        PixelChip(text = badge.label, bg = badge.bg, fg = badge.fg)
      }

      // 验收标准
      if (crit.isNotBlank()) {
        Spacer(Modifier.height(8.dp))
        Text("验收标准：$crit", style = PixelType.Small, color = PixelColors.Ink2)
      }

      // 达成分值
      Spacer(Modifier.height(8.dp))
      Text("达成 +$points 分", style = PixelType.Mono, color = PixelColors.Gold)

      // 按状态的操作
      Spacer(Modifier.height(10.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        when (g.status) {
          "active" -> {
            PixelSmallButton(text = "提交验收", onClick = { onSubmit(g) }, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            PixelSmallButton(text = "编辑", filled = false, onClick = { onEdit(g) })
            Spacer(Modifier.width(8.dp))
            PixelSmallButton(text = "放弃", filled = false, onClick = { onAbandon(g) })
          }
          "draft" -> {
            PixelSmallButton(text = "开始", onClick = { onStart(g) }, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            PixelSmallButton(text = "编辑", filled = false, onClick = { onEdit(g) })
          }
          "reviewing" -> {
            Text("等待对方验收…", style = PixelType.Small, color = PixelColors.OrangeDeep)
          }
          "achieved" -> {
            Text("+$points 分已入账", style = PixelType.Small, color = PixelColors.GreenDeep)
          }
          "abandoned" -> {
            Text("已放弃", style = PixelType.Small, color = PixelColors.Ink3)
          }
        }
      }
    }
  }
}

// ==================== 日历（对齐 Web calendarHtml / daySheet） ====================

/** 月份字符串 +- n 月（"yyyy-MM"） */
private fun shiftMonth(month: String, delta: Int): String {
  return try {
    YearMonth.parse(month).plusMonths(delta.toLong()).toString()
  } catch (e: Exception) {
    month
  }
}

/** 目标在某天是否需执行（对齐 Web calDueOn，仅 daily / weekdays） */
private fun goalDueOn(g: GoalDetail, date: String): Boolean {
  if (g.start_date.isNotBlank() && date < g.start_date) return false
  if (g.end_date != null && g.end_date.isNotBlank() && date > g.end_date) return false
  return when (g.freq_mode) {
    "daily" -> true
    "weekdays" -> {
      val wd = (LocalDate.parse(date).dayOfWeek.value) // 1=一…7=日
      g.weekdays.split(',').mapNotNull { it.trim().toIntOrNull() }.contains(wd)
    }
    else -> false
  }
}

/** 月历卡片：可折叠 + 月份导航 + 今日按钮 + 点日期弹当天目标 + 图例 */
@Composable
private fun CalendarCard(
  monthData: MonthView?,
  goalDefs: List<GoalDetail>,
  today: String,
  calMonth: String,
  open: Boolean,
  onToggle: () -> Unit,
  onPrev: () -> Unit,
  onNext: () -> Unit,
  onToday: () -> Unit,
  onDayClick: (String) -> Unit,
) {
  val ymParts = calMonth.split('-').mapNotNull { it.toIntOrNull() }
  val Y = ymParts.getOrNull(0) ?: YearMonth.now(ZONE).year
  val M = ymParts.getOrNull(1) ?: YearMonth.now(ZONE).monthValue
  PixelPanel(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(10.dp)) {
      // 折叠头
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .clickable(onClick = onToggle),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text("📅", style = PixelType.Body)
        Spacer(Modifier.width(6.dp))
        Text("日历", style = PixelType.Body, color = PixelColors.Ink, modifier = Modifier.weight(1f))
        Text("点日期看当天目标", style = PixelType.Small, color = PixelColors.Ink3)
        Spacer(Modifier.width(4.dp))
        Text(if (open) "▾" else "▸", style = PixelType.Small, color = PixelColors.Ink2)
      }

      if (open) {
        Spacer(Modifier.height(10.dp))
        // 月份导航
        Row(
          modifier = Modifier.fillMaxWidth(),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween,
        ) {
          PixelSmallButton(text = "‹", filled = false, onClick = onPrev)
          Text("${Y} 年 ${M} 月", style = PixelType.Body, color = PixelColors.Ink)
          PixelSmallButton(text = "›", filled = false, onClick = onNext)
        }
        Spacer(Modifier.height(6.dp))
        // 星期表头
        val wds = listOf("一", "二", "三", "四", "五", "六", "日")
        Row(modifier = Modifier.fillMaxWidth()) {
          wds.forEachIndexed { i, w ->
            Text(
              text = w,
              style = PixelType.Small,
              color = if (i >= 5) PixelColors.OrangeDeep else PixelColors.Ink3,
              modifier = Modifier.weight(1f),
              textAlign = TextAlign.Center,
            )
          }
        }
        Spacer(Modifier.height(4.dp))
        // 网格
        val lead = ((java.time.DayOfWeek.from(LocalDate.of(Y, M, 1)).value) - 1) // 周一=0
        val daysInMonth = YearMonth.of(Y, M).lengthOfMonth()
        val total = ((lead + daysInMonth + 6) / 7) * 7
        // 汇总某天的目标状态
        fun dayInfo(date: String): Pair<Int, Int> {
          var due = 0
          var done = 0
          for (g in monthData?.goals ?: emptyList()) {
            val cell = g.cells.find { it.date == date }
            if (cell != null) {
              when (cell.state) {
                "done" -> { due += 1; done += 1 }
                "missed", "todo" -> { due += 1 }
                "future" -> {
                  val def = goalDefs.find { it.id == g.id }
                  if (def != null && goalDueOn(def, date)) due += 1
                }
              }
            } else {
              val def = goalDefs.find { it.id == g.id }
              if (def != null && def.status == "active" && goalDueOn(def, date)) {
                // 月数据没有该日（未来月），纯靠定义推算
                if (date > today || date == today) due += 1
              }
            }
          }
          return due to done
        }
        var cellIndex = 0
        for (row in 0 until total / 7) {
          Row(modifier = Modifier.fillMaxWidth()) {
            for (col in 0 until 7) {
              val offset = cellIndex - lead + 1
              cellIndex += 1
              val inMonth = offset in 1..daysInMonth
              val date = String.format("%04d-%02d-%02d", Y, M, offset)
              val (due, done) = if (inMonth) dayInfo(date) else 0 to 0
              val isToday = date == today
              // tone：due>0 时区分
              val bg = when {
                !inMonth -> PixelColors.Bg2
                isToday -> PixelColors.OrangeSoft
                due > 0 && done == due -> PixelColors.GreenSoft
                due > 0 && done > 0 -> PixelColors.OrangeSoft
                due > 0 && date < today -> PixelColors.RedDeep.copy(alpha = 0.12f)
                else -> PixelColors.Card
              }
              Column(
                modifier = Modifier
                  .weight(1f)
                  .padding(2.dp)
                  .height(48.dp)
                  .background(bg)
                  .pixelBorder(if (isToday) 2.dp else 1.dp, if (isToday) PixelColors.Orange else PixelColors.LineStrong)
                  .clickable(enabled = inMonth) { if (inMonth) onDayClick(date) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
              ) {
                Text(
                  text = if (inMonth) offset.toString() else "",
                  style = PixelType.Small,
                  color = if (col >= 5) PixelColors.OrangeDeep else PixelColors.Ink,
                )
                if (inMonth && due > 0) {
                  Text(
                    text = if (date > today) "$due" else "$done/$due",
                    style = PixelType.Small,
                    color = if (done == due) PixelColors.GreenDeep else PixelColors.OrangeDeep,
                  )
                }
              }
            }
          }
        }
        Spacer(Modifier.height(8.dp))
        // 今天按钮 + 图例
        Row(
          modifier = Modifier.fillMaxWidth(),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween,
        ) {
          PixelSmallButton(text = "今天", filled = false, onClick = onToday)
          Row(verticalAlignment = Alignment.CenterVertically) {
            LegendDot(PixelColors.GreenSoft, "全完成")
            Spacer(Modifier.width(4.dp))
            LegendDot(PixelColors.OrangeSoft, "部分")
            Spacer(Modifier.width(4.dp))
            LegendDot(PixelColors.RedDeep.copy(alpha = 0.12f), "漏了")
          }
        }
      }
    }
  }
}

@Composable
private fun LegendDot(color: Color, label: String) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Box(
      modifier = Modifier
        .size(10.dp)
        .background(color)
        .pixelBorder(1.dp, PixelColors.LineStrong),
    )
    Spacer(Modifier.width(2.dp))
    Text(label, style = PixelType.Small, color = PixelColors.Ink3)
  }
}

/** 当天目标弹层（对齐 Web daySheet） */
@Composable
private fun DaySheetDialog(
  date: String,
  monthData: MonthView?,
  goalDefs: List<GoalDetail>,
  today: String,
  onDismiss: () -> Unit,
  onViewWeek: () -> Unit,
) {
  val items = mutableListOf<Pair<MonthGoal, MonthCell>>()
  for (g in monthData?.goals ?: emptyList()) {
    val cell = g.cells.find { it.date == date }
    if (cell != null && (cell.state == "done" || cell.state == "missed" || cell.state == "todo")) {
      items.add(g to cell)
    }
  }
  // 未来日期：纯靠定义推算（对齐 Web dayItems 的 future 分支）
  for (def in goalDefs) {
    if (def.status != "active") continue
    val exists = items.any { it.first.id == def.id }
    if (!exists && goalDueOn(def, date)) {
      // 用 monthData 里的 goal（若有 cells），否则构造
      val mg = monthData?.goals?.find { it.id == def.id }
        ?: MonthGoal(id = def.id, title = def.title, emoji = def.emoji, perCheckinPoints = def.perCheckinPoints)
      items.add(mg to MonthCell(date = date, state = "plan"))
    }
  }
  val doneCount = items.count { it.second.state == "done" }
  val totalPoints = items.filter { it.second.state == "done" }.sumOf { it.second.points }

  Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Box(
      modifier = Modifier
        .fillMaxSize()
        .padding(20.dp),
      contentAlignment = Alignment.Center,
    ) {
      PixelPanel(Modifier.fillMaxWidth()) {
        Column(
          modifier = Modifier
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        ) {
          val label = try {
            val d = LocalDate.parse(date)
            "${d.monthValue} 月 ${d.dayOfMonth} 日 · 周${"日一二三四五六"[d.dayOfWeek.value % 7]}"
          } catch (e: Exception) { date }
          Text(label, style = PixelType.Title, color = PixelColors.Ink)
          Spacer(Modifier.height(12.dp))

          // 汇总
          Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
              Text("$doneCount/${items.size}", style = PixelType.Big, color = PixelColors.Ink)
              Text("已完成", style = PixelType.Small, color = PixelColors.Ink3)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
              Text("+$totalPoints", style = PixelType.Big, color = PixelColors.GreenDeep)
              Text("当日得分", style = PixelType.Small, color = PixelColors.Ink3)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
              Text(if (date > today) "未来" else if (date < today) "过去" else "今天", style = PixelType.Big, color = PixelColors.Ink)
              Text("日期", style = PixelType.Small, color = PixelColors.Ink3)
            }
          }
          Spacer(Modifier.height(12.dp))

          Text("当天要执行的目标", style = PixelType.Body, color = PixelColors.Ink2)
          Spacer(Modifier.height(8.dp))

          if (items.isEmpty()) {
            Text("这天没有安排，休息一下 🌿", style = PixelType.Small, color = PixelColors.Ink3)
          } else {
            items.forEach { (g, cell) ->
              val tag = when (cell.state) {
                "done" -> "已完成" to PixelColors.GreenSoft
                "missed" -> "漏了" to PixelColors.OrangeSoft
                "todo" -> "今天待打" to PixelColors.OrangeSoft
                else -> "计划中" to PixelColors.Bg2
              }
              Row(
                modifier = Modifier
                  .fillMaxWidth()
                  .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
              ) {
                Text(g.emoji, style = PixelType.Body)
                Spacer(Modifier.width(8.dp))
                Text(g.title, style = PixelType.Body, color = PixelColors.Ink, modifier = Modifier.weight(1f))
                PixelChip(text = tag.first, bg = tag.second, fg = PixelColors.Ink2)
              }
            }
          }
          Spacer(Modifier.height(6.dp))
          Text(
            "过去与今天取自打卡记录；未来日期按目标频率推算，实际打卡状态以后端为准。",
            style = PixelType.Small,
            color = PixelColors.Ink3,
          )
          Spacer(Modifier.height(14.dp))
          Row(Modifier.fillMaxWidth()) {
            PixelButton(text = "查看这一周", onClick = onViewWeek, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            PixelButton(text = "知道了", onClick = onDismiss, modifier = Modifier.weight(1f))
          }
        }
      }
    }
  }
}
