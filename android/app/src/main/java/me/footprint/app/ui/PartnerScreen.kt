package me.footprint.app.ui

import android.content.Context
import android.graphics.BitmapFactory
import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.footprint.app.net.Api
import me.footprint.app.net.ApiException
import me.footprint.app.net.AppUsage
import me.footprint.app.net.BigGoalDto
import me.footprint.app.net.PartnerCheckin
import me.footprint.app.net.PartnerGoalItem
import me.footprint.app.net.PartnerPageResponse
import me.footprint.app.net.PartnerResponse
import me.footprint.app.net.PendingVerification
import me.footprint.app.net.Redemption
import me.footprint.app.net.Session
import me.footprint.app.net.SharedDiary
import me.footprint.app.net.SharedProfileBlock
import me.footprint.app.net.StatusPayload
import me.footprint.app.net.UsageDay
import me.footprint.app.net.UsageListResponse
import me.footprint.app.net.UsageRangeResponse
import me.footprint.app.net.UserStats
import me.footprint.app.net.UserStatus
import me.footprint.app.net.VerificationDetailResponse
import me.footprint.app.usage.UsageAccess
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType
import okhttp3.OkHttpClient
import okhttp3.Request

/*
 * 「我们」页：对方卡片、并排对比、待我验收、对方今日打卡、ta 的目标、手机时长对比。
 * 对齐 Web 版 partner.js：折叠抽屉 + 4 个新板块 + 图表化对比 + 状态卡 + 验收详情。
 * 数据自己拉、状态自己管，不依赖其它页面。
 *
 * 网络层只复用 Api.json（解码器）与 Session（token / baseUrl），
 * partner 相关请求与响应数据类都定义在 Api.kt（骨架层），不在本文件重定义。
 */

// ---------------- 页面状态 ----------------

/** 一次加载的完整状态 */
private class PartnerState {
  var page by mutableStateOf<PartnerPageResponse?>(null)
  var loading by mutableStateOf(true)
  var error by mutableStateOf<String?>(null)
  // 正在处理中的验收 / 打卡 id，防止连点
  var busyVerify by mutableStateOf<Long?>(null)
  var busyCheckin by mutableStateOf<Long?>(null)
  // 驳回弹层：区分「验收」与「打卡」两种
  var dialog by mutableStateOf<RejectTarget?>(null)
  // 对方状态（微信式）
  var partnerStatus by mutableStateOf<UserStatus?>(null)
  // 一次性提示
  var toast by mutableStateOf<String?>(null)
  // 「X 的状态」详情弹层
  var statusSheetOpen by mutableStateOf(false)
  // 「我也设一个」设状态弹层
  var setStatusOpen by mutableStateOf(false)
  // 验收详情弹层的 verification id
  var detailId by mutableStateOf<Long?>(null)
  // 通过前的二次确认目标
  var confirmApprove by mutableStateOf<PendingVerification?>(null)
}

/** 驳回弹层要处理的目标类型 */
private sealed class RejectTarget {
  data class Verify(val id: Long) : RejectTarget()
  data class Checkin(val id: Long) : RejectTarget()
}

// ---------------- 抽屉分组定义（对齐 Web PV_GROUPS / buildGroups） ----------------

private data class DrawerDef(
  val key: String,
  val icon: String,
  val title: String,
  val desc: String,
)

private val PARTNER_DRAWERS = listOf(
  DrawerDef("today", "📌", "今天要处理", "待验收 · ta 今天的打卡"),
  DrawerDef("stats", "📊", "数据对比", "并排看看 · 手机时长 · 7 天趋势"),
  DrawerDef("plan", "🗺️", "ta 的计划", "大目标 · 日常目标"),
  DrawerDef("record", "🎁", "共同记录", "分享的 · 最近兑换"),
)

// ---------------- 页面 ----------------

