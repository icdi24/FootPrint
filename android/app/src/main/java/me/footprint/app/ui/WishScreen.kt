package me.footprint.app.ui

import android.widget.Toast
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
import kotlinx.coroutines.launch
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.footprint.app.net.Api
import me.footprint.app.net.ApiException
import me.footprint.app.net.Redemption
import me.footprint.app.net.Session
import me.footprint.app.net.WishItem
import me.footprint.app.net.WishListResponse
import me.footprint.app.net.WishPayload
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType

/**
 * 愿望单页：余额横幅 + 愿望列表 + 新建/编辑 + 兑换 + 撤回 + 标记兑现。
 *
 * 与 Web 版 wish 页对齐。页面自己用 remember 管理状态、直接调 Api，
 * token 走 Session.token(context)，context 用 LocalContext.current。
 *
 * 积分与价格换算：1 元 = 10 分（后端默认 price_cny × 10 = points_cost）。
 * 兑换有冷却期，后端返回 redeemable=false + cooldownMsg 时如实展示。
 *
 * 注意：后端 /wish/:id/redeem 直接把兑换写成 status='confirmed'（项目里不存在
 * 'applied' 状态），所以「已兑换未兑现」一律按 confirmed 找，撤回/已收到也只认 confirmed。
 */

/** 常用 emoji 选项（对齐 Web wish.js 的 16 个），新建/编辑时点选 */
private val WISH_EMOJIS = listOf(
  "🎁", "🎧", "⌚", "👟", "🎮", "📱", "💄", "👜",
  "🍰", "🎬", "🛹", "📷", "✈️", "🍲", "🪑", "🌷",
)

/** 价格格式化：去掉无意义的小数（10.0 → 10），最多保留两位 */
private fun fmtPrice(p: Double): String {
  val rounded = Math.round(p * 100.0) / 100.0
  return if (rounded == Math.floor(rounded) && !rounded.isInfinite()) {
    rounded.toLong().toString()
  } else {
    rounded.toString()
  }
}

/** 千分位（对齐 Web UI.fmtNum） */
private fun fmtNum(n: Int): String = String.format(java.util.Locale.CHINA, "%,d", n)

/** 积分 → 人民币参考价（points / 10，对齐 Web UI.fmtYuan） */
private fun fmtYuan(points: Int): String {
  val v = points / 10.0
  return if (v == Math.floor(v) && !v.isInfinite()) {
    String.format(java.util.Locale.CHINA, "%,d", v.toLong())
  } else {
    String.format(java.util.Locale.CHINA, "%,.1f", v)
  }
}

/** 弹层表单里暂存的数据（新建和编辑共用一套） */
private data class WishForm(
  val title: String = "",
  val emoji: String = "🎁",
  val description: String = "",
  val priceText: String = "",
  val pointsText: String = "",
  val cooldownDays: Int = 0,
  val status: String = "active",
  /** 积分价是否被手动改过；没改过时参考价输入实时联动 pointsText */
  val pointsTouched: Boolean = false,
)

