package me.footprint.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Browser
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlin.math.abs
import kotlinx.coroutines.launch
import me.footprint.app.net.Api
import me.footprint.app.net.ApiException
import me.footprint.app.net.AiSettingsPayload
import me.footprint.app.net.BackupEntry
import me.footprint.app.net.DiaryDto
import me.footprint.app.net.Difficulty
import me.footprint.app.net.Freq
import me.footprint.app.net.LedgerItem
import me.footprint.app.net.Milestone
import me.footprint.app.net.PairStatus
import me.footprint.app.net.PointsConfig
import me.footprint.app.net.ProfileBlock
import me.footprint.app.net.ProfileChangesResponse
import me.footprint.app.net.ProfileVersionDto
import me.footprint.app.net.ProfileVersionsResponse
import me.footprint.app.net.Session
import me.footprint.app.net.StatsInner
import me.footprint.app.net.StatusPayload
import me.footprint.app.net.UserSettings
import me.footprint.app.net.UserStatus
import me.footprint.app.net.Window
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * 「我的」页（与手机端 Web me.js 全量对齐）：
 * 页头 / 资料卡（改用户名·改密码）/ 我的状态 / 这个月 / AI 日报 / 积分流水 / zoowy
 * / 画像变更 / 设置三行 / 数据与备份 / 退出 / 我的搭档 / 页脚。
 *
 * 只用基础组件（Box / Row / Column / PixelTextField），直角、2px 描边、硬投影，
 * 颜色和字号只用 PixelColors / PixelType。
 */

private val SH_ZONE: ZoneId = ZoneId.of("Asia/Shanghai")
private val LEDGER_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm")
private val CN_TIME_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("M月d日 HH:mm")

/** ISO 时间串转上海时区 "MM-dd HH:mm"；解析失败原样返回（备份列表沿用） */
private fun ledgerTime(iso: String): String {
  if (iso.isBlank()) return ""
  return try {
    Instant.parse(iso).atZone(SH_ZONE).format(LEDGER_FMT)
  } catch (e: Exception) {
    iso
  }
}

/** ISO 时间串转 "M月D日 HH:mm"（对齐 Web UI.fmtTimeIso，积分流水用） */
private fun monthDayTime(iso: String): String {
  if (iso.isBlank()) return ""
  return try {
    Instant.parse(iso).atZone(SH_ZONE).format(CN_TIME_FMT)
  } catch (e: Exception) {
    iso
  }
}

/** "2026-11-11" → "11月11日"（对齐 Web UI.fmtDate，日报标题用） */
private fun fmtDate(s: String): String {
  val p = s.split("-")
  if (p.size < 3) return s
  val m = p[1].toIntOrNull() ?: return s
  val d = p[2].take(2).toIntOrNull() ?: return s
  return "${m}月${d}日"
}

/** ISO 串截成 "YYYY-MM-DD HH:mm"（邀请码有效期 / 组内动态） */
private fun shortIso(iso: String): String =
  if (iso.length >= 16) iso.take(16).replace('T', ' ') else iso

/** 千分位（对齐 Web UI.fmtNum → Number.toLocaleString('zh-CN')） */
private fun fmtThousands(n: Int): String = String.format(Locale.US, "%,d", n)

/** 分钟转 "X.X 小时"（对齐 Web (min / 60).toFixed(1)，恒一位小数） */
private fun hoursOf(min: Int): String = String.format(Locale.US, "%.1f", min / 60.0)

/** 字节转可读大小 */
private fun sizeOf(bytes: Long): String {
  if (bytes <= 0) return "0 B"
  val kb = bytes / 1024.0
  if (kb < 1024) return String.format("%.1f KB", kb)
  val mb = kb / 1024.0
  return String.format("%.1f MB", mb)
}

/** 下载 / 全量导出：交给系统浏览器带会话打开（对齐 Web 的 <a href>） */
private fun openUrl(context: Context, url: String) {
  runCatching {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
    // 外部浏览器默认没有 fp_token；把会话 Cookie 塞进 EXTRA_HEADERS，下载才不会 401
    val token = Session.token(context)
    if (token != null) {
      val headers = Bundle()
      headers.putString("Cookie", "fp_token=$token")
      intent.putExtra(Browser.EXTRA_HEADERS, headers)
    }
    context.startActivity(intent)
  }
}

/** Double 是否有限数（挡住 "NaN" / "Infinity" 这类文本输入） */
private fun finite(v: Double): Boolean = !v.isNaN() && !v.isInfinite()

// 6 色像素徽章（对齐 Web sc-gold / wood / berry / leaf / sky / plum）
private val TONE_GOLD = Color(0xFFF5C451)
private val TONE_WOOD = Color(0xFFB07D4E)
private val TONE_BERRY = Color(0xFFD4675C)
private val TONE_LEAF = Color(0xFF5C9E47)
private val TONE_SKY = Color(0xFF6FA8C7)
private val TONE_PLUM = Color(0xFF9B6A9E)

private val PROFILE_BLOCK_ORDER = listOf("basic", "resume", "skills", "goal_progress", "important")
private val PROFILE_BLOCK_NAMES = mapOf(
  "basic" to "基本情况",
  "resume" to "简历",
  "skills" to "能力",
  "goal_progress" to "目标进展",
  "important" to "重要信息",
)

/** 积分系数「恢复默认」用的里程碑表（对齐 app/src/points.js DEFAULT_POINTS） */
private val DEFAULT_MILESTONES = listOf(
  Milestone(3, 10), Milestone(7, 25), Milestone(14, 50), Milestone(30, 120),
  Milestone(60, 300), Milestone(100, 700), Milestone(365, 3000),
)

// ---------------------------------------------------------------------------
// 页面
// ---------------------------------------------------------------------------

