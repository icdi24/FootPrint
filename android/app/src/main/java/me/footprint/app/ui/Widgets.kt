package me.footprint.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import me.footprint.app.ui.theme.PixelColors
import me.footprint.app.ui.theme.PixelType

/*
 * 像素风控件：按钮、输入框、进度条、徽章。
 * 都用基础组件（Box / BasicTextField）自己画，不用 Material 的 Button、TextField，
 * 这样才有直角、2px 描边、下沉式硬投影。
 *
 * 按压效果：靠 MutableInteractionSource 收 PressInteraction，按下时整体下沉、硬投影消失。
 */

/** 主按钮：绿底白字，2px 深棕描边 + 落地硬影；按下时整体下沉 4px */
@Composable
fun PixelButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val sink: Dp = if (pressed && enabled) 4.dp else 0.dp
    val shadow: Dp = if (enabled && !pressed) 4.dp else 0.dp

    Box(
        modifier = modifier
            .pixelHardShadow(shadow, PixelColors.Outline)
            .offset(y = sink)
            .background(if (enabled) PixelColors.Green else PixelColors.LineStrong)
            .pixelBorder(2.dp, PixelColors.Outline)
            .clickable(
                enabled = enabled,
                interactionSource = interaction,
                // Compose 1.7+ 要求显式给 indication；传 null 表示不画默认水波纹（像素风自己画按压下沉）
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 20.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = PixelType.Body,
            color = if (enabled) PixelColors.White else PixelColors.Ink3,
        )
    }
}

/** 小号按钮：filled=true 绿底白字，false 白底棕字 */
@Composable
fun PixelSmallButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    filled: Boolean = true,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier = modifier
            .pixelHardShadow(if (pressed || !enabled) 0.dp else 3.dp, PixelColors.Outline)
            .offset(y = if (pressed && enabled) 3.dp else 0.dp)
            .background(if (!enabled) PixelColors.LineStrong else if (filled) PixelColors.Green else PixelColors.Card)
            .pixelBorder(2.dp, PixelColors.Outline)
            .clickable(
                enabled = enabled,
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(
            text = text,
            style = PixelType.Body,
            color = if (!enabled) PixelColors.Ink3 else if (filled) PixelColors.White else PixelColors.Ink,
        )
    }
}

/** 像素输入框：2px 描边、无圆角；占位符用弱化色，密码走 PasswordVisualTransformation。
 *  maxLength / singleLine / keyboardOptions 供表单校验与多行文本用，带默认值不破坏旧调用。 */
@Composable
fun PixelTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    isPassword: Boolean = false,
    maxLength: Int? = null,
    singleLine: Boolean = true,
    keyboardOptions: androidx.compose.foundation.text.KeyboardOptions = androidx.compose.foundation.text.KeyboardOptions.Default,
) {
    Box(
        modifier = modifier
            .background(PixelColors.Card)
            .pixelBorder(2.dp, PixelColors.Outline)
            .padding(horizontal = 12.dp, vertical = 12.dp)
    ) {
        if (value.isEmpty()) {
            Text(text = placeholder, style = PixelType.Body, color = PixelColors.Ink3)
        }
        BasicTextField(
            value = value,
            onValueChange = { v -> onValueChange(if (maxLength != null) v.take(maxLength) else v) },
            singleLine = singleLine,
            keyboardOptions = keyboardOptions,
            textStyle = PixelType.Body.copy(color = PixelColors.Ink),
            cursorBrush = SolidColor(PixelColors.Green),
            visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** 像素进度条：外壳 2px 描边，内层按比例填充的实心块 */
@Composable
fun PixelBar(
    fraction: Float,
    modifier: Modifier = Modifier,
    color: Color = PixelColors.Green,
) {
    val f = fraction.coerceIn(0f, 1f)
    Box(
        modifier = modifier
            .height(10.dp)
            .background(PixelColors.Bg2)
            .pixelBorder(2.dp, PixelColors.Outline)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(f)
                .height(6.dp)
                .background(color)
        )
    }
}

/** 直角小徽章：用来标"已同步 / 未同步" */
@Composable
fun PixelChip(
    text: String,
    modifier: Modifier = Modifier,
    bg: Color = PixelColors.OrangeSoft,
    fg: Color = PixelColors.OrangeDeep,
) {
    Box(
        modifier = modifier
            .background(bg)
            .pixelBorder(2.dp, fg)
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(text = text, style = PixelType.Small, color = fg)
    }
}

/** 通用二次确认弹窗（对齐 Web UI.confirm）：退出 / 解绑 / 回滚 / 通过验收 / 撤回共用 */
@Composable
fun PixelConfirmDialog(
    title: String,
    message: String,
    okLabel: String = "确定",
    cancelLabel: String = "再想想",
    onOk: () -> Unit,
    onCancel: () -> Unit,
) {
    Dialog(onDismissRequest = onCancel) {
        PixelPanel(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = title, style = PixelType.Title, color = PixelColors.Ink)
                Spacer(Modifier.height(10.dp))
                Text(text = message, style = PixelType.Body, color = PixelColors.Ink2)
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PixelSmallButton(
                        text = cancelLabel,
                        onClick = onCancel,
                        filled = false,
                        modifier = Modifier.weight(1f),
                    )
                    PixelButton(
                        text = okLabel,
                        onClick = onOk,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