@Composable
fun WishScreen(vm: AppViewModel) {
  val loggedIn by vm.loggedIn.collectAsStateWithLifecycle()
  if (!loggedIn) {
    WishGuest(vm = vm)
    return
  }
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  // 列表数据与加载状态
  var data by remember { mutableStateOf<WishListResponse?>(null) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }

  // 弹层状态：null = 关闭；否则携带要编辑的愿望（null 表示新建）
  var editing: WishItem? by remember { mutableStateOf<WishItem?>(null) }
  var showEditor by remember { mutableStateOf(false) }

  // 兑换二次确认弹层：非 null 时先弹层，确认后才提交
  var redeemTarget: WishItem? by remember { mutableStateOf<WishItem?>(null) }

  // 卡片上「撤回」的二次确认（与兑换记录行共用同一文案）
  var pendingCardCancel: Redemption? by remember { mutableStateOf<Redemption?>(null) }

  // 正在操作的愿望 id / 兑换 id，用于防连点（两者是不同主键，不能混比）
  var busyWishId by remember { mutableStateOf<Long?>(null) }
  var busyRedemptionId by remember { mutableStateOf<Long?>(null) }

  // 拉取列表
  suspend fun load() {
    val token = Session.token(context) ?: return
    loading = true
    error = null
    try {
      data = Api.listWish(token)
    } catch (e: Exception) {
      error = (e as? ApiException)?.message ?: e.message ?: "加载失败"
    } finally {
      loading = false
    }
  }

  LaunchedEffect(Unit) {
    load()
  }

  val balance = data?.balance ?: 0

  Screen {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .verticalScroll(rememberScrollState()),
    ) {
      // ---- 顶栏 ----
      WishHeader(onNew = { editing = null; showEditor = true })

      Spacer(Modifier.height(12.dp))

      // ---- 余额横幅 ----
      BalanceBanner(balance = balance)

      Spacer(Modifier.height(16.dp))

      if (loading) {
        Text("加载中…", style = PixelType.Body, color = PixelColors.Ink3)
        Spacer(Modifier.height(24.dp))
        return@Column
      }

      if (error != null) {
        Text("加载出错：$error", style = PixelType.Small, color = PixelColors.RedDeep)
        Spacer(Modifier.height(8.dp))
        PixelSmallButton(text = "重试", onClick = { scope.launch { load() } }, filled = false)
        Spacer(Modifier.height(24.dp))
        return@Column
      }

      val items = data?.items ?: emptyList()
      val redemptions = data?.redemptions ?: emptyList()

      // 下架的不进列表、也不计件数（对齐 Web active）
      val activeItems = items.filter { it.status == "active" }

      // ---- 想要的东西 标题 ----
      WishSectionTitle(count = activeItems.size)
      Spacer(Modifier.height(8.dp))

      // ---- 愿望列表 / 空态 ----
      if (activeItems.isEmpty()) {
        WishEmpty()
      } else {
        for (item in activeItems) {
          // 找这条愿望对应的「已扣分、未兑现」的最新一条记录。
          // 后端兑换直接写 status='confirmed'，用 applied 找会恒为 null（P0）。
          val confirmed = redemptions
            .filter { it.wish_item_id == item.id && it.status == "confirmed" }
            .maxByOrNull { it.id }
          WishCard(
            item = item,
            balance = balance,
            redemption = confirmed,
            busy = busyWishId == item.id || (confirmed != null && busyRedemptionId == confirmed.id),
            onEdit = { editing = item; showEditor = true },
            onRedeem = { redeemTarget = item },
            onCancel = {
              val r = confirmed
              if (r != null) pendingCardCancel = r
            },
            onDone = {
              val r = confirmed
              if (r != null) {
                scope.launch {
                  val token = Session.token(context) ?: return@launch
                  busyRedemptionId = r.id
                  try {
                    Api.doneRedemption(token, r.id)
                    Toast.makeText(context, "记好了，去把它买回来吧 🛍️", Toast.LENGTH_SHORT).show()
                    load()
                  } catch (e: Exception) {
                    Toast.makeText(context, (e as? ApiException)?.message ?: "操作失败", Toast.LENGTH_SHORT).show()
                  } finally {
                    busyRedemptionId = null
                  }
                }
              }
            },
          )
          Spacer(Modifier.height(12.dp))
        }
      }

      // ---- 兑换记录（对齐 Web 版「兑换记录」板块）----
      if (redemptions.isNotEmpty()) {
        RedemptionList(
          redemptions = redemptions,
          busyId = busyRedemptionId,
          onCancel = { r ->
            scope.launch {
              val token = Session.token(context) ?: return@launch
              busyRedemptionId = r.id
              try {
                Api.cancelRedemption(token, r.id)
                Toast.makeText(context, "已撤回，积分退回", Toast.LENGTH_SHORT).show()
                load()
              } catch (e: Exception) {
                Toast.makeText(context, (e as? ApiException)?.message ?: "撤销失败", Toast.LENGTH_SHORT).show()
              } finally {
                busyRedemptionId = null
              }
            }
          },
          onDone = { r ->
            scope.launch {
              val token = Session.token(context) ?: return@launch
              busyRedemptionId = r.id
              try {
                Api.doneRedemption(token, r.id)
                Toast.makeText(context, "记好了，去把它买回来吧 🛍️", Toast.LENGTH_SHORT).show()
                load()
              } catch (e: Exception) {
                Toast.makeText(context, (e as? ApiException)?.message ?: "操作失败", Toast.LENGTH_SHORT).show()
              } finally {
                busyRedemptionId = null
              }
            }
          },
        )
        Spacer(Modifier.height(12.dp))
      }

      Spacer(Modifier.height(12.dp))
    }
  }

  // ---- 新建 / 编辑弹层 ----
  if (showEditor) {
    WishEditor(
      editing = editing,
      onDismiss = { showEditor = false },
      onSave = { form ->
        scope.launch {
          val token = Session.token(context) ?: return@launch
          val price = form.priceText.trim().toDoubleOrNull() ?: 0.0
          val points = form.pointsText.trim().toIntOrNull()
            ?: Math.round(price * 10).toInt()
          val payload = WishPayload(
            title = form.title.trim(),
            category = "goods",
            description = form.description.trim().ifBlank { null },
            emoji = form.emoji,
            price_cny = price,
            points_cost = points,
            // 冷却期始终传值（含 0），否则 0 会被省略、后端无法清零
            cooldown_days = form.cooldownDays,
            status = if (form.status == "active") "active" else "archived",
          )
          val target = editing
          try {
            if (target == null) {
              Api.createWish(token, payload)
              Toast.makeText(context, "放上愿望单了 🎁", Toast.LENGTH_SHORT).show()
            } else {
              Api.updateWish(token, target.id, payload)
              Toast.makeText(context, "已保存", Toast.LENGTH_SHORT).show()
            }
            showEditor = false
            load()
          } catch (e: Exception) {
            Toast.makeText(context, (e as? ApiException)?.message ?: "保存失败", Toast.LENGTH_SHORT).show()
          }
        }
      },
    )
  }

  // ---- 卡片「撤回」的二次确认（与兑换记录行一致）----
  pendingCardCancel?.let { r ->
    PixelConfirmDialog(
      title = "撤回这次兑换？",
      message = "积分会退回余额。",
      okLabel = "撤回",
      cancelLabel = "再想想",
      onOk = {
        pendingCardCancel = null
        scope.launch {
          val token = Session.token(context) ?: return@launch
          busyRedemptionId = r.id
          try {
            Api.cancelRedemption(token, r.id)
            Toast.makeText(context, "已撤回，积分退回", Toast.LENGTH_SHORT).show()
            load()
          } catch (e: Exception) {
            Toast.makeText(context, (e as? ApiException)?.message ?: "撤销失败", Toast.LENGTH_SHORT).show()
          } finally {
            busyRedemptionId = null
          }
        }
      },
      onCancel = { pendingCardCancel = null },
    )
  }

  // ---- 兑换二次确认弹层（对齐 Web wish.js redeem 的 UI.sheet）----
  redeemTarget?.let { target ->
    RedeemConfirmSheet(
      item = target,
      balance = balance,
      busy = busyWishId == target.id,
      onDismiss = { if (busyWishId == null) redeemTarget = null },
      onConfirm = {
        scope.launch {
          val token = Session.token(context) ?: return@launch
          busyWishId = target.id
          try {
            val result = Api.redeemWish(token, target.id)
            Toast.makeText(context, "兑换成功，余额 ${fmtNum(result.balance)} 分", Toast.LENGTH_SHORT).show()
            redeemTarget = null
            load()
          } catch (e: Exception) {
            Toast.makeText(context, (e as? ApiException)?.message ?: "兑换失败", Toast.LENGTH_SHORT).show()
          } finally {
            busyWishId = null
          }
        }
      },
    )
  }
}