@Composable
fun MeScreen(vm: AppViewModel) {
  val loggedIn by vm.loggedIn.collectAsState()
  if (!loggedIn) {
    GuestMeView(vm)
    return
  }
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val mePrefs = remember { context.getSharedPreferences("footprint_me", Context.MODE_PRIVATE) }

  var showZoovy by remember { mutableStateOf(false) }
  if (showZoovy) {
    ZoovyScreen(onBack = { showZoovy = false })
    return
  }

  // ---- 页面状态 ----
  var stats by remember { mutableStateOf<StatsInner?>(null) }
  var ledger by remember { mutableStateOf<List<LedgerItem>>(emptyList()) }
  var settings by remember { mutableStateOf<PointsConfig?>(null) }
  var backups by remember { mutableStateOf<List<BackupEntry>>(emptyList()) }
  var profileChanges by remember { mutableStateOf<ProfileChangesResponse?>(null) }
  var profileVersions by remember { mutableStateOf<ProfileVersionsResponse?>(null) }
  var aiSettings by remember { mutableStateOf<UserSettings?>(null) }
  var myStatus by remember { mutableStateOf<UserStatus?>(null) }

  var diaryToday by remember { mutableStateOf<DiaryDto?>(null) }
  var diaryList by remember { mutableStateOf<List<DiaryDto>>(emptyList()) }
  var diaryLoading by remember { mutableStateOf(true) }
  var diaryReadDate by remember { mutableStateOf(mePrefs.getString("fp_diary_read", null)) }

  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  val homeError by vm.homeError.collectAsState()
  var partnerName by remember { mutableStateOf<String?>(null) }
  var myAvatar by remember { mutableStateOf("") }

  // 提示消息（改密码/备份/系数保存等一次性反馈）
  var toast by remember { mutableStateOf<String?>(null) }

  // ---- 弹层开关 ----
  var showPassword by remember { mutableStateOf(false) }
  var showUsername by remember { mutableStateOf(false) }
  var showPoints by remember { mutableStateOf(false) }
  var showDiary by remember { mutableStateOf<DiaryDto?>(null) }
  var showProfile by remember { mutableStateOf(false) }
  var showData by remember { mutableStateOf(false) }
  var showProfileChanges by remember { mutableStateOf(false) }
  var showAiSettings by remember { mutableStateOf(false) }
  var showStatusPicker by remember { mutableStateOf(false) }
  var showLogoutConfirm by remember { mutableStateOf(false) }
  var showLogoutAllConfirm by remember { mutableStateOf(false) }

  // 我的用户名（优先 vm.myName，兜底 Session.username）
  val myName by vm.myName.collectAsState()
  val username = myName.ifBlank { Session.username(context).orEmpty() }
  val pairStatus by vm.pairStatus.collectAsState()

  suspend fun loadDiary() {
    val token = Session.token(context) ?: return
    diaryLoading = true
    try {
      diaryToday = Api.getDiaryToday(token).diary
    } catch (e: Exception) {
      // 日报失败不阻塞其它模块
    }
    try {
      diaryList = Api.listDiaries(token, 7).diaries
    } catch (e: Exception) {
      // 列表失败不阻塞其它模块
    }
    diaryLoading = false
  }

  suspend fun loadAll() {
    val token = Session.token(context)
    if (token == null) {
      error = "未登录"
      loading = false
      return
    }
    loading = true
    error = null
    try {
      val s = Api.getStats(token)
      stats = s.stats
      myAvatar = s.user?.avatar.orEmpty()
    } catch (e: Exception) {
      error = e.message ?: "加载统计失败"
    }
    // 搭档用户名：getStats 不带参返回的是自己，必须走 /api/partner 拿搭档
    try {
      partnerName = Api.getPartnerPage(token).partner?.username
    } catch (e: Exception) {
      // 没搭档/失败都不阻塞其它模块
    }
    try {
      ledger = Api.getLedger(token).ledger
    } catch (e: Exception) {
      // 流水失败不阻塞其它模块
    }
    try {
      settings = Api.getSettings(token).points
    } catch (e: Exception) {
      // 系数失败不阻塞其它模块
    }
    try {
      backups = Api.listBackups(token).backups
    } catch (e: Exception) {
      // 备份失败不阻塞其它模块
    }
    try {
      profileChanges = Api.getProfileChanges(token, 5)
    } catch (e: Exception) {
      // 画像变更失败不阻塞其它模块
    }
    try {
      aiSettings = Api.getAiSettings(token)
    } catch (e: Exception) {
      // AI 设置失败不阻塞其它模块
    }
    try {
      myStatus = Api.getStatus(token).mine
    } catch (e: Exception) {
      // 状态失败不阻塞其它模块
    }
    loadDiary()
    loading = false
  }

  LaunchedEffect(Unit) {
    loadAll()
    vm.loadPair()
  }

  val doBackup: () -> Unit = {
    scope.launch {
      val token = Session.token(context) ?: return@launch
      try {
        Api.createBackup(token)
        backups = Api.listBackups(token).backups
        toast = "备份成功"
      } catch (e: Exception) {
        toast = e.message ?: "备份失败"
      }
    }
  }
  val doOpen: (String) -> Unit = { url -> openUrl(context, url) }

  Screen {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .verticalScroll(rememberScrollState())
    ) {
      // ===== 页头 =====
      PageHeader("我的", "${username.ifBlank { "我" }} 的脚印")
      Spacer(Modifier.height(12.dp))

      // ===== 顶部个人信息（改用户名 / 改密码）=====
      ProfileHeader(
        username = username.ifBlank { "我" },
        partnerName = partnerName,
        avatar = myAvatar,
        onEditName = { showUsername = true },
        onEditPassword = { showPassword = true },
      )

      Spacer(Modifier.height(16.dp))

      // ===== 我的状态（微信式，对齐 Web status.js）=====
      SectionHeader("我的状态", "对方可见")
      Spacer(Modifier.height(8.dp))
      StatusCard(mine = myStatus, onOpen = { showStatusPicker = true })

      Spacer(Modifier.height(16.dp))

      if (error != null) {
        PixelPanel(background = PixelColors.OrangeSoft, borderColor = PixelColors.OrangeDeep) {
          Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(error ?: "", style = PixelType.Small, color = PixelColors.OrangeDeep, modifier = Modifier.weight(1f))
            PixelSmallButton("重试", onClick = { scope.launch { loadAll() } }, filled = false)
          }
        }
        Spacer(Modifier.height(12.dp))
      }
      if (homeError != null) {
        PixelPanel(background = PixelColors.OrangeSoft, borderColor = PixelColors.OrangeDeep) {
          Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("😿 ${homeError ?: ""}", style = PixelType.Small, color = PixelColors.OrangeDeep, modifier = Modifier.weight(1f))
            PixelSmallButton("重试", onClick = { vm.retryHome() }, filled = false)
          }
        }
        Spacer(Modifier.height(12.dp))
      }

      // ===== 这个月（6 色像素徽章）=====
      SectionHeader("这个月")
      Spacer(Modifier.height(8.dp))
      StatsGrid(stats)

      Spacer(Modifier.height(16.dp))

      // ===== AI 日报 =====
      DiarySection(
        diary = diaryToday,
        recent = diaryList,
        loading = diaryLoading,
        readDate = diaryReadDate,
        onOpen = { d ->
          // 打开全文即记已读（本地存读过标记，对齐 Web localStorage fp_diary_read）
          mePrefs.edit().putString("fp_diary_read", d.diary_date).apply()
          diaryReadDate = d.diary_date
          showDiary = d
        },
      )

      Spacer(Modifier.height(16.dp))

      // ===== 积分流水 =====
      LedgerSection(ledger)

      Spacer(Modifier.height(16.dp))

      // ===== zoowy：聊聊 / 我的画像 =====
      SectionHeader("zoowy")
      Spacer(Modifier.height(8.dp))
      ZoowyMenu(
        onChat = { showZoovy = true },
        onProfile = { showProfile = true },
      )

      Spacer(Modifier.height(16.dp))

      // ===== 画像变更：zoowy 改了什么（打开弹层时重拉 limit=50）=====
      ProfileChangesSection(
        data = profileChanges,
        onOpen = {
          scope.launch {
            val t = Session.token(context)
            if (t != null) {
              try { profileVersions = Api.getProfileVersions(t, 20) } catch (e: Exception) { /* 忽略 */ }
              try { profileChanges = Api.getProfileChanges(t, 50) } catch (e: Exception) { /* 忽略 */ }
            }
            showProfileChanges = true
          }
        },
      )

      Spacer(Modifier.height(16.dp))

      // ===== 设置：三行带 note =====
      SectionHeader("设置")
      Spacer(Modifier.height(8.dp))
      SettingsActions(
        onAiSettings = { showAiSettings = true },
        onPoints = { showPoints = true },
        onData = { showData = true },
      )

      Spacer(Modifier.height(16.dp))

      // ===== 数据与备份 =====
      BackupSection(backups = backups, onBackup = doBackup, onOpen = doOpen)

      Spacer(Modifier.height(16.dp))

      // ===== 退出 / 登出全部设备 =====
      PixelButton(
        text = "退出登录",
        onClick = { showLogoutConfirm = true },
        modifier = Modifier.fillMaxWidth(),
      )
      Spacer(Modifier.height(8.dp))
      PixelSmallButton(
        text = "登出全部设备",
        onClick = { showLogoutAllConfirm = true },
        filled = false,
        modifier = Modifier.fillMaxWidth(),
      )

      Spacer(Modifier.height(16.dp))

      // ===== 我的搭档（邀请码配对）=====
      SectionHeader("我的搭档", "邀请 · 绑定 · 解绑")
      Spacer(Modifier.height(8.dp))
      PairCard(status = pairStatus, vm = vm, onToast = { toast = it })

      Spacer(Modifier.height(24.dp))

      // ===== 页脚 =====
      Text(
        "脚印 · 两个人互相看得见",
        style = PixelType.Small,
        color = PixelColors.Ink3,
        modifier = Modifier.align(Alignment.CenterHorizontally),
      )
      Spacer(Modifier.height(16.dp))
    }
  }

  // ---- 弹层 ----
  if (showPassword) {
    PasswordDialog(vm = vm, onDismiss = { showPassword = false }, onToast = { toast = it })
  }

  if (showUsername) {
    UsernameDialog(
      vm = vm,
      current = username,
      onDismiss = { showUsername = false },
      onToast = { toast = it },
    )
  }

  if (showPoints) {
    val cfg = settings
    if (cfg != null) {
      PointsDialog(
        initial = cfg,
        onDismiss = { showPoints = false },
        onSave = { newCfg ->
          scope.launch {
            val token = Session.token(context) ?: return@launch
            try {
              Api.updateSettings(token, newCfg)
              settings = newCfg
              showPoints = false
              toast = "积分系数已保存"
            } catch (e: Exception) {
              toast = e.message ?: "保存失败"
            }
          }
        },
      )
    }
  }

  if (showDiary != null) {
    DiarySheet(
      initial = showDiary!!,
      onDismiss = { showDiary = null },
      onChanged = { scope.launch { loadDiary() } },
      onToast = { toast = it },
    )
  }

  if (showProfile) {
    ProfileSheet(onDismiss = { showProfile = false }, onToast = { toast = it })
  }

  if (showData) {
    DataBackupDialog(
      backups = backups,
      onBackup = doBackup,
      onOpen = doOpen,
      onDismiss = { showData = false },
    )
  }

  if (showProfileChanges) {
    val d = profileChanges
    if (d != null) {
      ProfileChangesDialog(
        data = d,
        versions = profileVersions?.versions ?: emptyList(),
        onDismiss = { showProfileChanges = false },
        onChanged = { scope.launch { loadAll() } },
      )
    }
  }

  if (showAiSettings) {
    val cur = aiSettings
    if (cur != null) {
      AiSettingsDialog(
        initial = cur,
        onDismiss = { showAiSettings = false },
        onSave = { next ->
          scope.launch {
            val token = Session.token(context) ?: return@launch
            try {
              aiSettings = Api.updateAiSettings(token, next)
              showAiSettings = false
              toast = "AI 设置已保存"
            } catch (e: Exception) {
              toast = e.message ?: "保存失败"
            }
          }
        },
      )
    }
  }

  if (showStatusPicker) {
    StatusPickerDialog(
      current = myStatus,
      onDismiss = { showStatusPicker = false },
      onClear = {
        scope.launch {
          val token = Session.token(context) ?: return@launch
          try {
            Api.clearStatus(token)
            myStatus = null
            showStatusPicker = false
            toast = "状态已清除"
          } catch (e: Exception) {
            toast = e.message ?: "操作失败"
          }
        }
      },
      onSave = { payload ->
        scope.launch {
          val token = Session.token(context) ?: return@launch
          try {
            val r = Api.setStatus(token, payload)
            myStatus = r
            showStatusPicker = false
            toast = "状态已更新"
          } catch (e: Exception) {
            toast = e.message ?: "保存失败"
          }
        }
      },
    )
  }

  if (showLogoutConfirm) {
    PixelConfirmDialog(
      title = "退出登录？",
      message = "下次要用密码再进来。",
      okLabel = "退出",
      onOk = {
        showLogoutConfirm = false
        vm.logout()
        vm.showAuth("login")
      },
      onCancel = { showLogoutConfirm = false },
    )
  }

  if (showLogoutAllConfirm) {
    PixelConfirmDialog(
      title = "把其他设备也一起登出？",
      message = "所有设备都要用密码重新登录。",
      okLabel = "全部登出",
      onOk = {
        showLogoutAllConfirm = false
        scope.launch {
          val t = Session.token(context)
          if (t != null) runCatching { Api.logoutAll(t) }
          vm.logout()
          vm.showAuth("login")
        }
      },
      onCancel = { showLogoutAllConfirm = false },
    )
  }

  // ---- 提示 ----
  toast?.let { msg ->
    ToastBar(msg) { toast = null }
  }
}

// ---------------------------------------------------------------------------
// 游客视图：完整「我的」界面结构，点任何入口弹登录（对齐 Web renderGuest + UI.guestGate）
// ---------------------------------------------------------------------------

@Composable
private fun GuestMeView(vm: AppViewModel) {
  val gate: () -> Unit = { vm.showAuth("login") }
  Screen {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .verticalScroll(rememberScrollState())
    ) {
      PageHeader("我的", "登录后查看你的脚印")
      Spacer(Modifier.height(12.dp))
      PixelPanel(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
          Box(
            modifier = Modifier
              .width(56.dp)
              .height(56.dp)
              .background(PixelColors.Card)
              .pixelBorder(2.dp, PixelColors.Outline),
            contentAlignment = Alignment.Center,
          ) {
            Text("🐾", style = PixelType.Huge)
          }
          Spacer(Modifier.width(12.dp))
          Column {
            Text("游客", style = PixelType.Title, color = PixelColors.Ink)
            Spacer(Modifier.height(4.dp))
            Text("登录后和对方互相监督", style = PixelType.Small, color = PixelColors.Ink3)
          }
        }
      }
      Spacer(Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.weight(1f)) {
          PixelSmallButton("改用户名", onClick = gate, filled = false, modifier = Modifier.fillMaxWidth())
        }
        Box(Modifier.weight(1f)) {
          PixelSmallButton("改密码", onClick = gate, filled = false, modifier = Modifier.fillMaxWidth())
        }
      }
      Spacer(Modifier.height(12.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        PixelButton(text = "登录", onClick = gate)
        PixelSmallButton(text = "注册", onClick = { vm.showAuth("register") }, filled = false)
      }

      Spacer(Modifier.height(16.dp))
      SectionHeader("这个月")
      Spacer(Modifier.height(8.dp))
      StatsGrid(null)

      Spacer(Modifier.height(16.dp))
      SectionHeader("zoowy")
      Spacer(Modifier.height(8.dp))
      ZoowyMenu(onChat = gate, onProfile = gate)

      Spacer(Modifier.height(16.dp))
      SectionHeader("设置")
      Spacer(Modifier.height(8.dp))
      SettingsActions(onAiSettings = gate, onPoints = gate, onData = gate)

      Spacer(Modifier.height(16.dp))
      SectionHeader("我的搭档", "邀请 · 绑定 · 解绑")
      Spacer(Modifier.height(8.dp))
      PixelPanel(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 16.dp)) {
          MenuRow("🤝", "配对 / 邀请码", "登录后可见", gate)
        }
      }

      Spacer(Modifier.height(24.dp))
      Text(
        "脚印 · 两个人互相看得见",
        style = PixelType.Small,
        color = PixelColors.Ink3,
        modifier = Modifier.align(Alignment.CenterHorizontally),
      )
      Spacer(Modifier.height(16.dp))
    }
  }
}

