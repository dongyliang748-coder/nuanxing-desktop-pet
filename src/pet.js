/**
 * 暖星 · 桌面宠物 —— 渲染层
 *
 * 雪碧图规格（暖星 v2）：
 *   1536 x 2288，8 列 x 11 行，单元格 192 x 208
 *   行 0  idle           6 帧
 *   行 1  running-right  8 帧
 *   行 2  running-left   8 帧
 *   行 3  waving         4 帧
 *   行 4  jumping        5 帧
 *   行 5  failed         8 帧
 *   行 6  waiting        6 帧
 *   行 7  running        6 帧
 *   行 8  review         6 帧
 *   行 9  look 000~157.5   8 帧（正上 → 右下）
 *   行 10 look 180~337.5   8 帧（正下 → 左上）
 */
'use strict';

const api = window.petAPI;

const CELL_W = 192;
const CELL_H = 208;

// 逐帧时长（毫秒）取自暖星资产清单，保证动画节奏与原设计一致
const STATES = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320], loop: true },
  'running-right': { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
  'running-left': { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
  waving: { row: 3, durations: [140, 140, 140, 280], loop: false, next: 'idle' },
  jumping: { row: 4, durations: [140, 140, 140, 140, 280], loop: false, next: 'idle' },
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240], loop: false, next: 'idle' },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260], loop: true },
  running: { row: 7, durations: [120, 120, 120, 120, 120, 220], loop: true },
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280], loop: false, next: 'idle' },
};

const LINES = {
  click: ['嗯？', '我在呀 ~', '怎么啦', '摸摸头也不错', '忙完了吗？', '要不要歇一会儿'],
  dblclick: ['嘿！', '别戳啦 ~', '痒痒的'],
  pet: ['唔…舒服', '再摸一会儿嘛', '嘿嘿'],
  feed: ['谢谢，很甜 ~', '刚好有点饿了', '嗯…好吃'],
  refuse: ['刚吃过啦，你吃吧', '还不饿呢'],
  cheer: ['今天也辛苦啦', '记得喝水哦', '眼睛累了就看看远处', '慢慢来，不着急'],
  error: ['唔…连不上呢', '这个我做不到呀', '稍后再试试吧'],
};

// ---------- 运行时状态 ----------
let sheet = null;
let canvas = null;
let ctx = null;
let dpr = 1;
let scaleFactor = 1;
let windowSize = { w: 320, h: 400 };
let petBox = { x: 0, y: 0, w: CELL_W, h: CELL_H };

let current = 'idle';
let frameIdx = 0;
let stepTimer = null;

let lookIndex = -1;
let lookActive = false;
let lookHoldTimer = null;

let config = null;
let bond = 0;

let dragging = false;
let pressStart = null;
let dragStarted = false;

let menuOpen = false;
let chatOpen = false;
let sayTimer = null;
let sending = false;

const $ = (id) => document.getElementById(id);

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ---------- 绘制 ----------
function frameRect(state) {
  const st = STATES[state] || STATES.idle;
  const count = st.durations.length;
  const idx = Math.min(frameIdx, count - 1);
  return { sx: idx * CELL_W, sy: st.row * CELL_H };
}

function lookRect(index) {
  const row = index < 8 ? 9 : 10;
  const col = index < 8 ? index : index - 8;
  return { sx: col * CELL_W, sy: row * CELL_H };
}

function render() {
  if (!canvas || !ctx || !sheet || !sheet.complete) return;
  const rect =
    lookActive && lookIndex >= 0 && current === 'idle' ? lookRect(lookIndex) : frameRect(current);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sheet, rect.sx, rect.sy, CELL_W, CELL_H, 0, 0, canvas.width, canvas.height);
}

function schedule() {
  const st = STATES[current] || STATES.idle;
  const dur = st.durations[frameIdx] || 140;
  stepTimer = setTimeout(() => {
    if (frameIdx + 1 >= st.durations.length) {
      if (st.loop) {
        frameIdx = 0;
      } else {
        play(st.next || 'idle', true);
        return;
      }
    } else {
      frameIdx += 1;
    }
    render();
    schedule();
  }, dur);
}

function play(name, force) {
  const next = STATES[name] ? name : 'idle';
  if (!force && current === next) return;
  current = next;
  frameIdx = 0;
  clearTimeout(stepTimer);
  render();
  schedule();
}

// ---------- 气泡 ----------
function positionBubble() {
  const bubble = $('bubble');
  const chat = $('chat');
  const baseBottom = petBox.h + 14;
  bubble.style.bottom = `${baseBottom + (chatOpen ? 46 : 0)}px`;
  chat.style.bottom = `${baseBottom}px`;
}