/** 页头：标题 + 「＋ 新建」（游客态点了跳登录，对齐 Web guestGate） */
@Composable
private fun WishHeader(onNew: () -> Unit) {
  Row(
    modifier = Modifier.fillMaxWidth(),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.SpaceBetween,
  ) {
    Column {
      Text("愿望单", style = PixelType.Big, color = PixelColors.Ink)
      Text("攒够分，换点真的", style = PixelType.Small, color = PixelColors.Ink3)
    }
    PixelSmallButton(text = "＋ 新建", filled = true, onClick = onNew)
  }
}

/** 「想要的东西」小节标题，count > 0 才显示件数（对齐 Web sec-count） */
@Composable
private fun WishSectionTitle(count: Int?) {
  Row(
    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Box(modifier = Modifier.size(10.dp).background(PixelColors.Ink))
      Spacer(Modifier.width(8.dp))
      Text("想要的东西", style = PixelType.Title, color = PixelColors.Ink)
    }
    if (count != null && count > 0) {
      Text("${fmtNum(count)} 件", style = PixelType.Small, color = PixelColors.Ink2)
    }
  }
}

/** 🎁 两行空态（对齐 Web .empty：愿望单还是空的 / 换算说明） */
@Composable
private fun WishEmpty() {
  Column(
    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text("🎁", style = PixelType.Huge)
    Spacer(Modifier.height(12.dp))
    Text("愿望单还是空的", style = PixelType.Title, color = PixelColors.Ink)
    Spacer(Modifier.height(8.dp))
    Text(
      text = "把想买的东西放进来，填上真实价格，系统按 1 元 = 10 分换算",
      style = PixelType.Small,
      color = PixelColors.Ink2,
      textAlign = TextAlign.Center,
    )
  }
}