// ---------------------------------------------------------------------------
// 通用小件：页头 / 区块标题 / 菜单行
// ---------------------------------------------------------------------------

@Composable
private fun PageHeader(title: String, sub: String) {
  Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
    Text(title, style = PixelType.Big, color = PixelColors.Ink)
    Text(sub, style = PixelType.Small, color = PixelColors.Ink3)
  }
}

@Composable
private fun SectionHeader(title: String, note: String? = null) {
  Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
    Text(title, style = PixelType.Title, color = PixelColors.Ink)
    Spacer(Modifier.weight(1f))
    if (note != null) {
      Text(note, style = PixelType.Small, color = PixelColors.Ink3)
    }
  }
}

@Composable
private fun MenuRow(icon: String, label: String, note: String, onClick: () -> Unit) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onClick)
      .padding(vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(icon, style = PixelType.Title)
    Spacer(Modifier.width(12.dp))
    Column(Modifier.weight(1f)) {
      Text(label, style = PixelType.Body, color = PixelColors.Ink)
      Text(note, style = PixelType.Small, color = PixelColors.Ink3)
    }
    Text("›", style = PixelType.Title, color = PixelColors.Ink2)
  }
}

// ---------------------------------------------------------------------------
// 各区块组件
// ---------------------------------------------------------------------------

/** 顶部个人信息：用户名 + 头像框 + 搭档监督文案 + 改用户名 / 改密码 */
@Composable
private fun ProfileHeader(
  username: String,
  partnerName: String?,
  avatar: String,
  onEditName: () -> Unit,
  onEditPassword: () -> Unit,
) {
  PixelPanel(Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        // 头像：后端返回的 avatar emoji（与 Web 一致），空则首字
        Box(
          modifier = Modifier
            .width(56.dp)
            .height(56.dp)
            .background(PixelColors.Card)
            .pixelBorder(2.dp, PixelColors.Outline),
          contentAlignment = Alignment.Center,
        ) {
          Text(
            text = avatar.ifBlank { username.take(1).ifBlank { "我" } },
            style = PixelType.Huge,
          )
        }
        Spacer(Modifier.width(12.dp))
        Column {
          Text(username, style = PixelType.Title, color = PixelColors.Ink)
          Spacer(Modifier.height(4.dp))
          Text(
            text = if (partnerName.isNullOrBlank()) "还没有搭档" else "和 $partnerName 互相监督中",
            style = PixelType.Small,
            color = PixelColors.Ink3,
          )
        }
      }
      Spacer(Modifier.height(12.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.weight(1f)) {
          PixelSmallButton("改用户名", onClick = onEditName, filled = false, modifier = Modifier.fillMaxWidth())
        }
        Box(Modifier.weight(1f)) {
          PixelSmallButton("改密码", onClick = onEditPassword, filled = false, modifier = Modifier.fillMaxWidth())
        }
      }
    }
  }
}

/** 我的状态卡（对齐 Web status.js mineChip） */
@Composable
private fun StatusCard(mine: UserStatus?, onOpen: () -> Unit) {
  PixelPanel(Modifier.fillMaxWidth()) {
    Row(
      modifier = Modifier
        .padding(12.dp)
        .clickable(onClick = onOpen),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(
        text = mine?.emoji ?: "💭",
        style = PixelType.Title,
        color = PixelColors.Ink,
      )
      Spacer(Modifier.width(10.dp))
      Column(Modifier.weight(1f)) {
        Text(
          text = mine?.label ?: "＋ 设个状态",
          style = PixelType.Body,
          color = PixelColors.Ink,
        )
        Text(
          text = mine?.text?.takeIf { it.isNotBlank() } ?: if (mine == null) "对方在「我们」页能看到" else "点一下换个状态",
          style = PixelType.Small,
          color = PixelColors.Ink3,
        )
      }
      Spacer(Modifier.width(8.dp))
      Text("›", style = PixelType.Title, color = PixelColors.Ink2)
    }
  }
}

/** 状态选择弹层（对齐 Web status.js open()：4 组图标 + 一句话） */
@Composable
private fun StatusPickerDialog(
  current: UserStatus?,
  onDismiss: () -> Unit,
  onClear: () -> Unit,
  onSave: (StatusPayload) -> Unit,
) {
  val groups = listOf(
    StatusGroup("心情想法", listOf(
      StatusItem("美滋滋", "😊"), StatusItem("裂开", "😵"), StatusItem("求安慰", "🥺"),
      StatusItem("等天晴", "🌤️"), StatusItem("疲惫", "😮‍💨"), StatusItem("发呆", "🫥"),
      StatusItem("冲", "💪"), StatusItem("emo", "😢"), StatusItem("胡思乱想", "💭"),
      StatusItem("元气满满", "✨"), StatusItem("bot", "🤖"),
    )),
    StatusGroup("工作学习", listOf(
      StatusItem("搬砖", "🧱"), StatusItem("沉迷学习", "📚"), StatusItem("忙", "🏃"),
      StatusItem("摸鱼", "🐟"), StatusItem("出差", "✈️"), StatusItem("飞奔回家", "🏠"),
      StatusItem("勿扰模式", "🌙"),
    )),
    StatusGroup("活动", listOf(
      StatusItem("浪", "🌊"), StatusItem("打卡", "✅"), StatusItem("运动", "🏃‍♀️"),
      StatusItem("喝咖啡", "☕"), StatusItem("喝奶茶", "🧋"), StatusItem("干饭", "🍚"),
      StatusItem("带娃", "🧸"), StatusItem("拯救世界", "🦸"), StatusItem("自拍", "🤳"),
    )),
    StatusGroup("休息", listOf(
      StatusItem("闭关", "🚪"), StatusItem("宅", "🛋️"), StatusItem("睡觉", "😴"),
      StatusItem("吸猫", "🐱"), StatusItem("遛狗", "🐶"), StatusItem("玩游戏", "🎮"),
      StatusItem("听歌", "🎧"), StatusItem("未知", "❓"),
    )),
  )
  var sel by remember { mutableStateOf<StatusItem?>(current?.let { c -> StatusItem(c.label, c.emoji) }) }
  var text by remember { mutableStateOf(current?.text ?: "") }

  Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Box(
      modifier = Modifier
        .fillMaxSize()
        .padding(16.dp),
      contentAlignment = Alignment.Center,
    ) {
      PixelPanel(Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
          Text("设个状态", style = PixelType.Title, color = PixelColors.Ink)
          Spacer(Modifier.height(12.dp))

          // 可滚动区：预览 + 输入 + 分组图标
          Column(
            modifier = Modifier
              .weight(1f, fill = false)
              .verticalScroll(rememberScrollState()),
          ) {
            // 预览
            PixelPanel(background = PixelColors.Bg2, borderColor = PixelColors.LineStrong) {
              Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(sel?.emoji ?: "💭", style = PixelType.Huge)
                Spacer(Modifier.width(10.dp))
                Column {
                  Text(sel?.label ?: "还没选状态", style = PixelType.Body, color = PixelColors.Ink)
                  Text(
                    text = text.ifBlank { "从下面挑一个，或写点什么" },
                    style = PixelType.Small,
                    color = PixelColors.Ink3,
                  )
                }
              }
            }
            Spacer(Modifier.height(12.dp))

            // 一句话
            Text("说点什么（可不填，最多 40 字）", style = PixelType.Small, color = PixelColors.Ink2)
            PixelTextField(
              value = text,
              onValueChange = { if (it.length <= 40) text = it },
              placeholder = "比如：今天也在努力搬砖",
              modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))

            // 分组图标
            groups.forEach { g ->
              Text(g.name, style = PixelType.Small, color = PixelColors.Ink2)
              Spacer(Modifier.height(6.dp))
              g.items.chunked(5).forEach { rowItems ->
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                  rowItems.forEach { item ->
                    val on = sel?.label == item.label
                    Column(
                      modifier = Modifier
                        .weight(1f)
                        .clickable { sel = item }
                        .padding(vertical = 6.dp),
                      horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                      Box(
                        modifier = Modifier
                          .background(if (on) PixelColors.GreenSoft else PixelColors.Card)
                          .pixelBorder(2.dp, if (on) PixelColors.GreenDeep else PixelColors.Outline)
                          .padding(4.dp),
                      ) {
                        Text(item.emoji, style = PixelType.Body)
                      }
                      Spacer(Modifier.height(2.dp))
                      Text(
                        item.label,
                        style = PixelType.Small,
                        color = if (on) PixelColors.GreenDeep else PixelColors.Ink2,
                      )
                    }
                  }
                  repeat(5 - rowItems.size) { Spacer(Modifier.weight(1f)) }
                }
              }
              Spacer(Modifier.height(10.dp))
            }
          }

          Spacer(Modifier.height(8.dp))
          // 底部固定按钮
          Row(Modifier.fillMaxWidth()) {
            PixelButton(text = "清除状态", onClick = onClear, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            PixelButton(
              text = "就这样",
              onClick = {
                val s = sel
                if (s != null) {
                  onSave(StatusPayload(key = s.label, emoji = s.emoji, label = s.label, text = text.trim()))
                }
              },
              modifier = Modifier.weight(1f),
            )
          }
        }
      }
    }
  }
}

private data class StatusGroup(val name: String, val items: List<StatusItem>)
private data class StatusItem(val label: String, val emoji: String)

/** 统计卡片：2 列网格 + 6 色像素徽章；口径直接取后端字段，不在本地整除 */
@Composable
private fun StatsGrid(stats: StatsInner?) {
  val cells = if (stats == null) {
    listOf(
      StatSpec("本月得分", "—", "🪙", TONE_GOLD, PixelColors.GreenSoft),
      StatSpec("当前余额", "—", "👛", TONE_WOOD, PixelColors.OrangeSoft),
      StatSpec("最长连续", "—", "🔥", TONE_BERRY, PixelColors.OrangeSoft),
      StatSpec("本月完成率", "—", "🎯", TONE_LEAF, PixelColors.GreenSoft),
      StatSpec("时间投入", "—", "⏳", TONE_SKY, PixelColors.Line),
      StatSpec("被质疑次数", "—", "🔍", TONE_PLUM, PixelColors.OrangeSoft),
    )
  } else {
    val completion = stats.completion?.let { "$it%" } ?: "—"
    listOf(
      StatSpec("本月得分", "+${fmtThousands(stats.monthPoints)}", "🪙", TONE_GOLD, PixelColors.GreenSoft),
      StatSpec("当前余额", fmtThousands(stats.balance), "👛", TONE_WOOD, PixelColors.OrangeSoft),
      StatSpec("最长连续", "${stats.bestStreak} 天", "🔥", TONE_BERRY, PixelColors.OrangeSoft),
      StatSpec("本月完成率", completion, "🎯", TONE_LEAF, PixelColors.GreenSoft),
      StatSpec("时间投入", "${hoursOf(stats.timeInvestMin)} 小时", "⏳", TONE_SKY, PixelColors.Line),
      StatSpec("被质疑次数", fmtThousands(stats.rejectedCount), "🔍", TONE_PLUM, PixelColors.OrangeSoft),
    )
  }
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    cells.chunked(2).forEach { row ->
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        row.forEach { spec -> Box(Modifier.weight(1f)) { StatCell(spec) } }
        if (row.size == 1) Spacer(Modifier.weight(1f))
      }
    }
  }
}