@Composable
fun PartnerScreen(
  vm: AppViewModel,
  onOpenUsageSettings: () -> Unit,
  // 未配对态「去配对」跳到「我的」页（由 MainScaffold 传入）；没传时降级为文案 + Toast 引导
  onGoMe: (() -> Unit)? = null,
) {
  val loggedIn by vm.loggedIn.collectAsStateWithLifecycle()
  if (!loggedIn) {
    GuestEmpty(vm = vm, emoji = "🤝", title = "登录后连接你的搭档", sub = "两个人互相看得见，登录后开始配对")
    return
  }
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val state = remember { PartnerState() }
  val home by vm.home.collectAsStateWithLifecycle()
  val myAvatar = home?.me?.avatar.orEmpty()
  var chatOpen by remember { mutableStateOf(false) }
  var hallOpen by remember { mutableStateOf(false) }

  // 拉数据：成功后写进 state；失败写 error
  fun load() {
    state.loading = true
    state.error = null
    scope.launch {
      val token = Session.token(context)
      if (token == null) {
        state.loading = false
        state.error = "未登录"
        return@launch
      }
      try {
        state.page = Api.getPartnerPage(token)
        state.error = null
      } catch (e: Exception) {
        if (e is ApiException && e.code == 401) {
          state.error = "登录已过期，请重新登录"
        } else if (e is ApiException && e.code == 404) {
          state.error = "还没有搭档"
        } else {
          state.error = e.message ?: "加载失败"
        }
      } finally {
        state.loading = false
      }
      // 对方状态单独拉，失败不阻塞页面
      try {
        state.partnerStatus = Api.getStatus(token).partner?.status
      } catch (e: Exception) {
        state.partnerStatus = null
      }
    }
  }

  // 通过验收（通过前先弹二次确认，确认后调这里）
  fun approve(v: PendingVerification) {
    state.busyVerify = v.id
    scope.launch {
      val token = Session.token(context)
      try {
        val r = Api.approveVerification(token ?: throw ApiException("未登录"), v.id)
        val note = if (r.overdue) "（逾期，按 90% 计）" else ""
        state.toast = "已通过「${v.goal_title}」+${r.points} 分$note"
      } catch (e: Exception) {
        state.toast = e.message ?: "通过失败"
      } finally {
        state.busyVerify = null
      }
      load()
    }
  }

  LaunchedEffect(Unit) { load() }

  Screen {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .verticalScroll(rememberScrollState()),
    ) {
      // 顶栏
      Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        Column {
          Text("我们", style = PixelType.Big, color = PixelColors.Ink)
          Text("互相看得见，才坚持得住", style = PixelType.Small, color = PixelColors.Ink3)
        }
        if (state.loading) {
          Text("加载中…", style = PixelType.Small, color = PixelColors.Ink3)
        } else {
          PixelSmallButton(text = "刷新", onClick = { load() }, filled = false)
        }
      }

      Spacer(Modifier.height(12.dp))

      val page = state.page
      val err = state.error
      // 后端 /api/partner 无搭档时返回 200 {partner:null}，404 时 state.error==「还没有搭档」，两种都算未配对
      val unpaired = when {
        err != null -> err == "还没有搭档"
        page != null -> page.partner == null
        else -> false
      }
      val taName = page?.partner?.username ?: "ta"

      when {
        unpaired -> {
          // 未配对态：对齐 Web「去配对 / 去匹配大厅」引导
          PixelPanel(modifier = Modifier.fillMaxWidth(), background = PixelColors.OrangeSoft) {
            Column(modifier = Modifier.padding(16.dp)) {
              Text("🤝", style = PixelType.Huge)
              Spacer(Modifier.height(8.dp))
              Text("还没有搭档", style = PixelType.Title, color = PixelColors.Ink)
              Spacer(Modifier.height(6.dp))
              Text(
                "去『我的 → 我的搭档』看自己的邀请码，或输入对方的码完成配对；也可以去匹配大厅找搭子。",
                style = PixelType.Body,
                color = PixelColors.Ink2,
              )
              Spacer(Modifier.height(12.dp))
              Row {
                PixelSmallButton(
                  text = "去配对",
                  filled = true,
                  onClick = {
                    if (onGoMe != null) onGoMe.invoke()
                    else Toast.makeText(context, "去『我的 → 我的搭档』看邀请码完成配对", Toast.LENGTH_SHORT).show()
                  },
                )
                Spacer(Modifier.width(8.dp))
                PixelSmallButton(text = "去匹配大厅", filled = false, onClick = { hallOpen = true })
              }
            }
          }
          Spacer(Modifier.height(12.dp))
        }

        err != null -> {
          PixelPanel(modifier = Modifier.fillMaxWidth(), background = PixelColors.OrangeSoft) {
            Column(modifier = Modifier.padding(16.dp)) {
              Text("加载出错", style = PixelType.Title, color = PixelColors.Ink)
              Spacer(Modifier.height(6.dp))
              Text(err, style = PixelType.Small, color = PixelColors.OrangeDeep)
              Spacer(Modifier.height(12.dp))
              PixelSmallButton(text = "重试", onClick = { load() })
            }
          }
          Spacer(Modifier.height(12.dp))
        }

        page == null -> {
          if (!state.loading) {
            Text("还没有内容", style = PixelType.Small, color = PixelColors.Ink3)
          }
          Spacer(Modifier.height(24.dp))
        }

        else -> {
          // 1. 顶部对方卡片（状态行可点 → PartnerStatusSheet）
          PartnerHeaderCard(
            page = page,
            partnerStatus = state.partnerStatus,
            onOpenChat = { chatOpen = true },
            onOpenStatus = { state.statusSheetOpen = true },
          )
          Spacer(Modifier.height(16.dp))

          // 2. 4 个可折叠抽屉（对齐 Web buildGroups）
          val pendingCount = page.pendingVerifications.size
          val activeGoalCount = page.partnerGoals.count { it.status == "active" || it.status == "reviewing" }
          PartnerGroups(
            defs = PARTNER_DRAWERS,
            todayBadge = if (pendingCount > 0) "$pendingCount 条待验收" else "${page.partnerToday.size} 条打卡",
            todayAlert = pendingCount > 0,
            statsBadge = "3 个板块",
            planBadge = "$activeGoalCount 个目标",
            recordBadge = "${page.sharedDiaries.size + page.partnerRecentRedemptions.size} 条记录",
            today = {
              if (page.pendingVerifications.isNotEmpty()) {
                VerificationPanel(
                  items = page.pendingVerifications,
                  busyId = state.busyVerify,
                  onApprove = { v -> state.confirmApprove = v },
                  onReject = { v -> state.dialog = RejectTarget.Verify(v.id) },
                  onDetail = { id -> state.detailId = id },
                )
                Spacer(Modifier.height(16.dp))
              }
              PartnerTodayPanel(
                items = page.partnerToday,
                busyId = state.busyCheckin,
                onReject = { c -> state.dialog = RejectTarget.Checkin(c.id) },
              )
            },
            stats = {
              ComparePanel(page = page, myAvatar = myAvatar)
              Spacer(Modifier.height(16.dp))
              UsageComparePanel(
                context = context,
                granted = UsageAccess.isGranted(context),
                onOpenUsageSettings = onOpenUsageSettings,
              )
              Spacer(Modifier.height(16.dp))
              WeekChartPanel(context = context)
            },
            plan = {
              if (page.partnerBigGoals.isNotEmpty()) {
                PartnerBigGoalsPanel(goals = page.partnerBigGoals, name = taName)
                Spacer(Modifier.height(16.dp))
              }
              PartnerGoalsPanel(goals = page.partnerGoals)
            },
            record = {
              if (page.sharedProfile.isNotEmpty() || page.sharedDiaries.isNotEmpty()) {
                SharedSection(name = taName, profile = page.sharedProfile, diaries = page.sharedDiaries)
                Spacer(Modifier.height(16.dp))
              }
              PartnerRedemptionsPanel(reds = page.partnerRecentRedemptions)
            },
          )

          Spacer(Modifier.height(24.dp))
        }
      }
    }
  }

  // 驳回理由弹层
  val target = state.dialog
  if (target != null) {
    RejectDialog(
      target = target,
      busy = state.busyCheckin != null || state.busyVerify != null,
      onDismiss = { state.dialog = null },
      onSubmit = { reason ->
        scope.launch {
          val token = Session.token(context)
          try {
            if (token == null) throw ApiException("未登录")
            when (target) {
              is RejectTarget.Verify -> {
                state.busyVerify = target.id
                Api.rejectVerification(token, target.id, reason)
                state.toast = "已驳回验收"
              }
              is RejectTarget.Checkin -> {
                state.busyCheckin = target.id
                Api.rejectCheckin(token, target.id, reason)
                state.toast = "已驳回打卡"
              }
            }
          } catch (e: Exception) {
            state.toast = e.message ?: "驳回失败"
          } finally {
            state.busyVerify = null
            state.busyCheckin = null
            state.dialog = null
          }
          load()
        }
      },
    )
  }

  // 通过验收前的二次确认（对齐 Web UI.confirm）
  val cf = state.confirmApprove
  if (cf != null) {
    PixelConfirmDialog(
      title = "通过验收",
      message = "通过「${cf.goal_title}」的验收吗？对方将入账 +${fmtThousand(cf.total_points)} 分",
      okLabel = "通过",
      onOk = {
        state.confirmApprove = null
        approve(cf)
      },
      onCancel = { state.confirmApprove = null },
    )
  }

  // 「X 的状态」详情 + 「我也设一个」
  if (state.statusSheetOpen) {
    PartnerStatusSheet(
      partnerName = state.page?.partner?.username ?: "ta",
      status = state.partnerStatus,
      onDismiss = { state.statusSheetOpen = false },
      onSetMine = {
        state.statusSheetOpen = false
        state.setStatusOpen = true
      },
    )
  }

  // 「我也设一个」设状态弹层
  if (state.setStatusOpen) {
    SetMyStatusDialog(
      context = context,
      onDismiss = { state.setStatusOpen = false },
      onSaved = { state.toast = "状态已更新" },
    )
  }

  // 验收详情弹层
  val detailId = state.detailId
  if (detailId != null) {
    VerificationDetailDialog(context = context, id = detailId, onDismiss = { state.detailId = null })
  }

  // 一次性提示
  val toast = state.toast
  if (toast != null) {
    LaunchedEffect(toast) {
      Toast.makeText(context, toast, Toast.LENGTH_SHORT).show()
      state.toast = null
    }
  }

  // 搭子私聊弹层
  if (chatOpen) {
    ChatScreen(vm = vm, onClose = { chatOpen = false })
  }

  // 匹配大厅弹层（关闭后重新拉一遍：若已组队，则从无搭子态切到有搭档）
  if (hallOpen) {
    HallScreen(vm = vm, onClose = { hallOpen = false; load() })
  }
}

// ---------------- 折叠抽屉 ----------------

@Composable
private fun PartnerGroups(
  defs: List<DrawerDef>,
  todayBadge: String,
  todayAlert: Boolean,
  statsBadge: String,
  planBadge: String,
  recordBadge: String,
  today: @Composable () -> Unit,
  stats: @Composable () -> Unit,
  plan: @Composable () -> Unit,
  record: @Composable () -> Unit,
) {
  // 默认只展开「今天要处理」（对齐 Web pvLoadState 默认值）
  var openToday by remember { mutableStateOf(true) }
  var openStats by remember { mutableStateOf(false) }
  var openPlan by remember { mutableStateOf(false) }
  var openRecord by remember { mutableStateOf(false) }
  val allOpen = openToday && openStats && openPlan && openRecord

  val badges = mapOf(
    "today" to todayBadge, "stats" to statsBadge, "plan" to planBadge, "record" to recordBadge,
  )
  val contents = mapOf<String, @Composable () -> Unit>(
    "today" to today, "stats" to stats, "plan" to plan, "record" to record,
  )
  val openOf: (String) -> Boolean = { k ->
    when (k) { "today" -> openToday; "stats" -> openStats; "plan" -> openPlan; else -> openRecord }
  }
  val toggleOf: (String) -> Unit = { k ->
    when (k) {
      "today" -> openToday = !openToday
      "stats" -> openStats = !openStats
      "plan" -> openPlan = !openPlan
      "record" -> openRecord = !openRecord
    }
  }

  // 工具行：抽屉数 + 全部展开 / 全部收起
  Row(
    modifier = Modifier.fillMaxWidth(),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.SpaceBetween,
  ) {
    Text("${defs.size} 个抽屉 · 点开看", style = PixelType.Small, color = PixelColors.Ink3)
    PixelSmallButton(
      text = if (allOpen) "全部收起" else "全部展开",
      filled = false,
      onClick = {
        val v = !allOpen
        openToday = v; openStats = v; openPlan = v; openRecord = v
      },
    )
  }
  Spacer(Modifier.height(10.dp))

  for (g in defs) {
    DrawerGroup(
      def = g,
      badge = badges[g.key].orEmpty(),
      alert = g.key == "today" && todayAlert,
      open = openOf(g.key),
      onToggle = { toggleOf(g.key) },
      content = contents[g.key] ?: {},
    )
  }
}