/** 游客态：完整骨架（新建按钮 + 余额 0 横幅 + 🎁 空态），任何入口点了跳登录 */
@Composable
private fun WishGuest(vm: AppViewModel) {
  Screen {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .verticalScroll(rememberScrollState()),
    ) {
      WishHeader(onNew = { vm.showAuth("login") })
      Spacer(Modifier.height(12.dp))
      BalanceBanner(balance = 0)
      Spacer(Modifier.height(16.dp))
      WishSectionTitle(count = null)
      Spacer(Modifier.height(8.dp))
      WishEmpty()
      Spacer(Modifier.height(8.dp))
      PixelButton(
        text = "登录 / 注册",
        onClick = { vm.showAuth("login") },
        modifier = Modifier.align(Alignment.CenterHorizontally),
      )
      Spacer(Modifier.height(24.dp))
    }
  }
}

/** 顶部余额横幅：金色底（对齐 Web），当前积分（千分位）+ ≈ ¥X 参考 */
@Composable
private fun BalanceBanner(balance: Int) {
  PixelPanel(
    modifier = Modifier.fillMaxWidth(),
    background = PixelColors.Gold,
    borderColor = PixelColors.OrangeDeep,
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.SpaceBetween,
    ) {
      Column {
        Text("可用积分", style = PixelType.Small, color = PixelColors.OrangeDeep)
        Text(
          text = fmtNum(balance),
          style = PixelType.Huge,
          color = PixelColors.Ink,
        )
      }
      Column(horizontalAlignment = Alignment.End) {
        Text("≈ ¥${fmtYuan(balance)}", style = PixelType.Body, color = PixelColors.OrangeDeep)
        Text("· 1 元 = 10 分", style = PixelType.Small, color = PixelColors.Ink2)
      }
    }
  }
}