function say(text, duration) {
  if (!text) return;
  if (config && config.bubbleEnabled === false) return;
  const bubble = $('bubble');
  $('bubble-text').textContent = text;
  positionBubble();
  bubble.classList.remove('hidden');
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => hideBubble(), duration || 4200);
}

function hideBubble() {
  $('bubble').classList.add('hidden');
}

// ---------- 聊天 ----------
function openChat() {
  chatOpen = true;
  $('chat').classList.remove('hidden');
  positionBubble();
  const input = $('chat-input');
  input.value = '';
  setTimeout(() => input.focus(), 30);
  syncMouseMode();
}

function closeChat() {
  chatOpen = false;
  $('chat').classList.add('hidden');
  $('chat-input').blur();
  positionBubble();
  syncMouseMode();
}

async function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text || sending) return;
  sending = true;
  $('chat-send').disabled = true;
  input.value = '';
  say(`你：${text}`, 12000);
  play('running', true);
  try {
    const reply = await api.chat(text);
    play('review', true);
    say(reply, 15000);
  } catch (err) {
    play('failed', true);
    say(err && err.message ? err.message : String(err), 9000);
  } finally {
    sending = false;
    $('chat-send').disabled = false;
    input.focus();
  }
}

// ---------- 菜单 ----------
function buildMainMenu() {
  const items = [
    { label: '摸摸头', action: doPet },
    { label: '喂点吃的', action: doFeed },
    { label: '陪我聊天', hint: 'Enter 发送', action: () => { closeMenu(); openChat(); } },
    { label: '随便动动', action: doRandomAct },
    { type: 'sep' },
    { label: '提醒设置', hint: '▸', action: buildReminderMenu },
    { label: '让暖星躲一会儿', action: () => { closeMenu(); api.hide(); } },
    { type: 'sep' },
    { label: '退出暖星', danger: true, action: () => api.quit() },
  ];
  renderMenu(items);
}

function buildReminderMenu() {
  const labels = { water: '喝水', sedentary: '久坐', offwork: '下班', review: '晚间复盘' };
  const items = Object.entries(labels).map(([id, label]) => {
    const item = (config.reminders && config.reminders[id]) || {};
    const on = item.enabled !== false;
    return {
      label,
      hint: on ? '已开' : '已关',
      check: on,
      action: () => toggleReminder(id),
    };
  });
  items.push({ type: 'sep' });
  items.push({ label: '‹ 返回', action: buildMainMenu });
  renderMenu(items);
}

function renderMenu(items) {
  const menu = $('menu');
  menu.innerHTML = '';
  for (const item of items) {
    if (item.type === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'menu-item' + (item.danger ? ' danger' : '');
    const left = document.createElement('span');
    left.textContent = item.label;
    row.appendChild(left);
    const right = document.createElement('span');
    right.className = 'hint';
    right.textContent = item.check ? '✓' : item.hint || '';
    row.appendChild(right);
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.action) item.action();
    });
    menu.appendChild(row);
  }
}

function openMenu(x, y) {
  menuOpen = true;
  const menu = $('menu');
  buildMainMenu();
  menu.classList.remove('hidden');
  // 先显示量出尺寸，再夹到窗口内
  const rect = menu.getBoundingClientRect();
  const maxX = Math.max(4, windowSize.w - rect.width - 4);
  const maxY = Math.max(4, windowSize.h - rect.height - 4);
  menu.style.left = `${Math.min(Math.max(4, x), maxX)}px`;
  menu.style.top = `${Math.min(Math.max(4, y), maxY)}px`;
  syncMouseMode();
}

function closeMenu() {
  menuOpen = false;
  $('menu').classList.add('hidden');
  syncMouseMode();
}

async function toggleReminder(id) {
  const item = (config.reminders && config.reminders[id]) || {};
  const next = item.enabled === false;
  config = await api.setConfig({ reminders: { [id]: { enabled: next } } });
  buildReminderMenu();
  say(`${({ water: '喝水', sedentary: '久坐', offwork: '下班', review: '晚间复盘' })[id]}提醒已${next ? '打开' : '关掉'}`, 3000);
}

// ---------- 互动动作 ----------
function doPet() {
  closeMenu();
  play('waving', true);
  say(pick(LINES.pet), 3000);
  bumpBond(2);
}

function doFeed() {
  closeMenu();
  const hungry = (bond % 7) < 5;
  play(hungry ? 'review' : 'failed', true);
  say(hungry ? pick(LINES.feed) : pick(LINES.refuse), 3200);
  bumpBond(1);
}