@Composable
private fun DrawerGroup(
  def: DrawerDef,
  badge: String,
  alert: Boolean,
  open: Boolean,
  onToggle: () -> Unit,
  content: @Composable () -> Unit,
) {
  Column(modifier = Modifier.fillMaxWidth()) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .background(if (open) PixelColors.Card else PixelColors.Bg2)
        .pixelBorder(2.dp, PixelColors.LineStrong)
        .clickable { onToggle() }
        .padding(horizontal = 12.dp, vertical = 10.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(def.icon, style = PixelType.Title)
      Spacer(Modifier.width(10.dp))
      Column(modifier = Modifier.weight(1f)) {
        Text(def.title, style = PixelType.Body, color = PixelColors.Ink)
        Text(def.desc, style = PixelType.Small, color = PixelColors.Ink3)
      }
      Spacer(Modifier.width(8.dp))
      if (alert) {
        // 待验收红色 badge
        Box(
          modifier = Modifier
            .background(PixelColors.Red)
            .pixelBorder(2.dp, PixelColors.RedDeep)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        ) {
          Text(badge, style = PixelType.Small, color = PixelColors.White)
        }
      } else {
        PixelChip(text = badge)
      }
      Spacer(Modifier.width(8.dp))
      Text(if (open) "▼" else "▶", style = PixelType.Small, color = PixelColors.Ink3)
    }
    if (open) {
      Spacer(Modifier.height(12.dp))
      content()
      Spacer(Modifier.height(16.dp))
    } else {
      Spacer(Modifier.height(10.dp))
    }
  }
}

// ---------------- 子卡片 ----------------

/** 顶部对方卡片：用户名 + 头像（状态角标）+ 连续天数 + 本月得分 + 今日打卡进度 + 状态 + 发消息入口 */
@Composable
private fun PartnerHeaderCard(
  page: PartnerPageResponse,
  partnerStatus: UserStatus?,
  onOpenChat: () -> Unit,
  onOpenStatus: () -> Unit,
) {
  val p = page.partner
  val stats = page.partnerStats
  val today = page.today
  val name = p?.username ?: "ta"
  val initial = name.take(1)

  PixelPanel(modifier = Modifier.fillMaxWidth(), background = PixelColors.GreenSoft) {
    Column(modifier = Modifier.padding(16.dp)) {
      val checked = today?.checked ?: 0
      val expected = today?.expected ?: 0
      Row(verticalAlignment = Alignment.CenterVertically) {
        // 头像：后端返回的 avatar emoji（与 Web 一致），空则兜底首字；右下角状态角标
        val avatarEmoji = p?.avatar.orEmpty()
        Box(modifier = Modifier.size(48.dp)) {
          Box(
            modifier = Modifier
              .size(48.dp)
              .background(PixelColors.Card)
              .pixelBorder(2.dp, PixelColors.Outline),
            contentAlignment = Alignment.Center,
          ) {
            Text(avatarEmoji.ifBlank { initial }, style = PixelType.Title)
          }
          if (partnerStatus != null) {
            Box(
              modifier = Modifier
                .align(Alignment.BottomEnd)
                .background(PixelColors.Card)
                .pixelBorder(1.dp, PixelColors.Outline)
                .padding(2.dp),
            ) {
              Text(partnerStatus.emoji, style = PixelType.Small)
            }
          }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
          Text(name, style = PixelType.Title, color = PixelColors.Ink)
          Text(
            // 对齐 Web：+ 号 + 千分位
            text = "连续 ${stats?.currentStreak ?: 0} 天 · 本月 +${fmtThousand(stats?.monthPoints ?: 0)} 分",
            style = PixelType.Small,
            color = PixelColors.Ink2,
          )
        }
        // 右侧：今日打卡 N/₂ 大数字（对齐 Web 版）
        Column(horizontalAlignment = Alignment.End) {
          Row(verticalAlignment = Alignment.Bottom) {
            Text(checked.toString(), style = PixelType.Big, color = PixelColors.Ink)
            Text("/$expected", style = PixelType.Small, color = PixelColors.Ink3)
          }
          Text("今日打卡", style = PixelType.Small, color = PixelColors.Ink3)
        }
      }

      Spacer(Modifier.height(12.dp))

      if (expected > 0) {
        PixelBar(
          fraction = checked.toFloat() / expected.toFloat(),
          modifier = Modifier.fillMaxWidth(),
          color = PixelColors.Green,
        )
        Spacer(Modifier.height(12.dp))
      }

      // 对方状态（微信式，对齐 Web status.js partnerRow）：整行可点 → PartnerStatusSheet
      val st = partnerStatus
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .background(PixelColors.Card)
          .pixelBorder(2.dp, PixelColors.LineStrong)
          .clickable { onOpenStatus() }
          .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(st?.emoji ?: "💭", style = PixelType.Title)
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
          Text(
            text = if (st != null) "$name 现在 ${st.label}" else "$name 还没设状态",
            style = PixelType.Small,
            color = PixelColors.Ink,
          )
          Text(
            text = if (st != null) {
              (st.text.takeIf { it.isNotBlank() } ?: "等 ta 冒个泡") + " · " + timeAgo(st.at)
            } else {
              "等 ta 冒个泡 · 点这里给自己也设一个"
            },
            style = PixelType.Small,
            color = PixelColors.Ink3,
          )
        }
        Text("›", style = PixelType.Title, color = PixelColors.Ink3)
      }

      Spacer(Modifier.height(12.dp))

      // 发消息入口
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        PixelSmallButton(text = "💬 发消息", filled = false, onClick = onOpenChat)
      }
    }
  }
}

/** 「我们」页的板块标题：■ 前缀 + 右侧说明（与 Screens.kt 的 SectionHead 同款） */
@Composable
private fun SectionHeadPs(title: String, note: String) {
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
    if (note.isNotBlank()) {
      Text(note, style = PixelType.Small, color = PixelColors.Ink2)
    }
  }
}

/** 千分位数字（对齐 Web 的 1,028 样式） */
private fun fmtThousand(n: Int): String {
  val neg = n < 0
  val digits = kotlin.math.abs(n).toString()
  val sb = StringBuilder()
  for ((i, ch) in digits.withIndex()) {
    if (i > 0 && (digits.length - i) % 3 == 0) sb.append(',')
    sb.append(ch)
  }
  return (if (neg) "-" else "") + sb.toString()
}

// ---- 以下三个是旧版两列文本表的工具函数，保留以防其它引用（ComparePanel 已改图表） ----

@Composable
private fun StatsColumn(s: UserStats?) {
  val completion = s?.completion
  val completionText = if (completion == null) "—" else "$completion%"
  StatLine("本月得分", s?.monthPoints?.let { "+" + fmtThousand(it) } ?: "—")
  StatLine("连续天数", s?.currentStreak?.let { "$it 天" } ?: "—")
  StatLine("完成率", completionText)
  StatLine("时间投入", humanMinutes(s?.timeInvestMin ?: 0))
  StatLine("当前余额", s?.balance?.let { fmtThousand(it) } ?: "—")
}

@Composable
private fun StatLine(label: String, value: String) {
  Row(
    modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, style = PixelType.Small, color = PixelColors.Ink3)
    Text(value, style = PixelType.Mono, color = PixelColors.Ink, maxLines = 1, softWrap = false)
  }
}

/** 分钟 → 可读时长（时间投入用）：Web 版 "4.3 小时" */
private fun humanMinutes(min: Int): String {
  if (min <= 0) return "0.0 小时"
  return String.format(java.util.Locale.US, "%.1f 小时", min / 60.0)
}

// ---------------- ComparePanel：图表化（对齐 Web compareChart） ----------------

private data class CompareMetric(
  val label: String,
  val color: Color,
  val value: (UserStats?) -> Float?,
  val fmt: (Float) -> String,
)

/** 5 项指标各一个专属色；同项内两人按该项最大值归一化；我实心 / ta 斜纹 */
private val COMPARE_METRICS = listOf(
  CompareMetric("本月得分", Color(0xFFD9A03A), { it?.monthPoints?.toFloat() }) { "+" + fmtThousand(it.toInt()) },
  CompareMetric("连续天数", Color(0xFF3F7C37), { it?.currentStreak?.toFloat() }) { "${it.toInt()} 天" },
  CompareMetric("本月完成率", Color(0xFF35608F), { it?.completion?.toFloat() }) { "${it.toInt()}%" },
  CompareMetric("时间投入", Color(0xFF2E7C86), { (it?.timeInvestMin ?: 0).toFloat() / 60f }) {
    String.format(java.util.Locale.US, "%.1f 小时", it.toDouble())
  },
  CompareMetric("当前余额", Color(0xFFB44A40), { it?.balance?.toFloat() }) { fmtThousand(it.toInt()) },
)