/** 单个愿望卡片：emoji + 标题 + 描述 + 积分价 + 参考价 + 进度条 + 操作按钮 */
@Composable
private fun WishCard(
  item: WishItem,
  balance: Int,
  redemption: Redemption?,
  busy: Boolean,
  onEdit: () -> Unit,
  onRedeem: () -> Unit,
  onCancel: () -> Unit,
  onDone: () -> Unit,
) {
  PixelPanel(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp)) {
      // 标题行
      Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(item.emoji, style = PixelType.Big)
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
          Text(item.title, style = PixelType.Title, color = PixelColors.Ink)
          if (item.description.isNotBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(item.description, style = PixelType.Small, color = PixelColors.Ink2)
          }
        }
        PixelSmallButton(text = "编辑", onClick = onEdit, filled = false)
      }

      Spacer(Modifier.height(10.dp))

      // 价格行：积分价 + 参考价
      Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text("积分", style = PixelType.Small, color = PixelColors.Ink3)
        Spacer(Modifier.width(6.dp))
        Text(
          text = fmtNum(item.points_cost),
          style = PixelType.Mono,
          color = PixelColors.GreenDeep,
        )
        Spacer(Modifier.width(12.dp))
        Text("≈", style = PixelType.Small, color = PixelColors.Ink3)
        Spacer(Modifier.width(6.dp))
        Text(
          text = "¥${fmtPrice(item.price_cny)}",
          style = PixelType.Mono,
          color = PixelColors.OrangeDeep,
        )
      }

      // 冷却提示单列红字（对齐 Web .wc-cool）
      if (!item.cooldownMsg.isNullOrBlank()) {
        Spacer(Modifier.height(6.dp))
        Text(
          text = item.cooldownMsg!!,
          style = PixelType.Small,
          color = PixelColors.RedDeep,
        )
      }

      Spacer(Modifier.height(10.dp))

      // 进度条：积分 / 目标
      val cost = item.points_cost
      val fraction = if (cost > 0) balance.toFloat() / cost.toFloat() else 1f
      PixelBar(
        fraction = fraction,
        modifier = Modifier.fillMaxWidth(),
        color = if (fraction >= 1f) PixelColors.Green else PixelColors.Orange,
      )
      Spacer(Modifier.height(4.dp))
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        Text(
          text = if (cost > 0) "${fmtNum(balance)} / ${fmtNum(cost)} 分" else "目标积分未设置",
          style = PixelType.Small,
          color = PixelColors.Ink3,
        )
        if (cost > 0) {
          Text(
            text = "${(fraction * 100).toInt().coerceAtMost(999)}%",
            style = PixelType.Small,
            color = PixelColors.Ink3,
          )
        }
      }

      Spacer(Modifier.height(12.dp))

      // 操作区：已扣分未收到 / 可兑换 / 不可兑换
      if (redemption != null) {
        // 后端 confirmed = 已扣分；撤回与「已收到」都走这个分支
        Row(
          modifier = Modifier.fillMaxWidth(),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          PixelChip(
            text = "已扣分 · ${fmtNum(redemption.points_locked)} 分",
            bg = PixelColors.GreenSoft,
            fg = PixelColors.GreenDeep,
          )
          Spacer(Modifier.weight(1f))
          PixelSmallButton(text = "撤回", onClick = onCancel, filled = false)
          Spacer(Modifier.width(8.dp))
          PixelSmallButton(text = "已收到", onClick = onDone, filled = true)
        }
      } else if (item.redeemable) {
        PixelButton(
          text = "兑换",
          onClick = onRedeem,
          modifier = Modifier.fillMaxWidth(),
          enabled = !busy,
        )
      } else {
        // 冷却中 / 差 N 分（具体差额，千分位），对齐 Web itemCard 的按钮
        val reason = if (!item.cooldownMsg.isNullOrBlank()) {
          "冷却中"
        } else {
          "差 ${fmtNum((item.points_cost - balance).coerceAtLeast(0))} 分"
        }
        PixelButton(
          text = reason,
          onClick = {},
          modifier = Modifier.fillMaxWidth(),
          enabled = false,
        )
      }
    }
  }
}

/** 兑换二次确认弹层（对齐 Web wish.js redeem 的 UI.sheet：确认兑换） */
@Composable
private fun RedeemConfirmSheet(
  item: WishItem,
  balance: Int,
  busy: Boolean,
  onDismiss: () -> Unit,
  onConfirm: () -> Unit,
) {
  val cost = item.points_cost
  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(Color(0x993B2E22))
      .clickable(
        interactionSource = null,
        indication = null,
        onClick = { if (!busy) onDismiss() },
      ),
    contentAlignment = Alignment.Center,
  ) {
    PixelPanel(modifier = Modifier.fillMaxWidth(0.9f)) {
      Column(
        modifier = Modifier
          .padding(16.dp)
          .verticalScroll(rememberScrollState())
          .clickable(interactionSource = null, indication = null, onClick = {}),
      ) {
        Text("确认兑换", style = PixelType.Title, color = PixelColors.Ink)
        Spacer(Modifier.height(14.dp))

        // 商品名 + 价格
        Row(verticalAlignment = Alignment.CenterVertically) {
          Text(item.emoji, style = PixelType.Big)
          Spacer(Modifier.width(10.dp))
          Column {
            Text(item.title, style = PixelType.Body, color = PixelColors.Ink)
            Text(
              text = "${fmtNum(cost)} 分 ≈ ¥${fmtPrice(item.price_cny)}",
              style = PixelType.Small,
              color = PixelColors.Ink2,
            )
          }
        }

        Spacer(Modifier.height(14.dp))

        // 当前余额 / 兑换后余额
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
        ) {
          Text("当前余额", style = PixelType.Small, color = PixelColors.Ink2)
          Text(fmtNum(balance), style = PixelType.Body, color = PixelColors.Ink)
        }
        Spacer(Modifier.height(6.dp))
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
        ) {
          Text("兑换后余额", style = PixelType.Small, color = PixelColors.Ink2)
          Text(fmtNum(balance - cost), style = PixelType.Body, color = PixelColors.GreenDeep)
        }

        Spacer(Modifier.height(12.dp))
        Text(
          text = "商品类兑换自己说了算，提交即扣分；买没买、花没花，对方看得见。",
          style = PixelType.Small,
          color = PixelColors.Ink3,
        )

        Spacer(Modifier.height(16.dp))
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
          PixelSmallButton(
            text = "再想想",
            onClick = { if (!busy) onDismiss() },
            filled = false,
            modifier = Modifier.weight(1f),
          )
          PixelButton(
            text = "兑换 · −${fmtNum(cost)} 分",
            onClick = { if (!busy) onConfirm() },
            modifier = Modifier.weight(1f),
            enabled = !busy,
          )
        }
      }
    }
  }
}