/** 统计小卡的静态描述（label / value / 像素徽章 emoji / 徽章底色 / 卡片底色） */
private data class StatSpec(
  val label: String,
  val value: String,
  val badge: String,
  val tone: Color,
  val bg: Color,
)

/** 单个统计小卡（对齐 Web .stat-cell）：暖白底 + 左侧 5dp 专属色条 + 24sp 等宽大数字 + 标签 */
@Composable
private fun StatCell(spec: StatSpec) {
  Box(
    modifier = Modifier
      .fillMaxWidth()
      .heightIn(min = 104.dp)
      .pixelHardShadow(3.dp, PixelColors.WoodDark)
      .background(PixelColors.Card)
      .drawBehind {
        // Web: box-shadow: inset 4px 0 0 var(--sc-tone) —— 左边一条专属色
        drawRect(spec.tone, size = Size(5.dp.toPx(), size.height))
      }
      .pixelBorder(2.dp, PixelColors.LineStrong)
      .padding(start = 15.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
  ) {
    Column {
      Box(
        modifier = Modifier
          .size(32.dp)
          .background(spec.tone)
          .pixelBorder(2.dp, PixelColors.Outline),
        contentAlignment = Alignment.Center,
      ) {
        Text(spec.badge, style = PixelType.Body)
      }
      Spacer(Modifier.height(8.dp))
      Text(
        text = spec.value,
        style = PixelType.BigMono,
        color = PixelColors.Ink,
        maxLines = 1,
        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
      )
      Spacer(Modifier.height(2.dp))
      Text(spec.label, style = PixelType.Small, color = PixelColors.Ink3)
    }
  }
}

/** 积分流水默认只露最近几条，点「展开全部」看完整（与 Web loadLedger 折叠一致） */
private const val LEDGER_COLLAPSED = 5

/** 积分流水：可折叠列表（默认收起，展开后看全部） */
@Composable
private fun LedgerSection(ledger: List<LedgerItem>) {
  var expanded by remember { mutableStateOf(false) }
  val shown = if (expanded) ledger else ledger.take(LEDGER_COLLAPSED)
  PixelPanel(Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp)) {
      Text("积分流水", style = PixelType.Title, color = PixelColors.Ink)
      Spacer(Modifier.height(12.dp))
      if (ledger.isEmpty()) {
        Text("还没有流水，去打第一张卡吧", style = PixelType.Small, color = PixelColors.Ink3)
      } else {
        shown.forEachIndexed { i, item ->
          LedgerRow(item)
          if (i != shown.lastIndex) {
            Spacer(Modifier.height(10.dp))
            Box(Modifier.fillMaxWidth().height(2.dp).background(PixelColors.Line))
            Spacer(Modifier.height(10.dp))
          }
        }
        if (ledger.size > LEDGER_COLLAPSED) {
          Spacer(Modifier.height(10.dp))
          Box(Modifier.fillMaxWidth().height(2.dp).background(PixelColors.Line))
          Spacer(Modifier.height(10.dp))
          PixelSmallButton(
            text = if (expanded) "收起 ▴" else "展开全部 ${ledger.size} 条 ▾",
            onClick = { expanded = !expanded },
            filled = false,
            modifier = Modifier.fillMaxWidth(),
          )
        }
      }
    }
  }
}

/** 单条流水：typeLabel · note 一行、时间「M月D日 HH:mm」、delta 0→「—」/ 负→「−」+千分位 */
@Composable
private fun LedgerRow(item: LedgerItem) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) {
      val type = item.typeLabel.ifBlank { item.type }
      Text(
        text = if (item.note.isBlank()) type else "$type · ${item.note}",
        style = PixelType.Small,
        color = PixelColors.Ink2,
        maxLines = 1,
      )
      Spacer(Modifier.height(2.dp))
      Text(monthDayTime(item.created_at), style = PixelType.Small, color = PixelColors.Ink3)
    }
    Spacer(Modifier.width(8.dp))
    val delta = item.delta
    val sign = when {
      delta == 0 -> "—"
      delta > 0 -> "+"
      else -> "−"
    }
    val num = if (delta == 0) "" else fmtThousands(abs(delta))
    Text(
      text = sign + num,
      style = PixelType.Mono,
      color = if (delta >= 0) PixelColors.Green else PixelColors.Red,
    )
  }
}

/** 设置菜单三行（带 note），对齐 Web me.js 的 menu-list */
@Composable
private fun SettingsActions(onAiSettings: () -> Unit, onPoints: () -> Unit, onData: () -> Unit) {
  PixelPanel(Modifier.fillMaxWidth()) {
    Column(Modifier.padding(horizontal = 16.dp)) {
      MenuRow("🐾", "AI 设置", "汇报与日报", onAiSettings)
      Box(Modifier.fillMaxWidth().height(2.dp).background(PixelColors.Line))
      MenuRow("⚙️", "积分系数", "规则可调", onPoints)
      Box(Modifier.fillMaxWidth().height(2.dp).background(PixelColors.Line))
      MenuRow("📄", "数据与备份", "导出 · 快照", onData)
    }
  }
}

/** zoowy 区两行：聊天 + 我的画像（仅自己可见） */
@Composable
private fun ZoowyMenu(onChat: () -> Unit, onProfile: () -> Unit) {
  PixelPanel(Modifier.fillMaxWidth()) {
    Column(Modifier.padding(horizontal = 16.dp)) {
      MenuRow("🐾", "和 zoowy 聊聊", "知道你的目标与打卡", onChat)
      Box(Modifier.fillMaxWidth().height(2.dp).background(PixelColors.Line))
      MenuRow("🧾", "我的画像", "仅自己可见", onProfile)
    }
  }
}

/** 数据与备份主体：每日快照 / 下载 / 全量导出 / 灾难恢复三步 */
@Composable
private fun DataBackupBody(
  backups: List<BackupEntry>,
  onBackup: () -> Unit,
  onOpen: (String) -> Unit,
) {
  Column {
    Text("每日自动快照（凌晨 3 点，保留 30 天）", style = PixelType.Small, color = PixelColors.Ink2)
    Spacer(Modifier.height(8.dp))
    PixelSmallButton("立即快照一份", onClick = onBackup, filled = false)
    Spacer(Modifier.height(12.dp))
    if (backups.isEmpty()) {
      Text("还没有快照，启动时会自动生成第一份", style = PixelType.Small, color = PixelColors.Ink3)
    } else {
      backups.forEachIndexed { i, b ->
        Row(verticalAlignment = Alignment.CenterVertically) {
          Column(Modifier.weight(1f)) {
            Text(b.name, style = PixelType.Body, color = PixelColors.Ink, maxLines = 1)
            Spacer(Modifier.height(2.dp))
            Text(
              "${ledgerTime(b.mtime)} · ${sizeOf(b.size)}",
              style = PixelType.Small,
              color = PixelColors.Ink3,
            )
          }
          Spacer(Modifier.width(8.dp))
          PixelSmallButton("下载", onClick = { onOpen(Api.backupUrl(b.name)) }, filled = false)
        }
        if (i != backups.lastIndex) {
          Spacer(Modifier.height(8.dp))
          Box(Modifier.fillMaxWidth().height(2.dp).background(PixelColors.Line))
          Spacer(Modifier.height(8.dp))
        }
      }
    }
    Spacer(Modifier.height(14.dp))
    Text("全量导出（JSON + 各表 CSV，一个 zip）", style = PixelType.Small, color = PixelColors.Ink2)
    Spacer(Modifier.height(8.dp))
    PixelSmallButton("导出数据", onClick = { onOpen(Api.exportUrl()) }, filled = false)
    Spacer(Modifier.height(14.dp))
    Text("灾难恢复（三步）", style = PixelType.Small, color = PixelColors.Ink2)
    Spacer(Modifier.height(6.dp))
    Text("1. 在新机器上 npm install && npm start 把服务跑起来", style = PixelType.Small, color = PixelColors.Ink3)
    Text("2. 把导出的 zip 里的 data.json 传上去", style = PixelType.Small, color = PixelColors.Ink3)
    Text("3. 执行 node scripts/restore.js data.json", style = PixelType.Small, color = PixelColors.Ink3)
    Spacer(Modifier.height(6.dp))
    Text(
      "恢复前会自动给当前库做一份快照；忘记密码用 node scripts/reset-password.js 用户名。",
      style = PixelType.Small,
      color = PixelColors.Ink3,
    )
  }
}

/** 备份列表 + 立即备份（页面内联区块，标题「数据与备份」） */
@Composable
private fun BackupSection(
  backups: List<BackupEntry>,
  onBackup: () -> Unit,
  onOpen: (String) -> Unit,
) {
  PixelPanel(Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp)) {
      Text("数据与备份", style = PixelType.Title, color = PixelColors.Ink)
      Spacer(Modifier.height(12.dp))
      DataBackupBody(backups = backups, onBackup = onBackup, onOpen = onOpen)
    }
  }
}

/** 设置菜单「数据与备份」点开的弹层（与内联区块复用同一主体） */
@Composable
private fun DataBackupDialog(
  backups: List<BackupEntry>,
  onBackup: () -> Unit,
  onOpen: (String) -> Unit,
  onDismiss: () -> Unit,
) {
  Overlay {
    PixelPanel(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(
        Modifier
          .padding(16.dp)
          .heightIn(max = 520.dp)
          .verticalScroll(rememberScrollState())
      ) {
        Text("数据与备份", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(12.dp))
        DataBackupBody(backups = backups, onBackup = onBackup, onOpen = onOpen)
        Spacer(Modifier.height(16.dp))
        PixelButton(text = "关闭", onClick = onDismiss, modifier = Modifier.fillMaxWidth())
      }
    }
  }
}

