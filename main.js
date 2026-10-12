/**
 * 暖星 · 桌面宠物 —— 主进程
 *
 * 职责：
 *  1. 创建透明、无边框、置顶、可点击穿透的宠物窗口
 *  2. 用屏幕级鼠标轮询实现「无边界拖拽」和「16 方向视线跟随」
 *  3. 定时提醒调度（喝水 / 久坐 / 下班 / 晚间复盘）
 *  4. 代理大模型对话请求（避免渲染层跨域）
 *  5. 托盘、位置记忆、开机自启
 */
'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  Notification,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

// ---------- 雪碧图规格（来自暖星 v2 资产清单，勿随意改动） ----------
const CELL_W = 192;
const CELL_H = 208;

// 配置放在 %APPDATA%\Nuanxing：开发模式与打包后的 exe 共用一份，重装 exe 也不丢设置
const CONFIG_DIR = path.join(app.getPath('appData'), 'Nuanxing');
const CONFIG_PATH = path.join(CONFIG_DIR, 'user-config.json');
const SPRITESHEET = path.join(__dirname, 'assets', 'spritesheet.png');

const DEFAULT_CONFIG = {
  petName: '暖星',
  scale: 1,
  alwaysOnTop: true,
  autoLaunch: true,
  lastPos: null,
  // 表情/互动积累的小状态
  bond: 0,
  llm: {
    enabled: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    systemPrompt:
      '你是「暖星」，一只安静的桌面陪伴宠物。说话简短、温柔、有分寸，一般不超过 40 字。你陪伴的人容易熬夜、久坐，可以偶尔温和地提醒喝水、站起来走走，但不要唠叨。',
  },
  reminders: {
    water: { enabled: true, everyMinutes: 45, message: '该喝水啦，去接一杯温水吧 ~' },
    sedentary: { enabled: true, everyMinutes: 60, message: '坐了一个小时咯，站起来走两步' },
    offwork: { enabled: true, atTime: '18:30', message: '到点下班啦，今天也辛苦啦' },
    review: { enabled: true, atTime: '22:00', message: '十点了，回顾一下今天做的事吧' },
  },
};

// ---------- 配置读写 ----------
function deepMerge(base, override) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    const b = base[key];
    const o = override[key];
    if (b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object') {
      out[key] = deepMerge(b, o);
    } else if (o !== undefined) {
      out[key] = o;
    }
  }
  return out;
}

let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

function loadConfig() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    } else {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      config = deepMerge(DEFAULT_CONFIG, raw);
    }
  } catch (err) {
    console.error('[暖星] 读取配置失败，使用默认配置：', err.message);
  }
  return config;
}

function saveConfig() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[暖星] 保存配置失败：', err.message);
  }
}

// ---------- 窗口几何 ----------
const scale = () => (typeof config.scale === 'number' && config.scale > 0 ? config.scale : 1);

let win = null;
let tray = null;
let petBox = { x: 0, y: 0, w: CELL_W, h: CELL_H };
let windowSize = { w: 320, h: 400 };
let ignoreMouse = null;

function computeGeometry() {
  const s = scale();
  const petW = Math.round(CELL_W * s);
  const petH = Math.round(CELL_H * s);
  // 窗口比宠物大一圈：上方留给气泡和菜单，左右留一点余量
  const w = Math.max(petW + 128, 300);
  const h = petH + 210;
  windowSize = { w, h };
  petBox = {
    x: Math.round((w - petW) / 2),
    y: h - petH - 8,
    w: petW,
    h: petH,
  };
  return { windowSize, petBox };
}

function defaultPosition() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  return {
    x: Math.round(area.width - windowSize.w - 24),
    y: Math.round(area.height - windowSize.h - 24),
  };
}

// ---------- 创建窗口 ----------
function createWindow() {
  computeGeometry();
  const pos = config.lastPos && Number.isFinite(config.lastPos.x) ? config.lastPos : defaultPosition();

  win = new BrowserWindow({
    width: windowSize.w,
    height: windowSize.h,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: config.alwaysOnTop !== false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (config.alwaysOnTop !== false) {
    win.setAlwaysOnTop(true, 'screen-saver');
  }
  win.setMenuBarVisibility(false);

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    // 初始让空白区域穿透到桌面；鼠标进入宠物范围时由轮询自动接管
    applyIgnoreMouse(true);
    startLookLoop();
    startInteractiveLoop();
  });

  win.on('moved', persistPosition);
  win.on('closed', () => {
    win = null;
  });

  return win;
}