function doRandomAct() {
  closeMenu();
  const pool = ['waving', 'jumping', 'review', 'running', 'waiting'];
  play(pick(pool), true);
  bumpBond(1);
}

function bumpBond(n) {
  bond += n;
  try {
    localStorage.setItem('nuanxing-bond', String(bond));
  } catch (err) {
    /* 忽略存储失败 */
  }
}

// ---------- 鼠标穿透 ----------
// 穿透由主进程统一裁决（它掌握屏幕级鼠标坐标），渲染层只上报弹层是否打开
function syncMouseMode() {
  api.setUiState(menuOpen || chatOpen);
}

// ---------- 事件绑定 ----------
function bindEvents() {
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pressStart = { x: e.clientX, y: e.clientY, t: Date.now() };
    dragStarted = false;
    canvas.classList.add('dragging');
  });

  document.addEventListener('pointermove', (e) => {
    if (!pressStart || dragStarted) return;
    if (Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 5) {
      dragStarted = true;
      dragging = true;
      api.dragStart();
      hideBubble();
    }
  });

  document.addEventListener('pointerup', (e) => {
    canvas.classList.remove('dragging');
    if (!pressStart) return;
    const held = Date.now() - pressStart.t;
    if (dragStarted) {
      api.dragEnd();
      dragging = false;
      dragStarted = false;
      pressStart = null;
      play('idle', true);
      return;
    }
    pressStart = null;
    if (held < 700) handleClick(e);
  });

  canvas.addEventListener('dblclick', (e) => {
    e.preventDefault();
    play('jumping', true);
    say(pick(LINES.dblclick), 2400);
    bumpBond(1);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (menuOpen) {
      closeMenu();
      return;
    }
    openMenu(e.clientX, e.clientY);
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('mousedown', (e) => {
    if (menuOpen && !e.target.closest('#menu')) closeMenu();
  });

  $('chat-send').addEventListener('click', sendChat);
  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
    if (e.key === 'Escape') closeChat();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      closeChat();
    }
  });

  window.addEventListener('blur', () => {
    if (menuOpen) closeMenu();
  });

  document.addEventListener('dragstart', (e) => e.preventDefault());
}

function handleClick() {
  if (chatOpen) return;
  const pool = ['waving', 'jumping', 'review'];
  play(pick(pool), true);
  say(pick(LINES.click), 2600);
  bumpBond(1);
}

// ---------- 主进程推送 ----------
function bindIpc() {
  api.onAnim((name) => {
    if (!dragging) play(name, true);
  });

  api.onLook((index) => {
    if (dragging || current !== 'idle') return;
    lookIndex = index;
    lookActive = true;
    render();
    clearTimeout(lookHoldTimer);
    lookHoldTimer = setTimeout(() => {
      lookActive = false;
      render();
    }, 750);
  });

  api.onSay((payload) => {
    if (payload && payload.text) say(payload.text, payload.duration || 4000);
  });

  api.onRemind((payload) => {
    if (!payload) return;
    const kind = payload.id === 'sedentary' ? 'waiting' : 'waving';
    play(kind, true);
    say(payload.message, 9000);
  });
}

// ---------- 启动 ----------
async function boot() {
  canvas = $('pet');
  ctx = canvas.getContext('2d');
  dpr = window.devicePixelRatio || 1;

  const info = await api.getConfig();
  config = info.config || {};
  windowSize = info.windowSize || windowSize;
  petBox = info.petBox || petBox;
  scaleFactor = (petBox.w || CELL_W) / CELL_W;

  canvas.style.left = `${petBox.x}px`;
  canvas.style.top = `${petBox.y}px`;
  canvas.style.width = `${petBox.w}px`;
  canvas.style.height = `${petBox.h}px`;
  canvas.width = Math.round(petBox.w * dpr);
  canvas.height = Math.round(petBox.h * dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  try {
    bond = Number(localStorage.getItem('nuanxing-bond') || 0) || 0;
  } catch (err) {
    bond = 0;
  }

  sheet = new Image();
  sheet.onload = () => {
    render();
  };
  sheet.onerror = () => {
    say('雪碧图加载失败，请检查 assets/spritesheet.png', 10000);
  };
  sheet.src = '../assets/spritesheet.png';

  bindEvents();
  bindIpc();
  positionBubble();
  play('idle', true);
  syncMouseMode();

  setTimeout(() => say('暖星上线，我在角落待着 ~', 4200), 900);
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((err) => {
    document.body.innerHTML = `<pre style="color:#c9705a;font-size:12px;padding:8px">${err && err.message ? err.message : err}</pre>`;
  });
});