@Composable
private fun ComparePanel(page: PartnerPageResponse, myAvatar: String) {
  val taName = page.partner?.username ?: "ta"
  // 生长动画：展开抽屉时才组合本组件，started 由 false→true 触发柱条由 0 长到最终宽度
  var started by remember { mutableStateOf(false) }
  LaunchedEffect(Unit) { started = true }
  val grow by animateFloatAsState(targetValue = if (started) 1f else 0f, animationSpec = tween(550))

  Column {
    SectionHeadPs("并排看看", "不比输赢")
    Spacer(Modifier.height(8.dp))
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
      Column(modifier = Modifier.padding(16.dp)) {
        // 图例：实心 = 我，斜纹 = ta，同项内比长短
        Row(verticalAlignment = Alignment.CenterVertically) {
          Box(modifier = Modifier.size(12.dp).background(PixelColors.Ink2))
          Spacer(Modifier.width(4.dp))
          Text((myAvatar + " 我").trim(), style = PixelType.Small, color = PixelColors.Ink)
          Spacer(Modifier.width(12.dp))
          Box(
            modifier = Modifier
              .size(12.dp)
              .background(PixelColors.Ink2.copy(alpha = 0.22f))
              .stripePattern(PixelColors.Ink2),
          )
          Spacer(Modifier.width(4.dp))
          Text(taName, style = PixelType.Small, color = PixelColors.Ink)
          Spacer(Modifier.width(12.dp))
          Text("同项内比长短", style = PixelType.Small, color = PixelColors.Ink3)
        }
        Spacer(Modifier.height(12.dp))

        for (m in COMPARE_METRICS) {
          val a = m.value(page.myStats)
          val b = m.value(page.partnerStats)
          val max = maxOf(a ?: 0f, b ?: 0f, 1f)
          fun pct(v: Float?): Float =
            if (v == null || v <= 0f) 0f else maxOf(4f, v / max * 100f) / 100f

          Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(8.dp).background(m.color))
            Spacer(Modifier.width(6.dp))
            Text(m.label, style = PixelType.Small, color = PixelColors.Ink)
          }
          Spacer(Modifier.height(4.dp))
          CompareBarRow("我", a, m, pct(a), grow)
          Spacer(Modifier.height(3.dp))
          CompareBarRow("ta", b, m, pct(b), grow)
          Spacer(Modifier.height(10.dp))
        }
        Text("每项按该项中两人较大值归一，量纲不同不跨项比。", style = PixelType.Small, color = PixelColors.Ink3)
      }
    }
  }
}

@Composable
private fun CompareBarRow(
  who: String,
  value: Float?,
  metric: CompareMetric,
  fraction: Float,
  grow: Float,
) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Text(who, style = PixelType.Small, color = PixelColors.Ink3, modifier = Modifier.width(20.dp))
    Spacer(Modifier.width(6.dp))
    CompareBar(
      fraction = fraction,
      color = metric.color,
      striped = who != "我",
      grow = grow,
      modifier = Modifier.weight(1f),
    )
    Spacer(Modifier.width(6.dp))
    Text(
      text = if (value == null) "—" else metric.fmt(value),
      style = PixelType.Mono,
      color = PixelColors.Ink,
      maxLines = 1,
      softWrap = false,
      modifier = Modifier.width(76.dp),
    )
  }
}

@Composable
private fun CompareBar(
  fraction: Float,
  color: Color,
  striped: Boolean,
  grow: Float,
  modifier: Modifier = Modifier,
) {
  val f = (fraction * grow).coerceIn(0f, 1f)
  Box(
    modifier = modifier
      .height(14.dp)
      .background(PixelColors.Bg2)
      .pixelBorder(1.dp, PixelColors.LineStrong),
  ) {
    Box(
      modifier = Modifier
        .fillMaxWidth(f)
        .height(10.dp)
        .align(Alignment.CenterStart)
        .then(
          if (striped) {
            Modifier.background(color.copy(alpha = 0.22f)).stripePattern(color)
          } else {
            Modifier.background(color)
          }
        ),
    )
  }
}

/** 斜纹（ta 柱）：drawBehind 画一组 45° 斜线 */
private fun Modifier.stripePattern(color: Color): Modifier = this.drawBehind {
  val step = 8.dp.toPx()
  val w = 3.dp.toPx()
  var x = -size.height
  while (x < size.width) {
    drawLine(
      color = color,
      start = Offset(x, size.height),
      end = Offset(x + size.height, 0f),
      strokeWidth = w,
    )
    x += step
  }
}

// ---------------- 新增板块 1：对方大目标（对齐 Web pbig-list） ----------------

@Composable
private fun PartnerBigGoalsPanel(goals: List<BigGoalDto>, name: String) {
  Column {
    SectionHeadPs("$name 的大目标", "路线看得见")
    Spacer(Modifier.height(8.dp))
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
      Column(modifier = Modifier.padding(16.dp)) {
        for (b in goals) {
          val pct = b.progress.coerceIn(0, 100)
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text(b.emoji.ifBlank { "🏔️" }, style = PixelType.Title)
            Spacer(Modifier.width(8.dp))
            Text(b.title, style = PixelType.Body, color = PixelColors.Ink, modifier = Modifier.weight(1f))
            Text("$pct%", style = PixelType.Mono, color = PixelColors.Ink)
          }
          Spacer(Modifier.height(6.dp))
          PixelBar(fraction = pct / 100f, modifier = Modifier.fillMaxWidth(), color = PixelColors.Green)
          Spacer(Modifier.height(6.dp))
          Text(
            text = "已达成 ${b.done}/${b.total} 个小目标" +
              (if (b.progress_note.isNotBlank()) " · ${b.progress_note}" else ""),
            style = PixelType.Small,
            color = PixelColors.Ink2,
          )
          Spacer(Modifier.height(12.dp))
        }
      }
    }
  }
}

// ---------------- 新增板块 2：X 分享的（对齐 Web pshare-*） ----------------

@Composable
private fun SharedSection(
  name: String,
  profile: List<SharedProfileBlock>,
  diaries: List<SharedDiary>,
) {
  var openDiary by remember { mutableStateOf<SharedDiary?>(null) }

  Column {
    SectionHeadPs("$name 分享的", "ta 主动给你看的")
    Spacer(Modifier.height(8.dp))
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
      Column(modifier = Modifier.padding(16.dp)) {
        for (p in profile) {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .dashedDivider()
              .padding(vertical = 6.dp),
          ) {
            Text(profileLabel(p.block), style = PixelType.Small, color = PixelColors.Ink2)
            Spacer(Modifier.height(2.dp))
            Text(p.content.take(120), style = PixelType.Body, color = PixelColors.Ink)
          }
        }
        for (d in diaries) {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .dashedDivider()
              .padding(vertical = 6.dp)
              .clickable { openDiary = d },
          ) {
            Text("${fmtDay(d.diary_date)} 的日报", style = PixelType.Small, color = PixelColors.Ink2)
            Spacer(Modifier.height(2.dp))
            val preview = d.content.take(80) + if (d.content.length > 80) "…" else ""
            Text(preview, style = PixelType.Body, color = PixelColors.Ink)
            Text("点开看全文 ›", style = PixelType.Small, color = PixelColors.GreenDeep)
          }
        }
      }
    }
  }

  // 日报全文（对齐 Web UI.sheet）
  openDiary?.let { d ->
    Dialog(onDismissRequest = { openDiary = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .padding(horizontal = 24.dp)
          .background(PixelColors.Card)
          .pixelBorder(2.dp, PixelColors.Outline)
          .pixelHardShadow(4.dp, PixelColors.Outline),
      ) {
        Column(
          modifier = Modifier
            .padding(16.dp)
            .heightIn(max = 420.dp)
            .verticalScroll(rememberScrollState()),
        ) {
          Text("$name 分享的日报 · ${fmtDay(d.diary_date)}", style = PixelType.Title, color = PixelColors.Ink)
          Spacer(Modifier.height(10.dp))
          Text(d.content, style = PixelType.Body, color = PixelColors.Ink)
          Spacer(Modifier.height(14.dp))
          Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            PixelSmallButton(text = "关闭", filled = false, onClick = { openDiary = null })
          }
        }
      }
    }
  }
}

private fun profileLabel(block: String): String = when (block) {
  "basic" -> "基本情况"
  "skills" -> "技能特长"
  "habits" -> "习惯"
  "goals" -> "目标"
  else -> block.ifBlank { "分享" }
}

// ---------------- 新增板块 3：7 天手机时长折线（对齐 Web weekChart） ----------------