/** 底部浮动的提示条 */
@Composable
private fun ToastBar(message: String, onDismiss: () -> Unit) {
  Box(
    modifier = Modifier
      .fillMaxWidth()
      .padding(16.dp),
  ) {
    PixelPanel(background = PixelColors.Ink, borderColor = PixelColors.Ink) {
      Row(
        Modifier.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(message, style = PixelType.Body, color = PixelColors.White, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(8.dp))
        PixelSmallButton("知道了", onClick = onDismiss, filled = true)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// AI 日报：区块 + 全文弹层
// ---------------------------------------------------------------------------

/** 「AI 日报」区块：未读红点 + 80 字预览 + 看全文；空态对齐 Web */
@Composable
private fun DiarySection(
  diary: DiaryDto?,
  recent: List<DiaryDto>,
  loading: Boolean,
  readDate: String?,
  onOpen: (DiaryDto) -> Unit,
) {
  PixelPanel(Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text("AI 日报", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.width(8.dp))
        if (diary != null && readDate != diary.diary_date) {
          Text("● 有新的", style = PixelType.Small, color = PixelColors.OrangeDeep)
        }
      }
      Spacer(Modifier.height(10.dp))
      val d = diary
      if (loading) {
        Text("加载中…", style = PixelType.Small, color = PixelColors.Ink3)
      } else if (d == null) {
        Text(
          "今天的日报 23:30 由 zoowy 生成，到时候来看。",
          style = PixelType.Small,
          color = PixelColors.Ink3,
        )
      } else {
        Text(
          "${fmtDate(d.diary_date)}${if (d.edited) " · 已改过" else ""}",
          style = PixelType.Small,
          color = PixelColors.Ink3,
        )
        Spacer(Modifier.height(4.dp))
        Text(
          text = d.content.take(80) + if (d.content.length > 80) "…" else "",
          style = PixelType.Body,
          color = PixelColors.Ink,
        )
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
          PixelSmallButton("看全文", onClick = { onOpen(d) })
          if (d.shared) {
            Spacer(Modifier.width(8.dp))
            PixelChip("已分享给对方", bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
          }
        }
      }
      // 最近几天：Api.listDiaries(token, 7) 拉到的历史日报，点开同样进全文弹层
      val others = recent.filter { it.diary_date != d?.diary_date }.take(7)
      if (others.isNotEmpty()) {
        Spacer(Modifier.height(12.dp))
        Text("最近几天", style = PixelType.Small, color = PixelColors.Ink2)
        Spacer(Modifier.height(6.dp))
        others.forEach { item ->
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
              "${fmtDate(item.diary_date)}${if (item.edited) " · 已改过" else ""}${if (item.shared) " · 已分享" else ""}",
              style = PixelType.Small,
              color = PixelColors.Ink2,
              modifier = Modifier.weight(1f),
            )
            PixelSmallButton("看全文", onClick = { onOpen(item) }, filled = false)
          }
          Spacer(Modifier.height(6.dp))
        }
      }
    }
  }
}