function persistPosition() {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  config.lastPos = { x, y };
  saveConfig();
}

function applyIgnoreMouse(next) {
  if (!win || win.isDestroyed()) return;
  if (next === ignoreMouse) return;
  ignoreMouse = next;
  // forward: true 让窗口在被穿透时仍能收到 mousemove
  win.setIgnoreMouseEvents(next, { forward: true });
}

// ---------- 点击穿透裁决 ----------
// 主进程掌握屏幕级鼠标坐标，由它统一决定什么时候接管鼠标，
// 比依赖渲染层事件更可靠（穿透状态下渲染层可能收不到事件）。
let uiOpen = false;
let interactiveTimer = null;

function startInteractiveLoop() {
  if (interactiveTimer) return;
  interactiveTimer = setInterval(updateInteractive, 60);
}

function updateInteractive() {
  if (!win || win.isDestroyed()) return;
  let interactive = uiOpen;
  if (!interactive) {
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    const pad = 6;
    interactive =
      cursor.x >= wx + petBox.x - pad &&
      cursor.x <= wx + petBox.x + petBox.w + pad &&
      cursor.y >= wy + petBox.y - pad &&
      cursor.y <= wy + petBox.y + petBox.h + pad;
  }
  applyIgnoreMouse(!interactive);
}

// ---------- 拖拽 ----------
let dragTimer = null;
let dragOffset = { x: 0, y: 0 };
let dragLastX = null;

function startDrag() {
  if (!win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragOffset = { x: cursor.x - wx, y: cursor.y - wy };
  dragLastX = cursor.x;
  stopDrag();
  dragTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return stopDrag();
    const c = screen.getCursorScreenPoint();
    const nx = Math.round(c.x - dragOffset.x);
    const ny = Math.round(c.y - dragOffset.y);
    win.setPosition(nx, ny);

    // 根据水平位移决定奔跑方向：窗口向右 → running-right
    if (dragLastX !== null) {
      const dx = c.x - dragLastX;
      if (Math.abs(dx) >= 1) {
        send('pet:anim', dx > 0 ? 'running-right' : 'running-left');
      }
    }
    dragLastX = c.x;
  }, 16);
}

function stopDrag() {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  dragLastX = null;
}

// ---------- 视线跟随（16 方向） ----------
let lookTimer = null;
let lastLookIndex = -1;
let lookEnabled = true;

function startLookLoop() {
  if (lookTimer) return;
  lookTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !lookEnabled || dragTimer) return;
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    const cx = wx + petBox.x + petBox.w / 2;
    const cy = wy + petBox.y + petBox.h / 2;
    const dx = cursor.x - cx;
    const dy = cursor.y - cy;
    if (Math.hypot(dx, dy) < 40) return; // 太近就不追
    // 素材 000° = 正上方，顺时针递增
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const index = Math.round(deg / 22.5) % 16;
    if (index !== lastLookIndex) {
      lastLookIndex = index;
      send('pet:look', index);
    }
  }, 90);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

// ---------- 定时提醒 ----------
const reminderFired = {};
let reminderTimer = null;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function checkReminders() {
  const now = new Date();
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const list = config.reminders || {};

  for (const [id, item] of Object.entries(list)) {
    if (!item || item.enabled === false) continue;

    if (item.everyMinutes > 0) {
      const key = `every:${id}`;
      const last = reminderFired[key] || Date.now();
      if (Date.now() - last >= item.everyMinutes * 60 * 1000) {
        reminderFired[key] = Date.now();
        fireReminder(id, item.message);
      }
      continue;
    }

    if (item.atTime) {
      const key = `at:${id}:${today}:${item.atTime}`;
      if (hhmm === item.atTime && !reminderFired[key]) {
        reminderFired[key] = true;
        fireReminder(id, item.message);
      }
    }
  }
}

function fireReminder(id, message) {
  if (!message) return;
  send('pet:remind', { id, message });
  try {
    if (Notification.isSupported()) {
      new Notification({ title: config.petName || '暖星', body: message, silent: false }).show();
    }
  } catch (err) {
    console.error('[暖星] 通知发送失败：', err.message);
  }
}

