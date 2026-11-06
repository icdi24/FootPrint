# 脚印 · Android App（M1）

只读手机各 App 使用时长，上报给现有后端，并能看到对方今天的时长。
**不包含锁机（M2）**，也不包含打卡/积分/愿望单（那些继续用 Web）。

方案定稿见仓库根目录 `手机版需求文档.md` 第 16 节；后端接口在 `app/src/routes/usage.js`。

---

## 1. 工程概况

| 项 | 值 |
|---|---|
| 语言 / UI | Kotlin + Jetpack Compose（Material3 只用了 `Text`/`Surface`/`MaterialTheme`，控件是自己画的像素风） |
| 包名 / `applicationId` | `me.footprint.app`（**定死了，不要再改**，改了等于换一个 App） |
| minSdk / targetSdk / compileSdk | 26 / 37 / 37 |
| 构建 | Gradle Kotlin DSL（`build.gradle.kts`） |
| 版本组合 | Gradle **9.6.0** + AGP **9.4.1** + Kotlin **2.2.10**（AGP 内置）+ JDK **17** |
| 网络 | OkHttp 4.12.0 + kotlinx.serialization 1.7.3（**不用 Retrofit**） |
| 本地存储 | 只有一个 `SharedPreferences`（会话 token、上次上报时间、未同步标记），不引数据库 |

## 2. 打开工程

1. 安装 **Android Studio**（本机在 `D:\Android Studio`，版本 2026.2.2）。
2. SDK 需要 **API 37**（本机已有，位于 `C:\Users\24587\AppData\Local\Android\Sdk`）。
3. `File → Open` 选本目录 `android/`（**不要**选仓库根目录）。
4. 第一次打开会自动下载 Gradle 9.6.0 + AGP（走你的代理，约几百 MB，耐心等）。

> ⚠️ 仓库里**故意没有 `gradle-wrapper.jar`**（二进制文件无法可靠地用文本方式生成），由 Android Studio 自动补。
> `local.properties` 本机已按实际环境生成了一份（含 `sdk.dir` 和 `backendUrl`）。
>
> **API 37 的硬性要求**：AGP 9.4.1 + Gradle ≥ 9.6.0（实测得到，不是网传的 9.3.1）。AGP 9 起 Kotlin 编译内置，**不要再加 `kotlin-android` 插件**（会冲突）；`kotlinOptions` 已废弃，改用顶层 `kotlin { compilerOptions { } }`（必须在 `android { }` 外面）。

## 3. 改后端地址（BASE_URL）

`BuildConfig.BASE_URL` **不写死在代码里**，从 `android/local.properties` 读：

```properties
# android/local.properties（不进 git）
sdk.dir=C\:\\Users\\你\\AppData\\Local\\Android\\Sdk
backendUrl=http://172.29.21.49:3201/
```

- 当前已按本机以太网 IP `172.29.21.49` + 后端端口 `3201` 配好（换网络后要改）。
- 不写 `backendUrl` 时默认是 `http://10.0.2.2:3000/` —— 这是**模拟器**访问"电脑本机"的固定地址。
- **末尾的 `/` 一定要留**，代码靠它拼相对路径。
- 改完要**重新 Sync / Rebuild**，`BuildConfig` 才会更新。

## 4. 真机怎么连电脑（90% 的问题都在这儿）

1. 手机和电脑连**同一个 Wi-Fi**（手机别开移动数据优先，别连 5G 热点但电脑没连）。
2. 在电脑上查局域网 IP：
   ```powershell
   ipconfig
   # 找 "无线局域网适配器 WLAN" 下面的 IPv4 地址，比如 192.168.1.8
   ```
3. 先在**手机上用浏览器**打开 `http://172.29.21.49:3201/healthz`：
   - 显示 `{"ok":true}` → 网络通了，可以继续；
   - 打不开 → 先解决网络：Windows 防火墙放行 3201 端口，或者确认后端是 `0.0.0.0` 而不是只绑了 `127.0.0.1`。
4. `local.properties` 里写 `backendUrl=http://172.29.21.49:3201/`，Sync 后重新装 App。

**不要在 `localhost` / `127.0.0.1` 上纠结**：那是手机自己，不是你的电脑。`10.0.2.2` 只在**模拟器**里有意义，真机上也是错的。

明文 HTTP：只在 **debug** 包放行（`app/src/debug/AndroidManifest.xml` 里的 `usesCleartextTraffic="true"`），release 包默认禁用，上线必须走 HTTPS。

## 5. 怎么跑