@Composable
private fun WeekChartPanel(context: Context) {
  var range by remember { mutableStateOf<UsageRangeResponse?>(null) }
  var loading by remember { mutableStateOf(true) }

  LaunchedEffect(Unit) {
    val token = Session.token(context)
    try {
      if (token != null) range = Api.getUsageRange(token, 7)
    } catch (e: Exception) {
      range = null
    } finally {
      loading = false
    }
  }

  Column {
    SectionHeadPs("7 天手机时长", "断点 = 没上报")
    Spacer(Modifier.height(8.dp))
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
      Column(modifier = Modifier.padding(16.dp)) {
        val r = range
        when {
          loading -> Text("加载中…", style = PixelType.Small, color = PixelColors.Ink3)
          r == null || r.partner == null -> Text("7 天趋势暂时读不到", style = PixelType.Small, color = PixelColors.Ink3)
          else -> {
            val days = r.days.coerceAtLeast(2)
            val meS = r.me.series
            val taS = r.partner!!.series
            Canvas(modifier = Modifier.fillMaxWidth().height(150.dp)) {
              val W = size.width
              val H = size.height
              val padL = 30.dp.toPx()
              val padR = 10.dp.toPx()
              val padT = 12.dp.toPx()
              val padB = 18.dp.toPx()
              val maxSec = maxOf(
                3600f,
                (meS + taS).mapNotNull { it.totalSeconds?.toFloat() }.maxOrNull() ?: 0f,
              )
              fun xOf(i: Int): Float = padL + i * (W - padL - padR) / (days - 1)
              fun yOf(sec: Long?): Float? =
                if (sec == null) null else padT + (1f - sec / maxSec) * (H - padT - padB)

              // 网格线（0.5 / 1.0 高度）
              for (f in listOf(0.5f, 1f)) {
                val gy = padT + (1f - f) * (H - padT - padB)
                drawLine(PixelColors.Line, Offset(padL, gy), Offset(W - padR, gy), 1.dp.toPx())
              }
              fun series(series: List<UsageDay>, color: Color) {
                var prev: Offset? = null
                for (i in 0 until minOf(days, series.size)) {
                  val yy = yOf(series[i].totalSeconds)
                  if (yy == null) {
                    prev = null // 断点：未上报，不补 0、不连线
                    continue
                  }
                  val pt = Offset(xOf(i), yy)
                  if (prev != null) drawLine(color, prev!!, pt, 2.dp.toPx())
                  drawCircle(color, 3.dp.toPx(), pt)
                  prev = pt
                }
              }
              series(meS, PixelColors.Green)
              series(taS, PixelColors.Orange)
              // ta 断点处画一个小空心点在基线上
              for (i in 0 until minOf(days, taS.size)) {
                if (taS[i].totalSeconds == null) {
                  drawCircle(PixelColors.Ink3, 2.dp.toPx(), Offset(xOf(i), H - padB))
                }
              }
            }
            // 日期标签（隔一个显示，对齐 Web labels）
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
              val labelSeries = meS.ifEmpty { taS }
              for (i in 0 until days) {
                val date = labelSeries.getOrNull(i)?.date.orEmpty()
                val day = date.takeLast(2).toIntOrNull()?.toString() ?: ""
                Text(
                  if (i % 2 == 0) day else "",
                  style = PixelType.Small,
                  color = PixelColors.Ink3,
                  modifier = Modifier.width(20.dp),
                )
              }
            }
            Spacer(Modifier.height(8.dp))
            // 图例
            Row(verticalAlignment = Alignment.CenterVertically) {
              LegendSwatch(PixelColors.Green, false)
              Text(" 我", style = PixelType.Small, color = PixelColors.Ink)
              Spacer(Modifier.width(12.dp))
              LegendSwatch(PixelColors.Orange, false)
              Text(" ta", style = PixelType.Small, color = PixelColors.Ink)
              Spacer(Modifier.width(12.dp))
              LegendSwatch(PixelColors.Ink3, true)
              Text(" 未上报（不补 0）", style = PixelType.Small, color = PixelColors.Ink3)
            }
          }
        }
      }
    }
  }
}

@Composable
private fun LegendSwatch(color: Color, gap: Boolean) {
  if (gap) {
    Box(
      modifier = Modifier
        .size(10.dp)
        .background(PixelColors.Bg2)
        .pixelBorder(1.dp, color),
    )
  } else {
    Box(modifier = Modifier.size(10.dp).background(color))
  }
}

// ---------------- 新增板块 4：验收详情（对齐 Web detailSheet） ----------------

@Composable
private fun VerificationDetailDialog(context: Context, id: Long, onDismiss: () -> Unit) {
  var detail by remember { mutableStateOf<VerificationDetailResponse?>(null) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(id) {
    loading = true
    error = null
    detail = null
    val token = Session.token(context)
    try {
      detail = Api.verificationDetail(token ?: throw ApiException("未登录"), id)
    } catch (e: Exception) {
      error = e.message ?: "加载失败"
    } finally {
      loading = false
    }
  }

  Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 20.dp)
        .background(PixelColors.Card)
        .pixelBorder(2.dp, PixelColors.Outline)
        .pixelHardShadow(4.dp, PixelColors.Outline),
    ) {
      Column(
        modifier = Modifier
          .padding(16.dp)
          .heightIn(max = 520.dp)
          .verticalScroll(rememberScrollState()),
      ) {
        Text("验收详情", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(12.dp))
        when {
          loading -> Text("加载中…", style = PixelType.Small, color = PixelColors.Ink3)
          error != null -> Text(error!!, style = PixelType.Small, color = PixelColors.Red)
          else -> {
            val d = detail ?: return@Column
            val v = d.verification
            val g = d.goal
            Row(verticalAlignment = Alignment.CenterVertically) {
              Text(g.emoji.ifBlank { "🎯" }, style = PixelType.Title)
              Spacer(Modifier.width(8.dp))
              Column(modifier = Modifier.weight(1f)) {
                Text(g.title, style = PixelType.Body, color = PixelColors.Ink)
                Text(
                  "${d.submitter.nickname} · 第 ${v.submitCount} 次提交 · ${fmtWhen(v.createdAt)}",
                  style = PixelType.Small,
                  color = PixelColors.Ink3,
                )
              }
            }
            Spacer(Modifier.height(10.dp))
            DetailBlock("描述", g.description)
            DetailBlock("验收标准", g.acceptCriteria?.takeIf { it.isNotBlank() } ?: "（没写）")
            DetailBlock("自述", v.selfStatement)
            DetailBlock("证据文字", v.evidenceText)
            if (v.evidenceUrls.isNotEmpty()) {
              Text("证据图片", style = PixelType.Small, color = PixelColors.Ink2)
              Spacer(Modifier.height(4.dp))
              for (u in v.evidenceUrls) {
                EvidenceImage(url = evidenceFullUrl(u))
                Spacer(Modifier.height(6.dp))
              }
            }
            val endInfo = buildString {
              if (!g.endDate.isNullOrBlank()) append("截止 ${fmtDay(g.endDate)} · ")
              append("达成 +${fmtThousand(g.totalPoints)} 分")
            }
            Text(endInfo, style = PixelType.Small, color = PixelColors.Ink3)
            val rejects = d.history.filter { it.status == "rejected" }
            if (rejects.isNotEmpty()) {
              Spacer(Modifier.height(8.dp))
              Text("历史驳回（${rejects.size} 次）", style = PixelType.Small, color = PixelColors.Ink2)
              for (h in rejects) {
                Text(
                  "第 ${h.submit_count} 次：${h.reason ?: "（无理由）"}",
                  style = PixelType.Small,
                  color = PixelColors.Red,
                )
              }
            }
          }
        }
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
          PixelSmallButton(text = "关闭", filled = false, onClick = onDismiss)
        }
      }
    }
  }
}

@Composable
private fun DetailBlock(label: String, text: String?) {
  if (text.isNullOrBlank()) return
  Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
    Text(label, style = PixelType.Small, color = PixelColors.Ink2)
    Spacer(Modifier.height(2.dp))
    Text(text, style = PixelType.Body, color = PixelColors.Ink)
  }
}

// ---------------- 状态卡：PartnerStatusSheet + 我也设一个 ----------------

private data class StatusPreset(val key: String, val emoji: String, val label: String, val group: String)

