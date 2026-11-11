package me.footprint.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import me.footprint.app.R

/**
 * 像素风配色 · 星露谷木质皮肤（对齐 Web 版 app.css 的「木质像素皮肤」增量层）。
 *
 * 字体：Fusion Pixel 12px（与 Web 版同一套字体，woff2 转 ttf 打进 res/font）。
 * zh_hans 子集已包含全部拉丁字符，所以只需两个字重文件。
 */
val PixelFont: FontFamily = FontFamily(Font(R.font.fusion_pixel_zh))
val PixelFontMono: FontFamily = FontFamily(Font(R.font.fusion_pixel_mono_zh))

object PixelColors {
    val Bg = Color(0xFFF8EDD4)          // 暖羊皮纸地面（木质皮肤全局暖化）
    val Bg2 = Color(0xFFF0E1C1)         // 次级面板
    val Card = Color(0xFFFFFAEC)        // 卡片
    val Ink = Color(0xFF46382B)         // 正文深棕
    val Ink2 = Color(0xFF6E5C46)        // 次级文字
    val Ink3 = Color(0xFF7D6C56)        // 弱化文字（比 DESIGN 的 #8A7A62 略深，保住对比度）
    val Line = Color(0xFFE4D0A9)
    val LineStrong = Color(0xFFC9A875)
    val Outline = Color(0xFF6B452C)     // 2px 像素描边（木质皮肤：深木棕，替换旧深棕 #3B2E22）
    val Green = Color(0xFF3F7C37)       // 主色（主按钮仍为绿色，Web 木质皮肤未改）
    val GreenDeep = Color(0xFF2E6228)
    val GreenSoft = Color(0xFFE2EFDA)
    val Orange = Color(0xFFE8953C)
    val OrangeDeep = Color(0xFF8A4E0F)
    val OrangeSoft = Color(0xFFFBEDD5)
    val Red = Color(0xFFB44A40)
    val RedDeep = Color(0xFF93342B)
    val Gold = Color(0xFFF5C451)        // 星露谷金（金铆钉/金边）
    val White = Color(0xFFFFFFFF)

    // ---- 星露谷木质令牌（--sv-*）----
    val Wood = Color(0xFFB07D4E)        // 木色
    val WoodMid = Color(0xFFA2703F)     // 木色中间调
    val WoodDark = Color(0xFF6B452C)    // 深木色（面板/按钮边框）
    val WoodDeep = Color(0xFF4E3220)    // 更深木色
    val WoodLight = Color(0xFFE8C89A)   // 浅木色（导航栏木纹底）
    val Paper = Color(0xFFFFF8E7)       // 纸面
    val Berry = Color(0xFFD4675C)       // 浆果红（像素小花）
    val Leaf = Color(0xFF5C9E47)        // 叶绿（像素小花/藤蔓）
}

/** 字号只用 12 的整数倍（12 / 24 / 36），全部用 Fusion Pixel 像素字体（与 Web 版同款） */
object PixelType {
    val Body: TextStyle = TextStyle(fontSize = 14.sp, lineHeight = 22.sp, fontWeight = FontWeight.Medium, fontFamily = PixelFont)
    val Small: TextStyle = TextStyle(fontSize = 12.sp, lineHeight = 18.sp, fontFamily = PixelFont)
    val Title: TextStyle = TextStyle(fontSize = 20.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold, fontFamily = PixelFont)
    val Big: TextStyle = TextStyle(fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold, fontFamily = PixelFont)
    val Huge: TextStyle = TextStyle(fontSize = 36.sp, lineHeight = 44.sp, fontWeight = FontWeight.Bold, fontFamily = PixelFont)
    /** 数字/计数用的等宽样式（积分、完成数、时间），对应 Web 版的 FusionPixelMono */
    val Mono: TextStyle = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontFamily = PixelFontMono)
    /** 大号等宽数字：统计卡数值，对齐 Web .sc-val 的 24px 等宽 */
    val BigMono: TextStyle = TextStyle(fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold, fontFamily = PixelFontMono)
}

private val colorScheme = lightColorScheme(
    primary = PixelColors.Green,
    onPrimary = PixelColors.White,
    primaryContainer = PixelColors.Green,
    onPrimaryContainer = PixelColors.White,
    secondary = PixelColors.Orange,
    secondaryContainer = PixelColors.Orange,
    onSecondaryContainer = PixelColors.White,
    background = PixelColors.Bg,
    onBackground = PixelColors.Ink,
    surface = PixelColors.Card,
    onSurface = PixelColors.Ink,
    onSurfaceVariant = PixelColors.Ink3,
    outline = PixelColors.Outline,
    error = PixelColors.Red,
)

@Composable
fun FootprintTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(bodyLarge = PixelType.Body, bodyMedium = PixelType.Small),
        content = content,
    )
}
