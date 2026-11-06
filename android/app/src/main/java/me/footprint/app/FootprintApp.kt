// Application：启动时注册 15 分钟周期 Worker（P2-#15/#16）。
// 不挂前台服务、不常驻；WorkManager 自己安排（Doze 下可能延迟几十分钟，A 档已接受）。
package me.footprint.app

import android.app.Application
import me.footprint.app.usage.DiarySync

class FootprintApp : Application() {
    override fun onCreate() {
        super.onCreate()
        DiarySync.register(this)
    }
}