private val STATUS_PRESETS = listOf(
  StatusPreset("mood:美滋滋", "😊", "美滋滋", "mood"),
  StatusPreset("mood:疲惫", "😮‍💨", "疲惫", "mood"),
  StatusPreset("mood:冲", "💪", "冲", "mood"),
  StatusPreset("mood:emo", "😢", "emo", "mood"),
  StatusPreset("work:搬砖", "🧱", "搬砖", "work"),
  StatusPreset("work:沉迷学习", "📚", "沉迷学习", "work"),
  StatusPreset("work:摸鱼", "🐟", "摸鱼", "work"),
  StatusPreset("work:勿扰模式", "🌙", "勿扰模式", "work"),
  StatusPreset("activity:运动", "🏃‍♀️", "运动", "activity"),
  StatusPreset("activity:喝咖啡", "☕", "喝咖啡", "activity"),
  StatusPreset("activity:干饭", "🍚", "干饭", "activity"),
  StatusPreset("activity:自拍", "🤳", "自拍", "activity"),
  StatusPreset("rest:睡觉", "😴", "睡觉", "rest"),
  StatusPreset("rest:听歌", "🎧", "听歌", "rest"),
  StatusPreset("rest:玩游戏", "🎮", "玩游戏", "rest"),
  StatusPreset("rest:宅", "🛋️", "宅", "rest"),
)

@Composable
private fun PartnerStatusSheet(
  partnerName: String,
  status: UserStatus?,
  onDismiss: () -> Unit,
  onSetMine: () -> Unit,
) {
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
        Text("$partnerName 的状态", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
          Text(status?.emoji ?: "💭", style = PixelType.Huge)
          Spacer(Modifier.width(12.dp))
          Column {
            Text(status?.label ?: "还没设状态", style = PixelType.Title, color = PixelColors.Ink)
            Text(
              "$partnerName · " + if (status != null) timeAgo(status.at) else "还没有搭档",
              style = PixelType.Small,
              color = PixelColors.Ink3,
            )
          }
        }
        Spacer(Modifier.height(10.dp))
        Text(
          text = if (status != null && status.text.isNotBlank()) "「${status.text}」" else "ta 没写留言",
          style = PixelType.Body,
          color = if (status != null && status.text.isNotBlank()) PixelColors.Ink else PixelColors.Ink3,
        )
        Spacer(Modifier.height(8.dp))
        Text("状态随时会变，切回来就能看到最新的。", style = PixelType.Small, color = PixelColors.Ink3)
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
          PixelSmallButton(text = "关闭", filled = false, onClick = onDismiss)
          Spacer(Modifier.width(8.dp))
          PixelSmallButton(text = "我也设一个", filled = true, onClick = onSetMine)
        }
      }
    }
  }
}

@Composable
private fun SetMyStatusDialog(context: Context, onDismiss: () -> Unit, onSaved: (UserStatus) -> Unit) {
  var selected by remember { mutableStateOf<StatusPreset?>(null) }
  var text by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var err by remember { mutableStateOf<String?>(null) }
  val scope = rememberCoroutineScope()

  Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 20.dp)
        .background(PixelColors.Card)
        .pixelBorder(2.dp, PixelColors.Outline)
        .pixelHardShadow(4.dp, PixelColors.Outline),
    ) {
      Column(
        modifier = Modifier
          .padding(16.dp)
          .heightIn(max = 480.dp)
          .verticalScroll(rememberScrollState()),
      ) {
        Text("设个状态", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(6.dp))
        Text("挑一个，或写句话（状态只给搭档看）", style = PixelType.Small, color = PixelColors.Ink3)
        Spacer(Modifier.height(10.dp))
        for (row in STATUS_PRESETS.chunked(4)) {
          Row(modifier = Modifier.fillMaxWidth()) {
            for (p in row) {
              val on = selected == p
              Box(
                modifier = Modifier
                  .weight(1f)
                  .padding(3.dp)
                  .background(if (on) PixelColors.GreenSoft else PixelColors.Bg2)
                  .pixelBorder(2.dp, if (on) PixelColors.Green else PixelColors.LineStrong)
                  .clickable { selected = p }
                  .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
              ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                  Text(p.emoji, style = PixelType.Title)
                  Text(p.label, style = PixelType.Small, color = PixelColors.Ink)
                }
              }
            }
            // 补齐不足 4 个的空位，保持对齐
            repeat(4 - row.size) {
              Spacer(modifier = Modifier.weight(1f).padding(3.dp))
            }
          }
        }
        Spacer(Modifier.height(10.dp))
        PixelTextField(
          value = text,
          onValueChange = { text = it.take(40) },
          placeholder = "说点什么（可不填，最多 40 字）",
          modifier = Modifier.fillMaxWidth(),
        )
        if (err != null) {
          Spacer(Modifier.height(6.dp))
          Text(err!!, style = PixelType.Small, color = PixelColors.Red)
        }
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
          PixelSmallButton(text = "取消", filled = false, onClick = onDismiss)
          Spacer(Modifier.width(8.dp))
          PixelSmallButton(
            text = if (busy) "保存中…" else "就这样",
            filled = true,
            onClick = {
              val p = selected
              if (p == null) { err = "先挑一个状态"; return@PixelSmallButton }
              if (busy) return@PixelSmallButton
              busy = true
              err = null
              scope.launch {
                val token = Session.token(context)
                try {
                  val s = Api.setStatus(
                    token ?: throw ApiException("未登录"),
                    StatusPayload(p.key, p.emoji, p.label, text.trim(), p.group),
                  )
                  onSaved(s)
                  onDismiss()
                } catch (e: Exception) {
                  err = e.message ?: "保存失败"
                } finally {
                  busy = false
                }
              }
            },
          )
        }
      }
    }
  }
}

// ---------------- 待我验收 ----------------

@Composable
private fun VerificationPanel(
  items: List<PendingVerification>,
  busyId: Long?,
  onApprove: (PendingVerification) -> Unit,
  onReject: (PendingVerification) -> Unit,
  onDetail: (Long) -> Unit,
) {
  PixelPanel(modifier = Modifier.fillMaxWidth(), background = PixelColors.OrangeSoft) {
    Column(modifier = Modifier.padding(16.dp)) {
      Text("待我验收", style = PixelType.Title, color = PixelColors.Ink)
      Spacer(Modifier.height(10.dp))

      for (v in items) {
        Spacer(Modifier.height(8.dp))
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .background(PixelColors.Card)
            .pixelBorder(2.dp, PixelColors.Outline)
            .padding(12.dp),
        ) {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text(v.goal_emoji, style = PixelType.Title)
            Spacer(Modifier.width(8.dp))
            Text(
              text = v.goal_title,
              style = PixelType.Body,
              color = PixelColors.Ink,
              modifier = Modifier.weight(1f),
            )
          }
          Spacer(Modifier.height(6.dp))
          Text(
            text = "${v.submitter_username} · ${fmtWhen(v.created_at)} · 达成 +${fmtThousand(v.total_points)} 分",
            style = PixelType.Small,
            color = PixelColors.Ink3,
          )
          if (v.submit_count > 1) {
            Text("第 ${v.submit_count} 次提交", style = PixelType.Small, color = PixelColors.Ink3)
          }
          val criteria = v.accept_criteria
          if (!criteria.isNullOrBlank()) {
            Text("验收标准：$criteria", style = PixelType.Small, color = PixelColors.Ink2)
          }
          if (!v.self_statement.isNullOrBlank()) {
            Text("自述：${v.self_statement}", style = PixelType.Small, color = PixelColors.Ink2)
          }
          if (!v.evidence_text.isNullOrBlank()) {
            Text("证据：${v.evidence_text}", style = PixelType.Small, color = PixelColors.Ink2)
          }
          Spacer(Modifier.height(10.dp))
          val busy = busyId == v.id
          Row {
            PixelSmallButton(text = "看详情", filled = false, onClick = { onDetail(v.id) })
            Spacer(Modifier.width(6.dp))
            PixelSmallButton(
              text = if (busy) "处理中…" else "通过",
              filled = true,
              onClick = { if (!busy) onApprove(v) },
            )
            Spacer(Modifier.width(6.dp))
            PixelSmallButton(text = "驳回", filled = false, onClick = { onReject(v) })
          }
        }
      }
    }
  }
}

// ---------------- 对方今天的打卡 ----------------