```bash
# 电脑上先把后端起来
cd app && npm start          # 或 docker compose up -d

# 手机：设置 → 关于手机 → 连点 7 次版本号 → 开发者选项里打开 USB 调试
adb devices                  # 能看到设备编号
```

Android Studio 点 ▶ 装到手机。首次进入：

1. 用网页版同一套账号登录（没有搭档账号后端会返回 404，对方卡片会显示"还没拿到 ta 的数据"）。
2. 首页会提示**还没开启使用情况访问** → 点「去开启」→ 系统设置里找到「脚印」打开 → 返回 App，状态会自动刷新。
3. 用一会儿手机，再回到脚印，首页会显示今天的总时长和 Top 5。

> 也可以直接在手机的「设置 → 应用 → 特殊应用权限 → 使用情况访问」里手动打开。

## 6. ⚠️ 使用时长在模拟器里恒为 0

核心功能**必须真机测**：

- 模拟器里的 `UsageStatsManager` 基本拿不到有意义的数据，时长永远是 0；
- 授权流程、切前后台上报在模拟器上也不能真实复现。

模拟器只适合看**布局、登录流程、接口是否通**（配合 `10.0.2.2:3000`）。

## 7. 代码结构

```
android/
  settings.gradle.kts            仓库源、模块、rootProject 名
  build.gradle.kts               插件版本（AGP / Kotlin / compose / serialization）
  gradle.properties              AndroidX、Kotlin 代码风格
  gradle/wrapper/gradle-wrapper.properties   Gradle 8.9（无 jar）
  app/
    build.gradle.kts             命名空间、SDK、BASE_URL(buildConfigField)、依赖
    proguard-rules.pro
    src/main/AndroidManifest.xml            INTERNET + PACKAGE_USAGE_STATS
    src/debug/AndroidManifest.xml           仅 debug：usesCleartextTraffic
    src/main/res/                           启动主题、图标（矢量像素爪印）
    src/main/java/me/footprint/app/
      MainActivity.kt            入口；onStart/onStop 上报；LifecycleEventObserver 刷新
      net/Session.kt             SharedPreferences（token / 上次上报时间 / 未同步标记）
      net/Api.kt                 OkHttp 单例 + 手写 Cookie + kotlinx.serialization 数据类
      usage/UsageAccess.kt       AppOpsManager 检测 + 跳系统设置
      usage/UsageCollector.kt    UsageStatsManager 查询（上海时区 0 点、过滤、Top 60）
      usage/UsageReporter.kt     上报 + 60 秒节流 + 失败标记
      ui/AppViewModel.kt         登录、刷新、上报状态、时长格式化
      ui/Screens.kt              登录页、主页（空态 / 我的 / 对方的）
      ui/Widgets.kt              像素按钮、输入框、进度条、徽章
      ui/Pixel.kt                硬投影、描边、羊皮纸点阵背景
      ui/theme/Theme.kt          DESIGN.md 的配色与字号
```

## 8. 关键实现说明（踩坑点）

**时区**：后端按 `Asia/Shanghai` 判定"今天"。App 也用 `ZoneId.of("Asia/Shanghai")` 算今天 0 点的毫秒值去 `queryUsageStats`，**不用设备时区**（手机时区可能不是 +8，否则会多算或漏算）。

**Cookie**：登录响应里的 `Set-Cookie: fp_session=...` 由内存 `CookieJar` 接住，值落进 `SharedPreferences`；之后每个请求手动加 `Cookie: fp_session=...` 头。不依赖 OkHttp 的自动持久化。

**上报时机**：`MainActivity.onStart`（进前台）和 `onStop`（切后台）各报一次当日**累计**。后端是覆盖写（`ON CONFLICT DO UPDATE`），同一天报多次结果一样。

**节流**：距上次**成功**上报 < 60 秒直接跳过；失败不抛异常、不卡界面，只置一个"未同步"标记，下次进前台自动重试。

**"没授权不显示 0"**：`UsageCollector.Result.granted == false` 时 UI 走空态卡片，绝不显示 `0 分钟`。

## 9. 已知需要真机 / Android Studio 验证的点

- 首次用 Android Studio 打开能否顺利 Sync（本机无 Android SDK，未编译验证）。
- 真机上「使用情况访问」设置页在不同 ROM（小米/华为/OPPO）的跳转是否直达，少数 ROM 会落到应用详情页（代码里有兜底）。
- 自己的时长与系统「数字健康」的偏差是否在 5 分钟内（验收标准 16.8 第 2 条）。
- 对方页数据是否能在 30 秒内看到更新（取决于两边都打开过 App）。
- 断网重试的实际表现。