/** 日报全文：查看 / 修改（再改改）/ 分享给对方 / 取消分享 / 保存 */
@Composable
private fun DiarySheet(
  initial: DiaryDto,
  onDismiss: () -> Unit,
  onChanged: () -> Unit,
  onToast: (String) -> Unit,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var diary by remember { mutableStateOf(initial) }
  var text by remember { mutableStateOf(initial.content) }
  var editing by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var err by remember { mutableStateOf<String?>(null) }

  Overlay {
    PixelPanel(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(
        Modifier
          .padding(16.dp)
          .heightIn(max = 520.dp)
          .verticalScroll(rememberScrollState())
      ) {
        Text("${fmtDate(diary.diary_date)} 的日报", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(12.dp))
        if (editing) {
          PixelTextArea(
            value = text,
            onValueChange = { text = it },
            placeholder = "写点什么",
            modifier = Modifier.fillMaxWidth(),
            minLines = 8,
          )
        } else {
          Text(diary.content, style = PixelType.Body, color = PixelColors.Ink)
        }
        Spacer(Modifier.height(8.dp))
        Text(
          "改过的版本会盖在 AI 原文上（原文保留）；明天生成新日报不会回改这篇。想写「每日反思」就直接补在后面。",
          style = PixelType.Small,
          color = PixelColors.Ink3,
        )
        err?.let {
          Spacer(Modifier.height(8.dp))
          Text(it, style = PixelType.Small, color = PixelColors.Red)
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Box(Modifier.weight(1f)) {
            PixelSmallButton(
              text = if (diary.edited) "再改改" else "修改",
              onClick = { editing = true },
              filled = false,
              modifier = Modifier.fillMaxWidth(),
            )
          }
          Box(Modifier.weight(1f)) {
            PixelSmallButton(
              text = if (diary.shared) "取消分享" else "分享给对方",
              onClick = {
                if (busy) return@PixelSmallButton
                busy = true
                scope.launch {
                  val token = Session.token(context)
                  if (token == null) {
                    busy = false
                    err = "未登录"
                    return@launch
                  }
                  try {
                    Api.shareDiary(token, diary.diary_date, !diary.shared)
                    busy = false
                    onToast(if (diary.shared) "已取消分享" else "已分享，对方在「我们」页能看到摘要")
                    onChanged()
                    onDismiss()
                  } catch (e: Exception) {
                    busy = false
                    err = e.message ?: "操作失败"
                  }
                }
              },
              filled = false,
              modifier = Modifier.fillMaxWidth(),
            )
          }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Box(Modifier.weight(1f)) {
            PixelSmallButton("关闭", onClick = onDismiss, filled = false, modifier = Modifier.fillMaxWidth())
          }
          Box(Modifier.weight(1f)) {
            PixelSmallButton(
              text = "保存",
              onClick = {
                if (!editing) {
                  onDismiss()
                  return@PixelSmallButton
                }
                val t = text.trim()
                if (t.isEmpty()) {
                  err = "内容不能为空"
                  return@PixelSmallButton
                }
                if (busy) return@PixelSmallButton
                busy = true
                scope.launch {
                  val token = Session.token(context)
                  if (token == null) {
                    busy = false
                    err = "未登录"
                    return@launch
                  }
                  try {
                    val r = Api.editDiary(token, diary.diary_date, t)
                    diary = r.diary
                    text = r.diary.content
                    busy = false
                    onToast("已保存")
                    onChanged()
                    onDismiss()
                  } catch (e: Exception) {
                    busy = false
                    err = e.message ?: "保存失败"
                  }
                }
              },
              modifier = Modifier.fillMaxWidth(),
            )
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 弹层：改用户名 / 改密码 / 积分系数 / 我的画像
// ---------------------------------------------------------------------------

/** 改用户名弹层（仿 PasswordDialog，对齐 Web changeUsername） */
@Composable
private fun UsernameDialog(
  vm: AppViewModel,
  current: String,
  onDismiss: () -> Unit,
  onToast: (String) -> Unit,
) {
  var name by remember { mutableStateOf(current) }
  var busy by remember { mutableStateOf(false) }
  var err by remember { mutableStateOf<String?>(null) }

  Overlay {
    PixelPanel(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
      Column(Modifier.padding(16.dp)) {
        Text("修改用户名", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(12.dp))
        PixelTextField(
          value = name,
          onValueChange = { if (it.length <= 30) { name = it; err = null } },
          placeholder = "新用户名（最多 30 字）",
          modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        Text("改完对方看到的名字和登录用的名字都会变。", style = PixelType.Small, color = PixelColors.Ink3)
        err?.let {
          Spacer(Modifier.height(8.dp))
          Text(it, style = PixelType.Small, color = PixelColors.Red)
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Box(Modifier.weight(1f)) {
            PixelButton("取消", onClick = onDismiss, modifier = Modifier.fillMaxWidth(), enabled = !busy)
          }
          Box(Modifier.weight(1f)) {
            PixelButton(
              "改用户名",
              onClick = {
                val n = name.trim()
                if (n.isEmpty()) {
                  err = "用户名不能为空"
                  return@PixelButton
                }
                if (busy) return@PixelButton
                busy = true
                vm.updateUsername(n) { e ->
                  busy = false
                  if (e == null) {
                    onDismiss()
                    onToast("用户名已改")
                  } else {
                    err = e
                  }
                }
              },
              modifier = Modifier.fillMaxWidth(),
              enabled = !busy,
            )
          }
        }
      }
    }
  }
}

/** 改密码弹层：最少 8 位（后端 PW_MIN=8）+ 再输一遍；成功后重新登录 */
@Composable
private fun PasswordDialog(vm: AppViewModel, onDismiss: () -> Unit, onToast: (String) -> Unit) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var oldPwd by remember { mutableStateOf("") }
  var newPwd by remember { mutableStateOf("") }
  var newPwd2 by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var err by remember { mutableStateOf<String?>(null) }

  Overlay {
    PixelPanel(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
      Column(Modifier.padding(16.dp)) {
        Text("修改密码", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(12.dp))
        PixelTextField(
          value = oldPwd,
          onValueChange = { oldPwd = it; err = null },
          placeholder = "现在的密码",
          modifier = Modifier.fillMaxWidth(),
          isPassword = true,
        )
        Spacer(Modifier.height(8.dp))
        PixelTextField(
          value = newPwd,
          onValueChange = { newPwd = it; err = null },
          placeholder = "新密码（至少 8 位）",
          modifier = Modifier.fillMaxWidth(),
          isPassword = true,
        )
        Spacer(Modifier.height(8.dp))
        PixelTextField(
          value = newPwd2,
          onValueChange = { newPwd2 = it; err = null },
          placeholder = "再输一遍新密码",
          modifier = Modifier.fillMaxWidth(),
          isPassword = true,
        )
        Spacer(Modifier.height(8.dp))
        Text(
          "改完所有设备会登出，用新密码重新登录。忘了密码就用部署者的 reset-password 命令。",
          style = PixelType.Small,
          color = PixelColors.Ink3,
        )
        err?.let {
          Spacer(Modifier.height(8.dp))
          Text(it, style = PixelType.Small, color = PixelColors.Red)
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Box(Modifier.weight(1f)) {
            PixelButton("取消", onClick = onDismiss, modifier = Modifier.fillMaxWidth(), enabled = !busy)
          }
          Box(Modifier.weight(1f)) {
            PixelButton(
              "改密码",
              onClick = {
                if (oldPwd.isBlank() || newPwd.isBlank()) {
                  err = "旧密码和新密码都要填"
                  return@PixelButton
                }
                if (newPwd.length < 8) {
                  err = "新密码至少 8 位"
                  return@PixelButton
                }
                if (newPwd != newPwd2) {
                  err = "两次新密码不一样"
                  return@PixelButton
                }
                if (busy) return@PixelButton
                busy = true
                scope.launch {
                  val token = Session.token(context)
                  if (token == null) {
                    busy = false
                    err = "未登录"
                    return@launch
                  }
                  try {
                    Api.changePassword(token, oldPwd, newPwd)
                    // 后端改密会销毁全部会话；再显式通知一次服务端，失败也不阻塞本地清理
                    Api.logout(token)
                    busy = false
                    onDismiss()
                    onToast("密码已改，重新登录一次")
                    vm.logout()
                    vm.showAuth("login")
                  } catch (e: ApiException) {
                    busy = false
                    err = e.message ?: "修改失败"
                  } catch (e: Exception) {
                    busy = false
                    err = e.message ?: "修改失败"
                  }
                }
              },
              modifier = Modifier.fillMaxWidth(),
              enabled = !busy,
            )
          }
        }
      }
    }
  }
}

/** 积分系数弹层：全部键值 + 里程碑编辑区 + 恢复默认，一次保存 */
@Composable
private fun PointsDialog(
  initial: PointsConfig,
  onDismiss: () -> Unit,
  onSave: (PointsConfig) -> Unit,
) {
  // 本地可编辑副本（用字符串承载输入）
  var unit by remember { mutableStateOf(fmtNum(initial.unit)) }
  var cap by remember { mutableStateOf(initial.cap.toString()) }
  var maxPer by remember { mutableStateOf(initial.maxPer.toString()) }
  var d1 by remember { mutableStateOf(fmtNum(initial.difficulty.`1`)) }
  var d2 by remember { mutableStateOf(fmtNum(initial.difficulty.`2`)) }
  var d3 by remember { mutableStateOf(fmtNum(initial.difficulty.`3`)) }
  var d4 by remember { mutableStateOf(fmtNum(initial.difficulty.`4`)) }
  var d5 by remember { mutableStateOf(fmtNum(initial.difficulty.`5`)) }
  var fDaily by remember { mutableStateOf(fmtNum(initial.freq.daily)) }
  var f34 by remember { mutableStateOf(fmtNum(initial.freq.weekly34)) }
  var f12 by remember { mutableStateOf(fmtNum(initial.freq.weekly12)) }
  var fWd by remember { mutableStateOf(fmtNum(initial.freq.weekdays)) }
  var wIn by remember { mutableStateOf(fmtNum(initial.window.`in`)) }
  var wNone by remember { mutableStateOf(fmtNum(initial.window.none)) }
  var wOut by remember { mutableStateOf(fmtNum(initial.window.out)) }
  // 里程碑编辑区：编辑器用字符串对 (n, p)；没动过就原样回传 initial.milestones
  var msRows by remember {
    mutableStateOf(initial.milestones.map { it.n.toString() to it.p.toString() })
  }
  var confirmRestore by remember { mutableStateOf(false) }
  var err by remember { mutableStateOf<String?>(null) }

  Overlay {
    PixelPanel(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(
        Modifier
          .padding(16.dp)
          .height(480.dp)
          .verticalScroll(rememberScrollState())
      ) {
        Text("积分系数", style = PixelType.Title, color = PixelColors.Ink)
        Text("这些系数两个人共用，改完立即生效。拿不准就点「恢复默认」。", style = PixelType.Small, color = PixelColors.Ink3)
        Spacer(Modifier.height(12.dp))

        NumField("基础分单价（分/分钟）", unit) { unit = it }
        NumField("单次基础分封顶", cap) { cap = it }
        NumField("单次积分硬上限", maxPer) { maxPer = it }
        Spacer(Modifier.height(8.dp))
        Text("难度系数（1–5 级）", style = PixelType.Small, color = PixelColors.Ink3)
        NumField("难度 1 · 几乎无门槛", d1) { d1 = it }
        NumField("难度 2 · 稍微用点力", d2) { d2 = it }
        NumField("难度 3 · 需要腾时间", d3) { d3 = it }
        NumField("难度 4 · 比较难", d4) { d4 = it }
        NumField("难度 5 · 长期投入", d5) { d5 = it }
        Spacer(Modifier.height(8.dp))
        Text("频率系数", style = PixelType.Small, color = PixelColors.Ink3)
        NumField("每日 daily", fDaily) { fDaily = it }
        NumField("每周 3–4 次 weekly34", f34) { f34 = it }
        NumField("每周 1–2 次 weekly12", f12) { f12 = it }
        NumField("指定星期 weekdays", fWd) { fWd = it }
        Spacer(Modifier.height(8.dp))
        Text("时段系数", style = PixelType.Small, color = PixelColors.Ink3)
        NumField("窗口内 in", wIn) { wIn = it }
        NumField("无窗口 none", wNone) { wNone = it }
        NumField("窗口外 out", wOut) { wOut = it }

        Spacer(Modifier.height(10.dp))
        Text("连续里程碑奖励（n 次 → 分数，1–8 条）", style = PixelType.Small, color = PixelColors.Ink3)
        Spacer(Modifier.height(6.dp))
        msRows.forEachIndexed { i, row ->
          Row(verticalAlignment = Alignment.CenterVertically) {
            PixelTextField(
              value = row.first,
              onValueChange = { v ->
                msRows = msRows.toMutableList().also { it[i] = v to it[i].second }
              },
              placeholder = "次数",
              modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(6.dp))
            Text("次 →", style = PixelType.Small, color = PixelColors.Ink2)
            Spacer(Modifier.width(6.dp))
            PixelTextField(
              value = row.second,
              onValueChange = { v ->
                msRows = msRows.toMutableList().also { it[i] = it[i].first to v }
              },
              placeholder = "分数",
              modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(6.dp))
            Text("分", style = PixelType.Small, color = PixelColors.Ink2)
            Spacer(Modifier.width(6.dp))
            PixelSmallButton(
              "×",
              onClick = { msRows = msRows.toMutableList().also { it.removeAt(i) } },
              filled = false,
            )
          }
          Spacer(Modifier.height(6.dp))
        }
        PixelSmallButton(
          "＋ 加一条里程碑",
          onClick = { msRows = msRows + ("" to "") },
          filled = false,
        )

        err?.let {
          Spacer(Modifier.height(8.dp))
          Text(it, style = PixelType.Small, color = PixelColors.Red)
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Box(Modifier.weight(1f)) {
            PixelButton("取消", onClick = onDismiss, modifier = Modifier.fillMaxWidth())
          }
          Box(Modifier.weight(1f)) {
            PixelSmallButton("恢复默认", onClick = { confirmRestore = true }, filled = false, modifier = Modifier.fillMaxWidth())
          }
          Box(Modifier.weight(1f)) {
            PixelButton(
              "保存",
              onClick = {
                val parsed = parseCfg(
                  initial, unit, cap, maxPer,
                  d1, d2, d3, d4, d5,
                  fDaily, f34, f12, fWd,
                  wIn, wNone, wOut,
                  msRows,
                )
                if (parsed == null) {
                  err = "有数字格式不对，请检查"
                  return@PixelButton
                }
                val vErr = validatePoints(parsed)
                if (vErr != null) {
                  err = vErr
                  return@PixelButton
                }
                onSave(parsed)
              },
              modifier = Modifier.fillMaxWidth(),
            )
          }
        }
      }
    }
  }

  if (confirmRestore) {
    PixelConfirmDialog(
      title = "恢复所有系数到默认值？",
      message = "所有系数和里程碑都会回到初始值，改完记得点保存。",
      okLabel = "恢复",
      onOk = {
        confirmRestore = false
        unit = "0.5"; cap = "60"; maxPer = "300"
        d1 = "1"; d2 = "1.2"; d3 = "1.5"; d4 = "1.8"; d5 = "2.2"
        fDaily = "1"; f34 = "1.2"; f12 = "1.5"; fWd = "1"
        wIn = "1.1"; wNone = "1"; wOut = "0.8"
        msRows = DEFAULT_MILESTONES.map { it.n.toString() to it.p.toString() }
        err = null
      },
      onCancel = { confirmRestore = false },
    )
  }
}

/** 我的画像（仅自己可见）：列出 / 改 / 删 / 补一块 / 分享勾选 */
@Composable
private fun ProfileSheet(onDismiss: () -> Unit, onToast: (String) -> Unit) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var blocks by remember { mutableStateOf<List<ProfileBlock>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  // null = 列表；(block, content)，block 为空串表示「补一块」
  var editTarget by remember { mutableStateOf<Pair<String, String>?>(null) }
  var editName by remember { mutableStateOf("") }
  var editContent by remember { mutableStateOf("") }
  var deleteTarget by remember { mutableStateOf<String?>(null) }
  var shareSel by remember { mutableStateOf<Set<String>>(emptySet()) }
  var err by remember { mutableStateOf<String?>(null) }
  var busy by remember { mutableStateOf(false) }

  suspend fun reload() {
    val token = Session.token(context) ?: return
    loading = true
    try {
      blocks = Api.getMyProfile(token).blocks
    } catch (e: Exception) {
      err = e.message ?: "加载失败"
    }
    loading = false
  }
  LaunchedEffect(Unit) { reload() }

  Overlay {
    PixelPanel(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(
        Modifier
          .padding(16.dp)
          .heightIn(max = 540.dp)
          .verticalScroll(rememberScrollState())
      ) {
        Text("我的画像（仅自己可见）", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(12.dp))

        if (editTarget != null) {
          val isAdd = editTarget!!.first.isBlank()
          Text(if (isAdd) "补一块画像" else "改画像块", style = PixelType.Body, color = PixelColors.Ink)
          Spacer(Modifier.height(8.dp))
          if (isAdd) {
            Text(
              "块名（basic 基本情况 / resume 简历 / skills 能力 / goal_progress 目标进展 / important 重要信息）",
              style = PixelType.Small,
              color = PixelColors.Ink2,
            )
            Spacer(Modifier.height(4.dp))
            PixelTextField(
              value = editName,
              onValueChange = { editName = it; err = null },
              placeholder = "比如 basic",
              modifier = Modifier.fillMaxWidth(),
            )
          } else {
            Text("块名：${editTarget!!.first}", style = PixelType.Small, color = PixelColors.Ink2)
          }
          Spacer(Modifier.height(8.dp))
          Text("内容", style = PixelType.Small, color = PixelColors.Ink2)
          Spacer(Modifier.height(4.dp))
          PixelTextArea(
            value = editContent,
            onValueChange = { editContent = it; err = null },
            placeholder = "这一块写点什么",
            modifier = Modifier.fillMaxWidth(),
            minLines = 6,
          )
          err?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, style = PixelType.Small, color = PixelColors.Red)
          }
          Spacer(Modifier.height(12.dp))
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f)) {
              PixelSmallButton(
                "取消",
                onClick = { editTarget = null; err = null },
                filled = false,
                modifier = Modifier.fillMaxWidth(),
              )
            }
            Box(Modifier.weight(1f)) {
              PixelSmallButton(
                "保存",
                onClick = {
                  val name = if (isAdd) editName.trim() else editTarget!!.first
                  if (name.isBlank()) {
                    err = "块名不能为空"
                    return@PixelSmallButton
                  }
                  if (busy) return@PixelSmallButton
                  busy = true
                  scope.launch {
                    val token = Session.token(context)
                    if (token == null) {
                      busy = false
                      err = "未登录"
                      return@launch
                    }
                    try {
                      Api.putProfileBlock(token, name, editContent.trim())
                      busy = false
                      editTarget = null
                      err = null
                      onToast(if (editContent.trim().isEmpty()) "已删除" else "已保存")
                      reload()
                    } catch (e: Exception) {
                      busy = false
                      err = e.message ?: "保存失败"
                    }
                  }
                },
                modifier = Modifier.fillMaxWidth(),
              )
            }
          }
        } else {
          if (loading) {
            Text("加载中…", style = PixelType.Small, color = PixelColors.Ink3)
          } else {
            val active = blocks.filter { it.status.isBlank() || it.status == "active" }
            if (active.isEmpty()) {
              Text("画像还是空的。聊几天天、打几天卡，zoowy 会慢慢记住你。",
                style = PixelType.Small, color = PixelColors.Ink3)
            } else {
              active.forEachIndexed { i, b ->
                Text(PROFILE_BLOCK_NAMES[b.block] ?: b.block, style = PixelType.Body, color = PixelColors.Ink)
                Text(
                  if (b.source == "user") "你改的" else "zoowy 记的",
                  style = PixelType.Small,
                  color = PixelColors.Ink3,
                )
                Spacer(Modifier.height(4.dp))
                Text(b.content, style = PixelType.Small, color = PixelColors.Ink2)
                Spacer(Modifier.height(6.dp))
                Row {
                  PixelSmallButton(
                    "改",
                    onClick = {
                      editTarget = b.block to b.content
                      editName = ""
                      editContent = b.content
                      err = null
                    },
                    filled = false,
                  )
                  Spacer(Modifier.width(8.dp))
                  PixelSmallButton("删", onClick = { deleteTarget = b.block }, filled = false)
                }
                if (i != active.lastIndex) {
                  Spacer(Modifier.height(8.dp))
                  Box(Modifier.fillMaxWidth().height(2.dp).background(PixelColors.Line))
                  Spacer(Modifier.height(8.dp))
                }
              }
            }
            Spacer(Modifier.height(12.dp))
            PixelSmallButton(
              "＋ 补一块",
              onClick = {
                editTarget = "" to ""
                editName = ""
                editContent = ""
                err = null
              },
              filled = false,
            )
            Spacer(Modifier.height(14.dp))
            Text("分享给对方（勾选要公开的块）", style = PixelType.Body, color = PixelColors.Ink)
            Spacer(Modifier.height(6.dp))
            PROFILE_BLOCK_ORDER.forEach { key ->
              val on = shareSel.contains(key)
              Row(
                Modifier
                  .fillMaxWidth()
                  .clickable { shareSel = if (on) shareSel - key else shareSel + key }
                  .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
              ) {
                Text(
                  if (on) "☑" else "☐",
                  style = PixelType.Body,
                  color = if (on) PixelColors.GreenDeep else PixelColors.Ink3,
                )
                Spacer(Modifier.width(8.dp))
                Text(PROFILE_BLOCK_NAMES[key] ?: key, style = PixelType.Small, color = PixelColors.Ink2)
              }
            }
            Spacer(Modifier.height(8.dp))
            PixelSmallButton(
              "保存分享",
              onClick = {
                scope.launch {
                  val token = Session.token(context) ?: return@launch
                  try {
                    Api.shareProfileBlocks(token, shareSel.toList())
                    onToast("已保存分享")
                  } catch (e: Exception) {
                    err = e.message ?: "操作失败"
                  }
                }
              },
            )
            Spacer(Modifier.height(10.dp))
            Text(
              "画像默认只有你自己看得到；AI 每次分析都会带着它，也会更新它。你手改过的，zoowy 会更尊重。",
              style = PixelType.Small,
              color = PixelColors.Ink3,
            )
            err?.let {
              Spacer(Modifier.height(8.dp))
              Text(it, style = PixelType.Small, color = PixelColors.Red)
            }
            Spacer(Modifier.height(12.dp))
            PixelButton(text = "关闭", onClick = onDismiss, modifier = Modifier.fillMaxWidth())
          }
        }
      }
    }
  }

  if (deleteTarget != null) {
    val b = deleteTarget!!
    PixelConfirmDialog(
      title = "删掉「${PROFILE_BLOCK_NAMES[b] ?: b}」这块？",
      message = "只标失效，历史还能找回。",
      okLabel = "删",
      onOk = {
        deleteTarget = null
        scope.launch {
          val token = Session.token(context) ?: return@launch
          try {
            Api.putProfileBlock(token, b, "")
            onToast("已删除")
            reload()
          } catch (e: Exception) {
            err = e.message ?: "删除失败"
          }
        }
      },
      onCancel = { deleteTarget = null },
    )
  }
}

/** 全屏半透明遮罩 + 居中内容 */
@Composable
private fun Overlay(content: @Composable () -> Unit) {
  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(Color(0x88000000)),
    contentAlignment = Alignment.Center,
  ) {
    Box(Modifier.fillMaxWidth()) {
      content()
    }
  }
}

