// 日报通知 + 时长补报 Worker（P2-#15 / #16）。
// A 档轻量方案（待办计划 1.7）：
//  - WorkManager 15 分钟周期拉 GET /api/diaries/today，当天日报一到就发一条通知、当天收工
//  - 不申请省电白名单、不挂前台服务、不常驻；Doze 下可能晚几十分钟，已接受
//  - 通知权限被拒：降级为 Web「我」页站内红点，Worker 照跑（数据补报不受影响）
//  - 同一个 Worker 顺带补报今天 + 昨天的使用时长（有使用情况访问权才做），填 usage_daily 缺口
package me.footprint.app.usage

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.footprint.app.MainActivity
import me.footprint.app.R
import me.footprint.app.net.Api
import me.footprint.app.net.Session

object DiarySync {

    private const val TAG = "DiarySync"
    private const val CHANNEL_ID = "diary"
    private const val NOTIF_ID = 1001

    /** 记「当天已通知过」的键 */
    private const val K_NOTIFIED_DATE = "diary_notified_date"

    /** 记「昨天已补报过」的键 */
    const val K_BACKFILLED_DATE = "usage_backfilled_date"

    /** 周期任务名 */
    const val WORK_NAME = "diary_sync"

    fun register(context: Context) {
        val req = androidx.work.PeriodicWorkRequestBuilder<DiaryWorker>(
            15, java.util.concurrent.TimeUnit.MINUTES,
        ).build()
        androidx.work.WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            req,
        )
    }

    fun notifiedDate(context: Context): String? =
        context.getSharedPreferences("footprint", Context.MODE_PRIVATE).getString(K_NOTIFIED_DATE, null)

    /** 通知权限（API 33+ 运行时申请；更低版本装上就有） */
    fun notificationsGranted(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    /** 发日报通知；权限被拒返回 false（降级为站内红点） */
    fun notifyDiary(context: Context, date: String, content: String): Boolean {
        if (!notificationsGranted(context)) return false
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "AI 日报", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "每天 23:30 由 zoowy 生成的日报"
                },
            )
        }
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("open_diary", true)
        }
        val pi = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val preview = content.take(120)
        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("今天的日报写好了 🐾")
            .setContentText(preview)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content.take(400)))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        nm.notify(NOTIF_ID, notif)
        context.getSharedPreferences("footprint", Context.MODE_PRIVATE)
            .edit().putString(K_NOTIFIED_DATE, date).apply()
        return true
    }
}

/** 15 分钟一次：补报时长（今天 + 昨天）→ 拉今日日报 → 当天第一条发通知 */
class DiaryWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    private val TAG = "DiaryWorker"

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val app = applicationContext
        val token = Session.token(app)
        try {
            // ---- 1. 补报使用时长（有权限才做；没有就什么都不报，绝不补 0）----
            if (token != null && UsageAccess.isGranted(app)) {
                runCatching { UsageReporter.reportNow(app, force = true) } // 今天（force：Worker 里无视 60 秒节流）
                val yesterday = java.time.LocalDate.now(UsageCollector.shanghai).minusDays(1).toString()
                val prefs = app.getSharedPreferences("footprint", Context.MODE_PRIVATE)
                if (prefs.getString(DiarySync.K_BACKFILLED_DATE, null) != yesterday) {
                    // 昨天整天的数据今天 0 点后仍能采到；报成功就记下，一天只补一次
                    val snap = UsageCollector.collect(app, daysBack = 1)
                    if (snap.granted && snap.apps.isNotEmpty()) {
                        runCatching { Api.report(snap.date, snap.apps, token) }
                        prefs.edit().putString(DiarySync.K_BACKFILLED_DATE, yesterday).apply()
                        Log.i(TAG, "补报昨天 ${snap.date}：${snap.apps.size} 个应用")
                    } else {
                        // 没采到数据（重启清了统计 / 真没玩）：也记一下，别每 15 分钟重跑
                        prefs.edit().putString(DiarySync.K_BACKFILLED_DATE, yesterday).apply()
                    }
                }
            }

            // ---- 2. 今日日报：有且当天没通知过 → 发通知（权限被拒 = 降级，靠 Web 红点）----
            if (token != null) {
                val today = UsageCollector.todayString()
                val already = DiarySync.notifiedDate(app) == today
                if (!already) {
                    val d = Api.getDiaryToday(token)
                    val diary = d.diary
                    if (diary != null && diary.diary_date == today && diary.content.isNotBlank()) {
                        DiarySync.notifyDiary(app, today, diary.content)
                    }
                }
            }
            Result.success(workDataOf("ok" to true))
        } catch (e: Exception) {
            // 401（会话过期）等失败：下次 15 分钟再试；不重试策略，周期任务天然会重跑
            Log.w(TAG, "DiaryWorker 失败：${e.message}")
            Result.retry()
        }
    }
}