@Composable
private fun PartnerTodayPanel(
  items: List<PartnerCheckin>,
  busyId: Long?,
  onReject: (PartnerCheckin) -> Unit,
) {
  PixelPanel(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp)) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text("ta 今天的打卡", style = PixelType.Title, color = PixelColors.Ink)
        Text("${items.size} 条", style = PixelType.Mono, color = PixelColors.Ink3)
      }
      Spacer(Modifier.height(10.dp))

      if (items.isEmpty()) {
        Text("ta 今天还没有打卡", style = PixelType.Small, color = PixelColors.Ink3)
        return@Column
      }

      for (c in items) {
        Spacer(Modifier.height(8.dp))
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .dashedDivider()
            .padding(vertical = 6.dp),
        ) {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text(c.goalEmoji, style = PixelType.Title)
            Spacer(Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
              Text(c.goalTitle, style = PixelType.Body, color = PixelColors.Ink)
              Text(
                text = "+${c.points} 分 · ${c.durationMin} 分钟 · ${fmtWhen(c.createdAt)}",
                style = PixelType.Small,
                color = PixelColors.Ink2,
              )
            }
            when (c.status) {
              "credited" -> {
                val busy = busyId == c.id
                PixelSmallButton(
                  text = if (busy) "…" else "驳回",
                  filled = false,
                  onClick = { if (!busy) onReject(c) },
                )
              }
              "rejected" -> PixelChip(text = "已驳回", bg = PixelColors.OrangeSoft, fg = PixelColors.OrangeDeep)
              "revoked" -> PixelChip(text = "已撤销", bg = PixelColors.OrangeSoft, fg = PixelColors.OrangeDeep)
              else -> PixelChip(text = c.status, bg = PixelColors.OrangeSoft, fg = PixelColors.OrangeDeep)
            }
          }
          if (c.evidenceText.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text("「${c.evidenceText}」", style = PixelType.Small, color = PixelColors.Ink2)
          }
          if (c.evidenceUrl != null) {
            Spacer(Modifier.height(4.dp))
            EvidenceImage(url = evidenceFullUrl(c.evidenceUrl))
          }
        }
      }
    }
  }
}

// ---------------- ta 的目标 ----------------

@Composable
private fun PartnerGoalsPanel(goals: List<PartnerGoalItem>) {
  val active = goals.filter { it.status == "active" || it.status == "reviewing" }

  PixelPanel(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp)) {
      Text("ta 的目标", style = PixelType.Title, color = PixelColors.Ink)
      Spacer(Modifier.height(10.dp))

      if (active.isEmpty()) {
        Text("ta 还没有进行中的目标", style = PixelType.Small, color = PixelColors.Ink3)
        return@Column
      }

      for (g in active) {
        Spacer(Modifier.height(8.dp))
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .dashedDivider()
            .padding(vertical = 6.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(g.emoji, style = PixelType.Title)
          Spacer(Modifier.width(8.dp))
          Column(modifier = Modifier.weight(1f)) {
            Text(g.title, style = PixelType.Body, color = PixelColors.Ink)
            Text(
              text = "${freqLabel(g.freq_mode, g.freq_n, g.weekdays)} · 每次 +${fmtThousand(g.perCheckinPoints)} 分",
              style = PixelType.Small,
              color = PixelColors.Ink2,
            )
          }
          if (g.streak > 0) {
            Text("🔥${g.streak}", style = PixelType.Mono, color = PixelColors.OrangeDeep)
          }
        }
      }
    }
  }
}

/** 频率文案：对齐 Web freqText（每日 / 每周 N 次 / weekdays 列具体星期「周一·二…」）。 */
private fun freqLabel(mode: String, n: Int, weekdays: String = ""): String = when (mode) {
  "daily" -> "每日"
  "weekly" -> "每周 $n 次"
  "weekdays" -> {
    val names = arrayOf("一", "二", "三", "四", "五", "六", "日")
    val list = weekdays.split(",").mapNotNull { it.trim().toIntOrNull() }
      .mapNotNull { names.getOrNull(it - 1) }
    if (list.isEmpty()) "每周指定日" else "周" + list.joinToString("·")
  }
  else -> mode
}

// ---------------- 手机时长对比（原样保留） ----------------

@Composable
private fun UsageComparePanel(
  context: Context,
  granted: Boolean,
  onOpenUsageSettings: () -> Unit,
) {
  var my by remember { mutableStateOf<UsageListResponse?>(null) }
  var ta by remember { mutableStateOf<PartnerResponse?>(null) }

  LaunchedEffect(Unit) {
    val token = Session.token(context)
    if (token == null) return@LaunchedEffect
    try {
      my = Api.getMyToday(token)
    } catch (e: Exception) {
      // 拿不到就留空
    }
    try {
      ta = Api.getPartner(token)
    } catch (e: Exception) {
      // 留空
    }
  }

  Column {
    SectionHeadPs("手机在谁手里", "今日")
    Spacer(Modifier.height(8.dp))
    PixelPanel(modifier = Modifier.fillMaxWidth()) {
      Column(modifier = Modifier.padding(16.dp)) {
        // 上半：双方总时长 大数字 + 进度条（中间竖虚线）
        Row(modifier = Modifier.fillMaxWidth()) {
          Column(modifier = Modifier.weight(1f)) {
            Text("我", style = PixelType.Small, color = PixelColors.Ink3)
            Spacer(Modifier.height(2.dp))
            if (!granted) {
              Text("还没开启使用情况访问", style = PixelType.Small, color = PixelColors.OrangeDeep)
              Spacer(Modifier.height(4.dp))
              Text("开启后 ta 才能看到你的手机时长", style = PixelType.Small, color = PixelColors.Ink2)
              Spacer(Modifier.height(8.dp))
              PixelSmallButton(text = "去开启", onClick = onOpenUsageSettings)
            } else {
              Text(
                text = my?.let { AppViewModel.humanDuration(it.totalSeconds) } ?: "—",
                style = PixelType.Big,
                color = PixelColors.GreenDeep,
              )
              Spacer(Modifier.height(6.dp))
              val maxSec = maxOf(my?.totalSeconds ?: 0L, ta?.totalSeconds ?: 0L, 1L)
              PixelBar(
                fraction = (my?.totalSeconds ?: 0L).toFloat() / maxSec,
                modifier = Modifier.fillMaxWidth(),
                color = PixelColors.Green,
              )
              Spacer(Modifier.height(4.dp))
              Text("${(my?.totalSeconds ?: 0L) / 60} 分钟", style = PixelType.Small, color = PixelColors.Ink2)
            }
          }
          Spacer(Modifier.width(12.dp))
          Box(modifier = Modifier.width(2.dp).height(80.dp).dashedDividerV())
          Spacer(Modifier.width(12.dp))
          Column(modifier = Modifier.weight(1f)) {
            Text(ta?.partner?.username ?: "ta", style = PixelType.Small, color = PixelColors.Ink3)
            Spacer(Modifier.height(2.dp))
            Text(
              text = ta?.let { AppViewModel.humanDuration(it.totalSeconds) } ?: "—",
              style = PixelType.Big,
              color = PixelColors.OrangeDeep,
            )
            Spacer(Modifier.height(6.dp))
            val maxSec = maxOf(my?.totalSeconds ?: 0L, ta?.totalSeconds ?: 0L, 1L)
            PixelBar(
              fraction = (ta?.totalSeconds ?: 0L).toFloat() / maxSec,
              modifier = Modifier.fillMaxWidth(),
              color = PixelColors.Orange,
            )
            Spacer(Modifier.height(4.dp))
            Text("${(ta?.totalSeconds ?: 0L) / 60} 分钟", style = PixelType.Small, color = PixelColors.Ink2)
          }
        }

        Spacer(Modifier.height(12.dp))

        // 下半：双方 Top5 App 并排（我绿条 / ta 橙条）
        Row(modifier = Modifier.fillMaxWidth()) {
          Column(modifier = Modifier.weight(1f)) {
            Text("我", style = PixelType.Small, color = PixelColors.Ink3)
            Spacer(Modifier.height(6.dp))
            val myApps = (my?.apps ?: emptyList()).sortedByDescending { it.seconds }.take(5)
            if (myApps.isEmpty()) {
              Text("暂无数据", style = PixelType.Small, color = PixelColors.Ink3)
            }
            val maxMy = myApps.firstOrNull()?.seconds ?: 1L
            for (a in myApps) {
              AppRowMini(a, maxMy, PixelColors.Green)
              Spacer(Modifier.height(6.dp))
            }
          }
          Spacer(Modifier.width(12.dp))
          Box(modifier = Modifier.width(2.dp).height(200.dp).dashedDividerV())
          Spacer(Modifier.width(12.dp))
          Column(modifier = Modifier.weight(1f)) {
            Text(ta?.partner?.username ?: "ta", style = PixelType.Small, color = PixelColors.Ink3)
            Spacer(Modifier.height(6.dp))
            val taApps = (ta?.apps ?: emptyList()).sortedByDescending { it.seconds }.take(5)
            if (taApps.isEmpty()) {
              Text("暂无数据", style = PixelType.Small, color = PixelColors.Ink3)
            }
            val maxTa = taApps.firstOrNull()?.seconds ?: 1L
            for (a in taApps) {
              AppRowMini(a, maxTa, PixelColors.Orange)
              Spacer(Modifier.height(6.dp))
            }
          }
        }

        Spacer(Modifier.height(8.dp))

        // 底部：ta 最近同步时间
        val sync = ta?.lastReportAt
        if (sync != null) {
          val stale = ta?.staleMinutes ?: 0
          val staleTxt = when {
            stale <= 0 -> "刚刚"
            stale < 60 -> "$stale 分钟前"
            else -> "${stale / 60} 小时前"
          }
          Text(
            text = "🕐 ta 最近一次同步于 ${AppViewModel.clockOf(sync)} · $staleTxt",
            style = PixelType.Small,
            color = PixelColors.Ink2,
          )
        }
      }
    }
  }
}