/** 键值数字编辑行：label + 输入框 */
@Composable
private fun NumField(label: String, value: String, onChange: (String) -> Unit) {
  Row(
    Modifier.fillMaxWidth().padding(vertical = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, style = PixelType.Small, color = PixelColors.Ink2, modifier = Modifier.width(140.dp))
    Spacer(Modifier.width(8.dp))
    PixelTextField(
      value = value,
      onValueChange = { onChange(it) },
      placeholder = "0",
      modifier = Modifier.weight(1f),
    )
  }
}

/** 多行像素输入框（画像块 / 日报编辑用） */
@Composable
private fun PixelTextArea(
  value: String,
  onValueChange: (String) -> Unit,
  placeholder: String,
  modifier: Modifier = Modifier,
  minLines: Int = 6,
) {
  Box(
    modifier = modifier
      .background(PixelColors.Card)
      .pixelBorder(2.dp, PixelColors.Outline)
      .padding(horizontal = 12.dp, vertical = 12.dp),
  ) {
    if (value.isEmpty()) {
      Text(placeholder, style = PixelType.Body, color = PixelColors.Ink3)
    }
    BasicTextField(
      value = value,
      onValueChange = onValueChange,
      textStyle = PixelType.Body.copy(color = PixelColors.Ink),
      cursorBrush = SolidColor(PixelColors.Green),
      modifier = Modifier.fillMaxWidth().heightIn(min = (minLines * 22).dp),
    )
  }
}

/** Double 转字符串：整数不带小数点，小数保留 2 位 */
private fun fmtNum(v: Double): String {
  return if (v == v.toLong().toDouble()) v.toLong().toString() else String.format("%.2f", v)
}

/**
 * 解析所有字段，构造 PointsConfig；任一解析失败返回 null。
 *
 * P0 修复：不再写死 milestones = emptyList()。kotlinx encodeDefaults=true 会把空数组
 * 发成 "milestones":[]，后端 setPoints 视为非法（400）。编辑器为空（用户没动里程碑）
 * 时原样回传 initial.milestones，保证保存必然带上 1–8 条合法里程碑。
 */
private fun parseCfg(
  initial: PointsConfig,
  unit: String, cap: String, maxPer: String,
  d1: String, d2: String, d3: String, d4: String, d5: String,
  fDaily: String, f34: String, f12: String, fWd: String,
  wIn: String, wNone: String, wOut: String,
  msRows: List<Pair<String, String>>,
): PointsConfig? {
  return try {
    val diff = Difficulty(
      `1` = d1.toDouble(), `2` = d2.toDouble(), `3` = d3.toDouble(),
      `4` = d4.toDouble(), `5` = d5.toDouble(),
    )
    val freq = Freq(
      daily = fDaily.toDouble(), weekly34 = f34.toDouble(),
      weekly12 = f12.toDouble(), weekdays = fWd.toDouble(),
    )
    val win = Window(
      `in` = wIn.toDouble(), none = wNone.toDouble(), out = wOut.toDouble(),
    )
    // 关键修复：不再写死 emptyList()。编辑器为空（用户没动里程碑）时原样回传
    // initial.milestones；万一后端给的也是空表，就退回默认里程碑，保证发出去的是
    // 1–8 条合法数据，绝不会让 encodeDefaults=true 把 "milestones":[] 发到后端。
    val milestones = when {
      msRows.isNotEmpty() -> msRows.map { (n, p) -> Milestone(n.trim().toInt(), p.trim().toInt()) }
      initial.milestones.isNotEmpty() -> initial.milestones
      else -> DEFAULT_MILESTONES
    }
    PointsConfig(
      unit = unit.toDouble(),
      cap = cap.toInt(),
      maxPer = maxPer.toInt(),
      difficulty = diff,
      freq = freq,
      window = win,
      milestones = milestones,
    )
  } catch (e: Exception) {
    null
  }
}

/** 按 points.js:57-86 做范围校验；返回第一条错误文案，全合法返回 null */
private fun validatePoints(cfg: PointsConfig): String? {
  if (!finite(cfg.unit) || cfg.unit < 0.1 || cfg.unit > 2) return "单价需在 0.1–2 之间"
  if (cfg.cap < 10 || cfg.cap > 200) return "单次封顶需在 10–200 之间"
  if (cfg.maxPer < 50 || cfg.maxPer > 300) return "单次硬上限需在 50–300 之间"
  val diffs = listOf(cfg.difficulty.`1`, cfg.difficulty.`2`, cfg.difficulty.`3`,
    cfg.difficulty.`4`, cfg.difficulty.`5`)
  if (diffs.any { !finite(it) || it < 0.5 || it > 5 }) return "难度系数需在 0.5–5 之间"
  val freqs = listOf(cfg.freq.daily, cfg.freq.weekly34, cfg.freq.weekly12, cfg.freq.weekdays)
  if (freqs.any { !finite(it) || it < 0.5 || it > 3 }) return "频率系数需在 0.5–3 之间"
  val wins = listOf(cfg.window.`in`, cfg.window.none, cfg.window.out)
  if (wins.any { !finite(it) || it < 0.5 || it > 2 }) return "时段系数需在 0.5–2 之间"
  if (cfg.milestones.isEmpty() || cfg.milestones.size > 8) return "里程碑表需为 1–8 条"
  if (cfg.milestones.any { it.n < 1 || it.p < 1 }) return "里程碑条目需为正整数"
  return null
}

// ---------------------------------------------------------------------------
// 画像变更：改了什么 / 明细 / 版本回滚 / AI 设置（v1.2 双端对齐）
// ---------------------------------------------------------------------------

private fun workflowLabel(wf: String): String = when (wf) {
  "chat" -> "聊天"
  "plan" -> "拆计划"
  "progress" -> "进度分析"
  "daily" -> "日报"
  "user" -> "你手动"
  else -> wf.ifBlank { "zoowy" }
}

/** 「我」页画像变更区块：未读红点 + 最近一条摘要 + 查看全部 */
@Composable
private fun ProfileChangesSection(data: ProfileChangesResponse?, onOpen: () -> Unit) {
  PixelPanel(Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text("画像变更", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.width(8.dp))
        val unread = data?.unread ?: 0
        if (unread > 0) {
          Text("● $unread 条新的", style = PixelType.Small, color = PixelColors.OrangeDeep)
        }
        Spacer(Modifier.weight(1f))
        PixelSmallButton("查看全部", onClick = onOpen)
      }
      Spacer(Modifier.height(10.dp))
      val last = data?.items?.firstOrNull()
      if (last == null) {
        Text("还没有变更。zoowy 记住新信息时会在这里告诉你改了什么。",
          style = PixelType.Small, color = PixelColors.Ink3)
      } else {
        Text(last.summary, style = PixelType.Body, color = PixelColors.Ink)
        Spacer(Modifier.height(4.dp))
        val tail = if (last.reported) "" else " · 静默留痕"
        Text("${ledgerTime(last.createdAt)} · ${workflowLabel(last.workflow)}$tail",
          style = PixelType.Small, color = PixelColors.Ink3)
      }
    }
  }
}

