package me.footprint.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType

/** 底部 5 个 Tab，与 Web 版底部导航一一对应 */
enum class MainTab(val label: String, val icon: String) {
    Home("今天", "🏠"),
    Goals("目标", "◎"),
    Wish("愿望单", "🎁"),
    Partner("我们", "👫"),
    Me("我的", "👤"),
}

/**
 * 主脚手架：底部 Tab 导航 + 5 个页面切换。
 * 各页面是独立的 Composable（GoalsScreen / WishScreen / PartnerScreen / MeScreen），
 * 分别写在各自的文件里，由这里统一组装。
 */
@Composable
fun MainScaffold(
    vm: AppViewModel,
    onOpenUsageSettings: () -> Unit,
) {
    var tab by rememberSaveable { mutableStateOf(MainTab.Home) }
    val chatUnread by vm.chatUnread.collectAsStateWithLifecycle()

    Box(modifier = Modifier.fillMaxSize().background(PixelColors.Bg)) {
        Column(modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.weight(1f)) {
                when (tab) {
                    MainTab.Home -> HomeScreen(vm = vm, onOpenUsageSettings = onOpenUsageSettings)
                    MainTab.Goals -> GoalsScreen(vm = vm)
                    MainTab.Wish -> WishScreen(vm = vm)
                    MainTab.Partner -> PartnerScreen(vm = vm, onOpenUsageSettings = onOpenUsageSettings)
                    MainTab.Me -> MeScreen(vm = vm)
                }
            }
            BottomTabBar(current = tab, onSelect = { tab = it }, chatUnread = chatUnread)
        }
    }
}

@Composable
private fun BottomTabBar(current: MainTab, onSelect: (MainTab) -> Unit, chatUnread: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PixelColors.WoodLight)
            .woodGrain()
            .pixelBorderTop(),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        for (t in MainTab.entries) {
            val selected = t == current
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = { onSelect(t) },
                    )
                    .padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // 激活态：绿色滑块 + 金边（对齐 Web 木质皮肤的 tab-slider）
                Box(
                    modifier = Modifier
                        .height(6.dp)
                        .fillMaxWidth(0.4f)
                        .then(
                            if (selected) Modifier
                                .background(PixelColors.Green)
                                .pixelBorder(2.dp, PixelColors.Gold)
                            else Modifier.background(PixelColors.WoodLight)
                        ),
                )
                // 图标 + 未读红点角标（「我们」tab 的搭子私聊未读）
                Box {
                    androidx.compose.material3.Text(
                        text = t.icon,
                        style = PixelType.Body,
                        color = if (selected) PixelColors.GreenDeep else PixelColors.Ink2,
                    )
                    if (t == MainTab.Partner && chatUnread > 0) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset(x = 8.dp, y = (-4).dp)
                                .background(PixelColors.Red)
                                .pixelBorder(2.dp, PixelColors.Outline)
                                .padding(horizontal = 3.dp, vertical = 1.dp),
                        ) {
                            androidx.compose.material3.Text(
                                text = if (chatUnread > 99) "99+" else chatUnread.toString(),
                                style = PixelType.Small,
                                color = PixelColors.White,
                            )
                        }
                    }
                }
                androidx.compose.material3.Text(
                    text = t.label,
                    style = PixelType.Small,
                    color = if (selected) PixelColors.GreenDeep else PixelColors.Ink2,
                )
            }
        }
    }
}

/** 底部 Tab 顶部一条 3px 深木描边（对齐 Web 木质皮肤 tabbar border-top） */
private fun Modifier.pixelBorderTop(): Modifier = this.then(
    Modifier.drawBehind {
        drawRect(
            color = PixelColors.WoodDark,
            size = Size(size.width, 3.dp.toPx()),
        )
    }
)

/** 木纹：横向细纹 + 顶部奶油高光（对齐 Web tabbar 的 repeating-linear-gradient） */
private fun Modifier.woodGrain(): Modifier = this.then(
    Modifier.drawBehind {
        val dark = PixelColors.WoodDark.copy(alpha = 0.10f)
        var y = 2.dp.toPx()
        while (y < size.height) {
            drawRect(
                color = dark,
                topLeft = Offset(0f, y),
                size = Size(size.width, 2.dp.toPx()),
            )
            y += 8.dp.toPx()
        }
        // 顶部奶油高光
        drawRect(
            color = PixelColors.White.copy(alpha = 0.55f),
            size = Size(size.width, 3.dp.toPx()),
        )
    }
)