/** 新建 / 编辑弹层：标题、emoji 点选、描述、参考价、积分价、冷却天数、状态 */
@Composable
private fun WishEditor(
  editing: WishItem?,
  onDismiss: () -> Unit,
  onSave: (WishForm) -> Unit,
) {
  val context = LocalContext.current
  // 用 editing 初始化表单；editing 变化时重置
  var form by remember {
    mutableStateOf(
      if (editing == null) {
        WishForm()
      } else {
        WishForm(
          title = editing.title,
          emoji = editing.emoji,
          description = editing.description,
          priceText = fmtPrice(editing.price_cny),
          pointsText = editing.points_cost.toString(),
          cooldownDays = editing.cooldown_days,
          status = editing.status,
        )
      }
    )
  }

  // 覆盖全屏的遮罩 + 居中弹层（像素风自己画，不用 Material Dialog）
  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(Color(0x993B2E22))
      .clickable(interactionSource = null, indication = null, onClick = onDismiss),
    contentAlignment = Alignment.Center,
  ) {
    PixelPanel(modifier = Modifier.fillMaxWidth(0.9f)) {
      Column(
        modifier = Modifier
          .padding(16.dp)
          .verticalScroll(rememberScrollState())
          .clickable(interactionSource = null, indication = null, onClick = {}),
      ) {
        Text(
          text = if (editing == null) "新建愿望" else "编辑愿望",
          style = PixelType.Title,
          color = PixelColors.Ink,
        )
        Spacer(Modifier.height(14.dp))

        // 标题（≤30 字）
        Text("标题（30 字内）", style = PixelType.Small, color = PixelColors.Ink2)
        Spacer(Modifier.height(6.dp))
        PixelTextField(
          value = form.title,
          onValueChange = { v -> form = form.copy(title = v.take(30)) },
          placeholder = "想要什么，比如：蓝牙耳机",
          modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(12.dp))

        // emoji 点选（16 个，两行）
        Text("emoji", style = PixelType.Small, color = PixelColors.Ink2)
        Spacer(Modifier.height(6.dp))
        Column(modifier = Modifier.fillMaxWidth()) {
          for (row in WISH_EMOJIS.chunked(8)) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
            ) {
              for (e in row) {
                val selected = form.emoji == e
                Box(
                  modifier = Modifier
                    .background(if (selected) PixelColors.GreenSoft else PixelColors.Card)
                    .pixelBorder(2.dp, if (selected) PixelColors.GreenDeep else PixelColors.Outline)
                    .clickable(interactionSource = null, indication = null, onClick = { form = form.copy(emoji = e) })
                    .padding(4.dp),
                ) {
                  Text(e, style = PixelType.Body)
                }
              }
            }
            Spacer(Modifier.height(6.dp))
          }
        }

        Spacer(Modifier.height(6.dp))

        // 描述（≤300 字）
        Text("描述（可选，300 字内）", style = PixelType.Small, color = PixelColors.Ink2)
        Spacer(Modifier.height(6.dp))
        PixelTextField(
          value = form.description,
          onValueChange = { v -> form = form.copy(description = v.take(300)) },
          placeholder = "型号、颜色，写清楚一点",
          modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(12.dp))

        // 参考价 + 积分价：参考价驱动积分，积分价被手动改过后不再联动
        Row(modifier = Modifier.fillMaxWidth()) {
          Column(modifier = Modifier.weight(1f)) {
            Text("参考价（元）", style = PixelType.Small, color = PixelColors.Ink2)
            Spacer(Modifier.height(6.dp))
            PixelTextField(
              value = form.priceText,
              onValueChange = { v ->
                val next = form.copy(priceText = v)
                val p = v.trim().toDoubleOrNull()
                form = if (!form.pointsTouched && v.trim().isNotEmpty() && p != null) {
                  next.copy(pointsText = Math.round(p * 10).toInt().toString())
                } else {
                  next
                }
              },
              placeholder = "真实价格，比如 199",
              modifier = Modifier.fillMaxWidth(),
            )
          }
          Spacer(Modifier.width(10.dp))
          Column(modifier = Modifier.weight(1f)) {
            Text("积分价（自动 = 价×10）", style = PixelType.Small, color = PixelColors.Ink2)
            Spacer(Modifier.height(6.dp))
            PixelTextField(
              value = form.pointsText,
              onValueChange = { v -> form = form.copy(pointsText = v, pointsTouched = true) },
              placeholder = "自动换算",
              modifier = Modifier.fillMaxWidth(),
            )
          }
        }

        Spacer(Modifier.height(12.dp))

        // 冷却天数（0–365，0 = 不限制）
        Text("冷却期（兑换后 N 天不能再兑，0 = 不限制）", style = PixelType.Small, color = PixelColors.Ink2)
        Spacer(Modifier.height(6.dp))
        PixelTextField(
          value = if (form.cooldownDays > 0) form.cooldownDays.toString() else "",
          onValueChange = { v ->
            val n = v.trim().toIntOrNull() ?: 0
            form = form.copy(cooldownDays = n.coerceIn(0, 365))
          },
          placeholder = "0 = 无冷却",
          modifier = Modifier.fillMaxWidth(),
        )

        // 状态：仅编辑态（对齐 Web 的 freq-seg 上架/下架）
        if (editing != null) {
          Spacer(Modifier.height(12.dp))
          Text("状态", style = PixelType.Small, color = PixelColors.Ink2)
          Spacer(Modifier.height(6.dp))
          Row(modifier = Modifier.fillMaxWidth()) {
            for ((value, label) in listOf("active" to "上架", "archived" to "下架")) {
              val selected = form.status == value
              Box(
                modifier = Modifier
                  .weight(1f)
                  .background(if (selected) PixelColors.GreenSoft else PixelColors.Card)
                  .pixelBorder(2.dp, if (selected) PixelColors.GreenDeep else PixelColors.Outline)
                  .clickable(
                    interactionSource = null,
                    indication = null,
                    onClick = { form = form.copy(status = value) },
                  )
                  .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
              ) {
                Text(
                  text = label,
                  style = PixelType.Body,
                  color = if (selected) PixelColors.GreenDeep else PixelColors.Ink2,
                )
              }
            }
          }
        }

        Spacer(Modifier.height(12.dp))
        Text(
          text = "改价会记入历史，对方看得见。参考价别虚标，这是你们之间的信用。",
          style = PixelType.Small,
          color = PixelColors.Ink3,
        )

        Spacer(Modifier.height(16.dp))

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
        ) {
          PixelSmallButton(text = "取消", onClick = onDismiss, filled = false)
          PixelSmallButton(
            text = if (editing == null) "放上愿望单" else "保存",
            filled = true,
            onClick = {
              val title = form.title.trim()
              val price = form.priceText.trim().toDoubleOrNull() ?: 0.0
              val points = form.pointsText.trim().toIntOrNull()
                ?: Math.round(price * 10).toInt()
              when {
                title.isEmpty() ->
                  Toast.makeText(context, "先起个名字", Toast.LENGTH_SHORT).show()
                price <= 0.0 ->
                  Toast.makeText(context, "参考价要大于 0", Toast.LENGTH_SHORT).show()
                points < 1 ->
                  Toast.makeText(context, "积分价至少 1 分", Toast.LENGTH_SHORT).show()
                else -> onSave(
                  form.copy(
                    title = title,
                    priceText = price.toString(),
                    pointsText = points.toString(),
                  )
                )
              }
            },
          )
        }
      }
    }
  }
}