/** 变更记录弹层：明细展开 / 版本历史与回滚（带确认）/ 全部标已读 */
@Composable
private fun ProfileChangesDialog(
  data: ProfileChangesResponse,
  versions: List<ProfileVersionDto>,
  onDismiss: () -> Unit,
  onChanged: () -> Unit,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var expanded by remember { mutableStateOf<Long?>(null) }
  var rollbackTarget by remember { mutableStateOf<ProfileVersionDto?>(null) }
  var err by remember { mutableStateOf<String?>(null) }

  Overlay {
    PixelPanel(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("画像变更记录", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(6.dp))
        Text("每次改动都留痕；关掉「改完汇报」只是不推红点，这里照样能翻到。",
          style = PixelType.Small, color = PixelColors.Ink3)
        Spacer(Modifier.height(12.dp))

        if (data.items.isEmpty()) {
          Text("还没有变更。", style = PixelType.Small, color = PixelColors.Ink3)
        } else {
          data.items.forEach { item ->
            Row(verticalAlignment = Alignment.CenterVertically) {
              Column(Modifier.weight(1f)) {
                Text(item.summary, style = PixelType.Body, color = PixelColors.Ink)
                val tail = if (item.reported) "" else " · 静默留痕"
                Text("${ledgerTime(item.createdAt)} · ${workflowLabel(item.workflow)}$tail",
                  style = PixelType.Small, color = PixelColors.Ink3)
              }
              Spacer(Modifier.width(6.dp))
              PixelSmallButton(if (expanded == item.id) "收起" else "明细", onClick = {
                expanded = if (expanded == item.id) null else item.id
              })
            }
            if (expanded == item.id) {
              Column(Modifier.padding(start = 8.dp, top = 6.dp)) {
                if (item.detail.isEmpty()) {
                  Text("（无明细）", style = PixelType.Small, color = PixelColors.Ink3)
                } else {
                  item.detail.forEach { c ->
                    val reason = c.reason.ifBlank { "—" }
                    val evidence = c.evidence.ifBlank { "—" }
                    Text("${c.op} · ${c.block}", style = PixelType.Small, color = PixelColors.Ink2)
                    Text("理由：$reason", style = PixelType.Small, color = PixelColors.Ink3)
                    Text("依据：$evidence", style = PixelType.Small, color = PixelColors.Ink3)
                    if (c.before.isNotBlank()) {
                      Text("原：${c.before.take(80)}", style = PixelType.Small, color = PixelColors.Ink3)
                    }
                    if (c.after.isNotBlank()) {
                      Text("新：${c.after.take(80)}", style = PixelType.Small, color = PixelColors.Ink3)
                    }
                    Spacer(Modifier.height(6.dp))
                  }
                }
              }
            }
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().height(2.dp).background(PixelColors.Line))
            Spacer(Modifier.height(8.dp))
          }
        }

        Text("版本历史（可回滚）", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(6.dp))
        if (versions.isEmpty()) {
          Text("还没有版本快照。", style = PixelType.Small, color = PixelColors.Ink3)
        } else {
          versions.forEach { v ->
            Row(verticalAlignment = Alignment.CenterVertically) {
              Text("#${v.id} ${ledgerTime(v.createdAt)} · ${v.blockCount} 块 · ${v.changedBy}",
                style = PixelType.Small, color = PixelColors.Ink2, modifier = Modifier.weight(1f))
              Spacer(Modifier.width(6.dp))
              PixelSmallButton("回滚", onClick = { rollbackTarget = v })
            }
            Spacer(Modifier.height(6.dp))
          }
        }

        err?.let {
          Spacer(Modifier.height(8.dp))
          Text(it, style = PixelType.Small, color = PixelColors.Red)
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Box(Modifier.weight(1f)) {
            PixelSmallButton("全部已读", onClick = {
              scope.launch {
                val token = Session.token(context) ?: return@launch
                try {
                  Api.markProfileChangesRead(token)
                  onChanged()
                } catch (e: Exception) {
                  err = e.message ?: "操作失败"
                }
              }
            })
          }
          Box(Modifier.weight(1f)) {
            PixelSmallButton("关闭", onClick = onDismiss)
          }
        }
      }
    }
  }

  if (rollbackTarget != null) {
    val v = rollbackTarget!!
    PixelConfirmDialog(
      title = "回到版本 #${v.id}？",
      message = "当前画像会先存一份快照，随时能再回来。",
      okLabel = "回滚",
      onOk = {
        rollbackTarget = null
        scope.launch {
          val token = Session.token(context)
          if (token == null) {
            err = "未登录"
            return@launch
          }
          try {
            Api.rollbackProfileVersion(token, v.id)
            onChanged()
            onDismiss()
          } catch (e: Exception) {
            err = e.message ?: "回滚失败"
          }
        }
      },
      onCancel = { rollbackTarget = null },
    )
  }
}

/** AI 设置弹层：改完汇报 / AI 日报（hint 对齐 Web me.js aiSettingsSheet） */
@Composable
private fun AiSettingsDialog(
  initial: UserSettings,
  onDismiss: () -> Unit,
  onSave: (AiSettingsPayload) -> Unit,
) {
  var reportChanges by remember { mutableStateOf(initial.reportChanges) }
  var dailyEnabled by remember { mutableStateOf(initial.dailyEnabled) }

  Overlay {
    PixelPanel(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
      Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("AI 设置", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(12.dp))
        AiToggle(
          "改完汇报",
          "开 = AI 每次改完告诉你改了什么；关 = 静默改。不管开不开，改动都留痕，随时能翻",
          reportChanges,
        ) { reportChanges = it }
        Spacer(Modifier.height(8.dp))
        AiToggle(
          "AI 日报",
          "开 = 每晚 23:30 给你生成一份日报（会调用 AI）；默认关，不开就不烧额度",
          dailyEnabled,
        ) { dailyEnabled = it }
        Spacer(Modifier.height(12.dp))
        Text(
          "每人一份，两边互不影响。白名单不受开关影响：AI 永远碰不到验收、积分和对方的数据。",
          style = PixelType.Small,
          color = PixelColors.Ink3,
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Box(Modifier.weight(1f)) { PixelSmallButton("取消", onClick = onDismiss) }
          Box(Modifier.weight(1f)) {
            PixelSmallButton("保存", onClick = {
              onSave(
                AiSettingsPayload(
                  reportChanges = reportChanges,
                  dailyEnabled = dailyEnabled,
                )
              )
            })
          }
        }
      }
    }
  }
}

@Composable
private fun AiToggle(label: String, hint: String, on: Boolean, onChange: (Boolean) -> Unit) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) {
      Text(label, style = PixelType.Body, color = PixelColors.Ink)
      Text(hint, style = PixelType.Small, color = PixelColors.Ink3)
    }
    Spacer(Modifier.width(8.dp))
    PixelSmallButton(if (on) "开" else "关", onClick = { onChange(!on) }, filled = on)
  }
}

// ---------------------------------------------------------------------------
// 我的搭档：邀请码 / 配对请求 / 解绑 / 组内动态
// ---------------------------------------------------------------------------

@Composable
private fun PairCard(status: PairStatus?, vm: AppViewModel, onToast: (String) -> Unit) {
  var joinCode by remember { mutableStateOf("") }
  var unbindConfirm by remember { mutableStateOf(false) }

  PixelPanel(Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp)) {
      when {
        status == null -> {
          Text("加载中…", style = PixelType.Small, color = PixelColors.Ink3)
        }

        status.paired && status.partner != null -> {
          val partner = status.partner!!
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text(partner.avatar.orEmpty().ifBlank { "🐾" }, style = PixelType.Title)
            Spacer(Modifier.width(10.dp))
            Text(partner.username, style = PixelType.Body, color = PixelColors.Ink, modifier = Modifier.weight(1f))
            PixelChip("已绑定 · 互相监督中", bg = PixelColors.GreenSoft, fg = PixelColors.GreenDeep)
          }
          Spacer(Modifier.height(12.dp))
          PixelSmallButton("解除绑定", onClick = { unbindConfirm = true }, filled = false)
          if (status.events.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Text("组内动态", style = PixelType.Body, color = PixelColors.Ink)
            Spacer(Modifier.height(6.dp))
            status.events.forEach { e ->
              Row(Modifier.fillMaxWidth()) {
                Text("${e.username} · ${e.detail}", style = PixelType.Small, color = PixelColors.Ink2, modifier = Modifier.weight(1f))
                Text(shortIso(e.createdAt), style = PixelType.Small, color = PixelColors.Ink3)
              }
              Spacer(Modifier.height(4.dp))
            }
          }
        }

        else -> {
          val code = status.myCode
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text("我的邀请码", style = PixelType.Small, color = PixelColors.Ink2)
            Spacer(Modifier.width(8.dp))
            Text(code?.code.orEmpty().ifBlank { "—" }, style = PixelType.Mono, color = PixelColors.Ink)
          }
          if (code != null && code.expiresAt.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text("${shortIso(code.expiresAt)} 前有效", style = PixelType.Small, color = PixelColors.Ink3)
          }
          Spacer(Modifier.height(8.dp))
          Row {
            PixelSmallButton(
              "换一个",
              onClick = {
                if (code != null) {
                  vm.revokePairInvite(code.code) { e -> onToast(e ?: "已换一个新邀请码") }
                } else {
                  vm.ensurePairInvite { e -> onToast(e ?: "已生成邀请码") }
                }
              },
              filled = false,
            )
            if (code == null) {
              Spacer(Modifier.width(8.dp))
              PixelSmallButton(
                "生成邀请码",
                onClick = { vm.ensurePairInvite { e -> onToast(e ?: "已生成邀请码") } },
                filled = false,
              )
            }
          }
          Spacer(Modifier.height(14.dp))
          Text("输入对方的邀请码", style = PixelType.Small, color = PixelColors.Ink2)
          Spacer(Modifier.height(6.dp))
          PixelTextField(
            value = joinCode,
            onValueChange = { joinCode = it },
            placeholder = "对方的邀请码",
            modifier = Modifier.fillMaxWidth(),
          )
          Spacer(Modifier.height(8.dp))
          PixelButton(
            text = "申请配对",
            onClick = {
              val c = joinCode.trim()
              if (c.isBlank()) {
                onToast("填一下对方的邀请码")
                return@PixelButton
              }
              vm.joinPair(c) { e ->
                onToast(e ?: "申请已发出，等对方确认")
                if (e == null) joinCode = ""
              }
            },
            modifier = Modifier.fillMaxWidth(),
          )
          val pending = status.pendingRequest
          if (pending != null) {
            Spacer(Modifier.height(14.dp))
            Text("${pending.requester?.username.orEmpty()} 想和你配对", style = PixelType.Body, color = PixelColors.Ink)
            Spacer(Modifier.height(6.dp))
            Row {
              PixelSmallButton("同意", onClick = {
                vm.approvePairRequest(pending.id) { e -> onToast(e ?: "配对成功 🐾") }
              })
              Spacer(Modifier.width(8.dp))
              PixelSmallButton("拒绝", onClick = {
                vm.rejectPairRequest(pending.id) { e -> onToast(e ?: "已拒绝") }
              }, filled = false)
            }
          }
          val mine = status.myRequest
          if (mine != null) {
            Spacer(Modifier.height(14.dp))
            Text("已向 ${mine.owner?.username.orEmpty()} 发出申请，等对方确认",
              style = PixelType.Small, color = PixelColors.Ink2)
            Spacer(Modifier.height(6.dp))
            PixelSmallButton("撤回", onClick = {
              vm.withdrawPairRequest(mine.id) { e -> onToast(e ?: "已撤回") }
            }, filled = false)
          }
          Spacer(Modifier.height(10.dp))
          Text("还没有搭档，把邀请码发给对方，或输入对方的码",
            style = PixelType.Small, color = PixelColors.Ink3)
        }
      }
    }
  }

  if (unbindConfirm) {
    PixelConfirmDialog(
      title = "解除绑定？",
      message = "解除绑定后整组解散，双方立刻看不到对方的数据；未完成的验收和未确认的兑换会作废。确定吗？",
      okLabel = "解除绑定",
      onOk = {
        unbindConfirm = false
        vm.unbindPair { e -> onToast(e ?: "已解除绑定") }
      },
      onCancel = { unbindConfirm = false },
    )
  }
}