function startReminders() {
  for (const [id, item] of Object.entries(config.reminders || {})) {
    if (item && item.enabled !== false && item.everyMinutes > 0) {
      reminderFired[`every:${id}`] = Date.now();
    }
  }
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(checkReminders, 20000);
}

// ---------- 大模型对话 ----------
function requestChat(messages) {
  return new Promise((resolve, reject) => {
    const llm = config.llm || {};
    if (!llm.enabled || !llm.apiKey) {
      reject(new Error('还没配置模型。右键暖星 → 打开配置文件，在 llm 里填上 apiKey 再把 enabled 改成 true。'));
      return;
    }
    const base = String(llm.baseUrl || '').replace(/\/+$/, '');
    if (!base) {
      reject(new Error('llm.baseUrl 为空'));
      return;
    }
    const url = new URL(`${base}/chat/completions`);
    const payload = JSON.stringify({
      model: llm.model || 'gpt-4o-mini',
      messages,
      temperature: 0.8,
      max_tokens: 400,
    });
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llm.apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 60000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.error) {
              reject(new Error(json.error.message || '接口返回错误'));
              return;
            }
            const text = json.choices?.[0]?.message?.content;
            if (!text) {
              reject(new Error('接口没有返回内容'));
              return;
            }
            resolve(String(text).trim());
          } catch (err) {
            reject(new Error(`解析响应失败：${body.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---------- 开机自启 ----------
// 只有打包后的 exe 才写注册表：开发模式下 process.execPath 指向 electron.exe，写了没意义。
// 便携版每次运行会解压到临时目录，process.execPath 是那个临时路径，
// 直接写进注册表重启后就失效了；真正的目标是便携版 exe 本体（electron-builder 通过环境变量告知）。
function launchTarget() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function syncLoginItem() {
  if (!app.isPackaged) return;
  const target = launchTarget();
  try {
    app.setLoginItemSettings({
      openAtLogin: !!config.autoLaunch,
      path: target,
      args: [],
    });
    const state = app.getLoginItemSettings({ path: target });
    console.log('[暖星] 自启目标 =', target);
    console.log('[暖星] 注册表 openAtLogin =', state.openAtLogin);
  } catch (err) {
    console.error('[暖星] 开机自启设置失败：', err.message);
  }
}

// ---------- 托盘 ----------
function buildTrayImage() {
  try {
    const sheet = nativeImage.createFromPath(SPRITESHEET);
    if (sheet.isEmpty()) return nativeImage.createEmpty();
    const frame = sheet.crop({ x: 0, y: 0, width: CELL_W, height: CELL_H });
    return frame.resize({ width: 32, height: 32, quality: 'best' });
  } catch (err) {
    console.error('[暖星] 托盘图标生成失败：', err.message);
    return nativeImage.createEmpty();
  }
}

function createTray() {
  try {
    tray = new Tray(buildTrayImage());
  } catch (err) {
    console.error('[暖星] 创建托盘失败：', err.message);
    return;
  }
  tray.setToolTip(`${config.petName || '暖星'} · 桌面宠物`);
  tray.on('click', () => toggleVisible());
}

function refreshTrayMenu() {
  if (!tray) return;
  const visible = !!(win && !win.isDestroyed() && win.isVisible());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: visible ? '让暖星躲一会儿' : '叫暖星出来', click: () => toggleVisible() },
      {
        label: '打个招呼',
        click: () => {
          showWindow();
          send('pet:anim', 'waving');
          send('pet:say', { text: '我在呢 ~', duration: 4000 });
        },
      },
      { type: 'separator' },
      {
        label: '提醒设置',
        submenu: Object.entries(config.reminders || {}).map(([id, item]) => ({
          label: `${labelOfReminder(id)}（${item.enabled === false ? '已关' : '开启'}）`,
          click: () => {
            item.enabled = item.enabled === false;
            saveConfig();
            refreshTrayMenu();
            send('pet:say', {
              text: `${labelOfReminder(id)}提醒已${item.enabled ? '开启' : '关闭'}`,
              duration: 3000,
            });
          },
        })),
      },
      {
        label: '打开配置文件',
        click: () => {
          if (!fs.existsSync(CONFIG_PATH)) saveConfig();
          shell.openPath(CONFIG_PATH);
        },
      },
      {
        label: '开机自动启动',
        type: 'checkbox',
        checked: !!config.autoLaunch,
        click: (item) => {
          config.autoLaunch = item.checked;
          saveConfig();
          syncLoginItem();
        },
      },
      { type: 'separator' },
      { label: '退出暖星', click: () => app.quit() },
    ])
  );
}

function labelOfReminder(id) {
  return (
    {
      water: '喝水',
      sedentary: '久坐',
      offwork: '下班',
      review: '晚间复盘',
    }[id] || id
  );
}

function toggleVisible() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isVisible()) {
    win.hide();
  } else {
    showWindow();
  }
  refreshTrayMenu();
}

function showWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  win.show();
  if (config.alwaysOnTop !== false) win.setAlwaysOnTop(true, 'screen-saver');
  refreshTrayMenu();
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('pet:getConfig', () => ({
    config,
    windowSize,
    petBox,
  }));

  ipcMain.handle('pet:setConfig', (_event, patch) => {
    config = deepMerge(config, patch || {});
    saveConfig();
    refreshTrayMenu();
    return config;
  });

  ipcMain.handle('pet:chat', async (_event, text) => {
    const history = Array.isArray(chatHistory) ? chatHistory : [];
    const messages = [{ role: 'system', content: config.llm.systemPrompt }, ...history, { role: 'user', content: text }];
    const reply = await requestChat(messages);
    chatHistory = [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }].slice(-12);
    return reply;
  });

  ipcMain.on('pet:uiState', (_event, value) => {
    uiOpen = !!value;
    updateInteractive();
  });
  ipcMain.on('pet:dragStart', () => startDrag());
  ipcMain.on('pet:dragEnd', () => {
    stopDrag();
    persistPosition();
  });
  ipcMain.on('pet:setLookEnabled', (_event, value) => {
    lookEnabled = !!value;
  });
  ipcMain.on('pet:resize', () => {
    computeGeometry();
    if (win && !win.isDestroyed()) {
      win.setSize(windowSize.w, windowSize.h);
      win.webContents.send('pet:geometry', { windowSize, petBox });
    }
  });
  ipcMain.on('pet:hide', () => toggleVisible());
  ipcMain.on('pet:quit', () => app.quit());
  ipcMain.on('pet:openConfig', () => {
    if (!fs.existsSync(CONFIG_PATH)) saveConfig();
    shell.openPath(CONFIG_PATH);
  });
  ipcMain.on('pet:notify', (_event, payload) => {
    if (payload && payload.body) fireReminder(payload.id || 'custom', payload.body);
  });
}

let chatHistory = [];

// ---------- 生命周期 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(() => {
    loadConfig();
    syncLoginItem();
    registerIpc();
    createWindow();
    createTray();
    startReminders();

    // 自检模式：依次切到几个状态截图再退出，用于验证渲染是否正确
    if (process.argv.includes('--selfcheck')) {
      const shots = [
        ['idle', 'play("idle", true); say("待机呼吸中", 30000);'],
        ['review', 'play("review", true); say("结果出来啦", 30000);'],
        ['look', 'play("idle", true); lookIndex = 4; lookActive = true; render(); say("视线跟随：正右", 30000);'],
        ['menu', 'openMenu(16, 16);'],
      ];
      // 打包后 __dirname 落在只读的 app.asar 里，截图要写到别处
      const shotDir = app.isPackaged ? os.tmpdir() : __dirname;
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 3500));
        for (const [name, js] of shots) {
          try {
            await win.webContents.executeJavaScript(js);
            await new Promise((resolve) => setTimeout(resolve, 800));
            const image = await win.capturePage();
            const target = path.join(shotDir, `selfcheck-${name}.png`);
            fs.writeFileSync(target, image.toPNG());
            console.log('[自检] 已保存', target);
          } catch (err) {
            console.error('[自检] 截图失败：', name, err.message);
          }
        }
        app.quit();
      })();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  // 桌宠是常驻型应用：窗口关掉也不退出，只能从托盘菜单退出
  app.on('window-all-closed', () => {
    /* 有意留空 */
  });
}
