# 暖星 · 桌面宠物

> 仓库：https://github.com/dongyliang748-coder/nuanxing-desktop-pet

一只常驻在桌面右下角的 Q 版陪伴宠物。素材沿用你原来的「暖星」v2 精灵表，动画节奏按资产清单里的逐帧时长 1:1 还原。

## 快速开始

**双击 `暖星-便携版.exe`**（在 `dist/` 里）即可运行，不需要安装 Node，也不需要 Electron。
把这个 exe 拷到任何位置都能直接跑。

也可以命令行启动：

```bash
cd nuanxing-pet
npm start
```

> 注意：如果当前 shell 里存在 `ELECTRON_RUN_AS_NODE=1`（某些工具链会设置），需要先 `unset`，否则 Electron 会以纯 Node 模式启动并报 `app is undefined`。`启动暖星.cmd` 已经处理了这一点。

## 怎么玩

| 操作 | 暖星的反应 |
|---|---|
| 鼠标在屏幕上移动 | **16 方向视线跟随**，暖星会转头看你的光标 |
| 按住拖动 | 拖到哪儿跟到哪儿，左右拖动分别播放 `running-right` / `running-left` |
| 单击 | 随机做出挥手 / 跳跃 / 呈现结果的反应，并说一句话 |
| 双击 | 跳一下 |
| 右键 | 打开菜单：摸头、喂食、聊天、随便动动、提醒设置、躲一会儿、退出 |

宠物窗口是**点击穿透**的：鼠标不在暖星身上时，点击会直接落到下面的桌面和窗口，不会挡你的操作。

托盘图标（与原图同一张脸）可随时把暖星叫出来或让它躲起来。

## 定时提醒

默认开启四条，右键菜单 → 提醒设置 可单独开关：

| 项目 | 频率 | 默认文案 |
|---|---|---|
| 喝水 | 每 45 分钟 | 该喝水啦，去接一杯温水吧 ~ |
| 久坐 | 每 60 分钟 | 坐了一个小时咯，站起来走两步 |
| 下班 | 每天 18:30 | 到点下班啦，今天也辛苦啦 |
| 晚间复盘 | 每天 22:00 | 十点了，回顾一下今天做的事吧 |

触发时暖星会挥手 + 弹气泡，同时发一条系统通知。

## 让它开口说话（接入大模型）

编辑配置文件 `%APPDATA%\Nuanxing\user-config.json`
（托盘图标右键 → 打开配置文件最省事）：

```json
{
  "llm": {
    "enabled": true,
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-你的key",
    "model": "gpt-4o-mini"
  }
}
```

`baseUrl` 填任何 OpenAI 兼容接口都行（DeepSeek、通义、Kimi、本地 Ollama 的 `http://localhost:11434/v1` 均可）。配好后右键 → 陪我聊天，输入框里回车发送，回复会显示在气泡里。

`systemPrompt` 已经按你的作息写好了（芯片行业、容易熬夜久坐），可以自己改。

## 其他配置项

| 字段 | 说明 |
|---|---|
| `petName` | 显示名，用于通知标题 |
| `scale` | 缩放，1 为原始尺寸（192×208），想大一点填 1.3 |
| `alwaysOnTop` | 是否始终置顶 |
| `bubbleEnabled` | 设为 `false` 可关掉气泡，只留动作 |

改完重启生效。窗口位置会自动记住。

配置放在 `%APPDATA%\Nuanxing` 而不是 exe 同级目录，是为了让开发模式和打包版本共用一份设置，
以后 exe 换了新版本也不会丢配置。

## 开机自启

exe 首次启动会自动写入注册表启动项，托盘菜单里可以随时开关。

- 注册表位置：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- 项名：`electron.app.暖星`
- 值：指向 `暖星-便携版.exe` 本体

> **便携版 exe 移动了位置，自启就会失效**，需要在新位置重新启动一次让它更新注册表。
> 想彻底避免这个问题，可以把它放到一个固定目录（例如 `D:\Tools\暖星\`）。

如果不想用注册表，也可以在
`C:\Users\<你>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`
下放一个指向 exe 的快捷方式，效果一样。

> 开发模式（`npm start`）不会写注册表——那时 `process.execPath` 指向 electron.exe，写了没意义。

## 精灵表规格

`assets/spritesheet.png` 为 1536×2288，8 列 × 11 行，单元格 192×208，共 73 个有效帧。

| 行 | 状态 | 帧数 | 用途 |
|---|---|---|---|
| 0 | idle | 6 | 待机呼吸/眨眼 |
| 1 | running-right | 8 | 向右移动 |
| 2 | running-left | 8 | 向左移动 |
| 3 | waving | 4 | 打招呼 |
| 4 | jumping | 5 | 跳跃 |
| 5 | failed | 8 | 失败反应 |
| 6 | waiting | 6 | 等待中 |
| 7 | running | 6 | 处理中 |
| 8 | review | 6 | 呈现结果 |
| 9 | look | 8 | 视线 000°→157.5° |
| 10 | look | 8 | 视线 180°→337.5° |

原表 SHA-256：`6d47b076731878061bc80a398e743afa68b690001584410545a1ef928066a94e`

## 目录结构

```
nuanxing-pet/
├── 暖星-便携版.exe       # dist/ 下，双击即用
├── 启动暖星.cmd          # 开发模式启动
├── main.js               # 主进程：窗口、拖拽、视线、提醒、大模型代理、托盘
├── preload.js            # 安全的 IPC 桥
├── src/
│   ├── index.html
│   ├── style.css         # 气泡 / 菜单 / 输入框样式
│   └── pet.js            # 精灵图动画引擎 + 交互
├── assets/
│   ├── spritesheet.png   # 暖星精灵表
│   └── icon.ico          # 由精灵表首帧生成的 Windows 图标
└── scripts/make-icon.js  # 重新生成 icon.ico

# 运行时配置在 %APPDATA%\Nuanxing\user-config.json（首次启动自动生成）
```

## 重新打包

```bash
npm run build              # 便携版 exe，输出到 dist/
npm run build:installer    # NSIS 安装包（需要先在 package.json 里改 target）
npm run icon               # 重新生成 assets/icon.ico
```

## 自检

```bash
node_modules/electron/dist/electron.exe . --selfcheck
```

会依次切到 idle / review / look / menu 四个状态截图后自动退出，用来确认渲染没问题。

## 后续可加

- 换装 / 多角色切换
- 绑定系统状态（CPU 占用、番茄钟）驱动状态动画
- NSIS 安装包形态（目前默认是便携版）