/** 迷你 App 行：名字 + 秒数 + 色条（「我们」页手机对比用） */
@Composable
private fun AppRowMini(a: AppUsage, maxSeconds: Long, color: Color) {
  Column {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
      Text(
        a.appName.ifBlank { a.packageName },
        style = PixelType.Small,
        color = PixelColors.Ink,
        maxLines = 1,
        softWrap = false,
        modifier = Modifier.weight(1f, fill = false),
      )
      Spacer(Modifier.width(6.dp))
      Text(
        text = AppViewModel.humanDuration(a.seconds),
        style = PixelType.Small,
        color = PixelColors.Ink2,
      )
    }
    Spacer(Modifier.height(2.dp))
    PixelBar(
      fraction = a.seconds.toFloat() / maxSeconds.coerceAtLeast(1L),
      modifier = Modifier.fillMaxWidth(),
      color = color,
    )
  }
}

/** 竖向虚线分隔（「我们」页手机对比的中间分隔） */
fun Modifier.dashedDividerV(color: Color = PixelColors.LineStrong): Modifier = drawBehind {
  val dash = 6.dp.toPx()
  val gap = 4.dp.toPx()
  val w = 2.dp.toPx()
  var y = 0f
  while (y < size.height) {
    drawRect(
      color = color,
      topLeft = Offset(0f, y),
      size = Size(w, minOf(dash, size.height - y)),
    )
    y += dash + gap
  }
}

// ---------------- 驳回理由弹层 ----------------

@Composable
private fun RejectDialog(
  target: RejectTarget,
  busy: Boolean,
  onDismiss: () -> Unit,
  onSubmit: (String) -> Unit,
) {
  val title = when (target) {
    is RejectTarget.Verify -> "驳回验收"
    is RejectTarget.Checkin -> "驳回打卡"
  }
  var reason by remember { mutableStateOf("") }
  val context = LocalContext.current

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
        Text(title, style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(8.dp))
        Text("说说驳回的理由（1–200 字）", style = PixelType.Small, color = PixelColors.Ink3)
        Spacer(Modifier.height(10.dp))
        PixelTextField(
          value = reason,
          onValueChange = { reason = it },
          placeholder = "比如：证据不足 / 时长不对",
          modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
          PixelSmallButton(text = "取消", filled = false, onClick = onDismiss)
          Spacer(Modifier.width(8.dp))
          PixelSmallButton(
            text = if (busy) "提交中…" else "提交",
            filled = true,
            onClick = {
              val r = reason.trim()
              // 校验驳回理由非空（对齐 Web rejectSheet / rejectVerifySheet）
              if (r.isEmpty()) {
                Toast.makeText(context, "写一句理由，对方才知道差在哪", Toast.LENGTH_SHORT).show()
              } else {
                onSubmit(r)
              }
            },
          )
        }
      }
    }
  }
}

// ---------------- ta 最近的兑换 ----------------

@Composable
private fun PartnerRedemptionsPanel(reds: List<Redemption>) {
  PixelPanel(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp)) {
      Text("ta 最近的兑换", style = PixelType.Title, color = PixelColors.Ink)
      Spacer(Modifier.height(10.dp))
      if (reds.isEmpty()) {
        Text("还没有", style = PixelType.Small, color = PixelColors.Ink3)
        return@Column
      }
      for (r in reds.take(5)) {
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .dashedDivider()
            .padding(vertical = 6.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(r.item_emoji, style = PixelType.Title)
          Spacer(Modifier.width(8.dp))
          Column(modifier = Modifier.weight(1f)) {
            Text(r.item_title, style = PixelType.Body, color = PixelColors.Ink)
            Text(
              text = "${fmtWhen(r.applied_at)} · ${fmtThousand(r.points_locked)} 分",
              style = PixelType.Small,
              color = PixelColors.Ink2,
            )
          }
        }
      }
    }
  }
}

// ---------------- 通用工具 ----------------

/** 后端证据是 /api/file/{id} 相对路径，用 Api.fileUrl 补全成带域名的绝对地址 */
private fun evidenceFullUrl(raw: String): String {
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  val id = raw.substringAfterLast('/').toLongOrNull()
  return if (id != null) {
    Api.fileUrl(id)
  } else {
    Api.baseUrl().trimEnd('/') + "/" + raw.removePrefix("/")
  }
}

/** 网络图片：OkHttp 带 Cookie 拉 bytes → BitmapFactory 解码 → ImageBitmap。
 *  项目没引 coil，这里自足实现，不新增依赖。 */
@Composable
private fun EvidenceImage(url: String, modifier: Modifier = Modifier) {
  val context = LocalContext.current
  var img by remember(url) { mutableStateOf<ImageBitmap?>(null) }
  var failed by remember(url) { mutableStateOf(false) }

  LaunchedEffect(url) {
    img = null
    failed = false
    val token = Session.token(context)
    val bmp = withContext(Dispatchers.IO) {
      try {
        val req = Request.Builder().url(url)
          .apply { if (token != null) header("Cookie", "fp_token=$token") }
          .build()
        OkHttpClient().newCall(req).execute().use { resp ->
          if (!resp.isSuccessful) {
            null
          } else {
            val bytes = resp.body?.bytes()
            if (bytes != null) BitmapFactory.decodeByteArray(bytes, 0, bytes.size) else null
          }
        }
      } catch (e: Exception) {
        null
      }
    }
    if (bmp != null) img = bmp.asImageBitmap() else failed = true
  }

  if (img != null) {
    Image(
      bitmap = img!!,
      contentDescription = "证据图片",
      modifier = modifier
        .fillMaxWidth()
        .height(140.dp)
        .background(PixelColors.Bg2)
        .pixelBorder(2.dp, PixelColors.LineStrong),
    )
  } else {
    Text(
      text = if (failed) "（图片加载失败）" else "图片加载中…",
      style = PixelType.Small,
      color = PixelColors.Ink3,
    )
  }
}

/** ISO 时间 → 上海时区 "M月D日 HH:mm"；非 ISO 兜底抓 HH:mm */
private fun fmtWhen(iso: String?): String {
  if (iso.isNullOrBlank()) return ""
  return try {
    val t = java.time.Instant.parse(iso).atZone(java.time.ZoneId.of("Asia/Shanghai"))
    "${t.monthValue}月${t.dayOfMonth}日 " + String.format(java.util.Locale.US, "%02d:%02d", t.hour, t.minute)
  } catch (e: Exception) {
    Regex("""\d{2}:\d{2}""").find(iso)?.value ?: ""
  }
}

/** "YYYY-MM-DD" → "M月D日" */
private fun fmtDay(s: String?): String {
  if (s.isNullOrBlank()) return ""
  val parts = s.take(10).split("-")
  return if (parts.size >= 3) "${parts[1].toIntOrNull() ?: parts[1]}月${parts[2].toIntOrNull() ?: parts[2]}日"
  else s
}

/** 相对时间（对齐 Web status.js timeAgo） */
private fun timeAgo(at: String?): String {
  if (at.isNullOrBlank()) return ""
  val t = try {
    java.time.Instant.parse(at).toEpochMilli()
  } catch (e: Exception) {
    return ""
  }
  val m = ((System.currentTimeMillis() - t) / 60000L).coerceAtLeast(0L)
  return when {
    m < 1 -> "刚刚"
    m < 60 -> "$m 分钟前"
    m / 60 < 24 -> "${m / 60} 小时前"
    else -> {
      val d = java.time.Instant.ofEpochMilli(t).atZone(java.time.ZoneId.of("Asia/Shanghai"))
      "${d.monthValue}月${d.dayOfMonth}日"
    }
  }
}