// ==================== 兑换记录 ====================

/** 兑换记录列表（对齐 Web 版 redRow）：emoji + 商品名 + 时间 + 锁定分 + 状态徽章 + 行操作 */
@Composable
private fun RedemptionList(
  redemptions: List<Redemption>,
  busyId: Long?,
  onCancel: (Redemption) -> Unit,
  onDone: (Redemption) -> Unit,
) {
  // 撤回前二次确认（对齐 Web UI.confirm）
  var pendingCancel by remember { mutableStateOf<Redemption?>(null) }
  PixelPanel(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp)) {
      Text("兑换记录", style = PixelType.Title, color = PixelColors.Ink)
      Spacer(Modifier.height(10.dp))
      for (r in redemptions) {
        val canCancel = r.status == "confirmed" && withinTwoHours(r.applied_at)
        val canDone = r.status == "confirmed"
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .dashedDivider()
            .padding(vertical = 8.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(r.item_emoji, style = PixelType.Title)
          Spacer(Modifier.width(8.dp))
          Column(modifier = Modifier.weight(1f)) {
            Text(r.item_title, style = PixelType.Body, color = PixelColors.Ink)
            Text(
              text = "${fmtTimeIso(r.applied_at)} · ${fmtNum(r.points_locked)} 分",
              style = PixelType.Small,
              color = PixelColors.Ink2,
            )
          }
          Column(horizontalAlignment = Alignment.End) {
            PixelChip(
              text = redStatus(r.status),
              bg = when (r.status) {
                "done" -> PixelColors.GreenSoft
                "cancelled", "expired" -> PixelColors.Bg2
                "confirmed" -> PixelColors.GreenSoft
                else -> PixelColors.OrangeSoft
              },
              fg = when (r.status) {
                "done" -> PixelColors.GreenDeep
                "cancelled", "expired" -> PixelColors.Ink3
                "confirmed" -> PixelColors.GreenDeep
                else -> PixelColors.OrangeDeep
              },
            )
            if (canCancel || canDone) {
              Spacer(Modifier.height(6.dp))
              Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (canCancel) {
                  PixelSmallButton(
                    text = "撤回",
                    onClick = { if (busyId == null) pendingCancel = r },
                    filled = false,
                  )
                }
                if (canDone) {
                  PixelSmallButton(
                    text = "已收到",
                    onClick = { if (busyId == null) onDone(r) },
                    filled = true,
                  )
                }
              }
            }
          }
        }
      }
      pendingCancel?.let { r ->
        PixelConfirmDialog(
          title = "撤回这次兑换？",
          message = "积分会退回余额。",
          okLabel = "撤回",
          cancelLabel = "再想想",
          onOk = {
            pendingCancel = null
            if (busyId == null) onCancel(r)
          },
          onCancel = { pendingCancel = null },
        )
      }
    }
  }
}

/** 兑换状态 → 中文（与 Web 一致，保持） */
private fun redStatus(status: String): String = when (status) {
  "applied" -> "待确认"
  "confirmed" -> "已扣分"
  "done" -> "已完成"
  "cancelled" -> "已取消"
  "expired" -> "已过期"
  else -> status
}

/** ISO 时间 → "M月d日 HH:mm"（上海时区，对齐 Web UI.fmtTimeIso） */
private fun fmtTimeIso(iso: String): String {
  if (iso.isBlank()) return ""
  return try {
    val t = java.time.Instant.parse(iso).atZone(java.time.ZoneId.of("Asia/Shanghai"))
    String.format("%d月%d日 %02d:%02d", t.monthValue, t.dayOfMonth, t.hour, t.minute)
  } catch (e: Exception) {
    ""
  }
}

/** applied_at 是否在 2 小时内（对齐 Web redRow 的撤回条件） */
private fun withinTwoHours(iso: String): Boolean {
  if (iso.isBlank()) return false
  return try {
    val t = java.time.Instant.parse(iso).toEpochMilli()
    System.currentTimeMillis() - t <= 2 * 3600 * 1000L
  } catch (e: Exception) {
    false
  }
}
