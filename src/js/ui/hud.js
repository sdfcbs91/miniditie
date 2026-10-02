/* src/js/ui/hud.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * HUD：顶部日期/库存数字、底部线路牌、toast 气泡、教学提示条
 * 所有 DOM 操作集中在这里，渲染层只碰 Canvas。
 */

/* ← 依赖 ../core/state.js （提供 G） */
/* ← 依赖 ../core/audio.js （提供 AU） */
/* ← 依赖 ../config.js （提供 MAX_TRAINS） */
/* ← 依赖 ../utils.js （提供 el） */
/* ← 依赖 ../world/line.js （提供 addTrain, deleteLine） */

/** 刷新顶部库存与计数 */
function updateHUD() {
  el('dayLabel').textContent = '第 ' + G.day + ' 天';
  el('weekLabel').textContent = '第 ' + (Math.floor((G.day - 1) / 7) + 1) + ' 周'
    + (G.mapIdx >= 0 ? ' · ' + G.mapName : '');
  el('delivered').textContent = G.delivered;
  el('invTunnels').textContent = G.totalTunnels - G.lines.reduce((s, l) => s + l.tunnels, 0);
  el('invLocos').textContent = G.spareLocos;
  el('invCars').textContent = G.spareCars;
}

/** 重建底部线路牌（已用线路 + 空位占位点） */
function renderChips() {
  const wrap = el('chips');
  let html = '';

  for (const line of G.lines) {
    html += '<div class="chip" style="border-color:' + line.color + '66">'
      + '<span class="cdot" style="background:' + line.color + '"></span>'
      + '<span class="flex items-center gap-[3px]">' + line.trains.map(() => '<span class="capic"></span>').join('') + '</span>'
      + (line.carriages ? '<span class="text-[10px] font-black opacity-60">+' + line.carriages + '</span>' : '')
      + (G.spareLocos > 0 && line.trains.length < MAX_TRAINS ? '<button class="chipbtn" data-line="' + line.id + '" data-act="loco">+列车</button>' : '')
      + (G.spareCars > 0 && line.trains.length && line.carriages < line.trains.length * G.maxCarr ? '<button class="chipbtn" data-line="' + line.id + '" data-act="car">+车厢</button>' : '')
      + '<button class="chipbtn ghost" data-line="' + line.id + '" data-act="del" title="删除线路">×</button>'
      + '</div>';
  }

  for (let i = G.lines.length; i < G.unlockedLines; i++) html += '<span class="emptydot" title="拖拽车站开通新线路"></span>';
  wrap.innerHTML = html;
}

/** 线路牌上的按钮：+列车 / +车厢 / 删除（事件委托） */
function initHud() {
  el('chips').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const line = G.lines.find(l => l.id == b.dataset.line);
    if (!line) return;

    if (b.dataset.act === 'loco') { if (addTrain(line)) AU.chime(); }
    if (b.dataset.act === 'car' && G.spareCars > 0 && line.carriages < line.trains.length * G.maxCarr) {
      line.carriages++; G.spareCars--; AU.chime();
    }
    if (b.dataset.act === 'del') deleteLine(line);

    updateHUD();
    renderChips();
  });
}

/* ---------------- toast ---------------- */

let toastT;
function toast(msg) {
  const t = el('toast');
  t.firstElementChild.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.style.opacity = 0, 2200);
}

/* ---------------- 教学提示 ---------------- */

let hintT;

/**
 * 按阶段推进的教学提示（只前进不回退）
 * @param {number} stage 阶段号，>= 已展示过的最大阶段才展示
 */
function hintOnce(stage, msg) {
  if (G.hintStage >= stage) return;
  G.hintStage = stage;
  const h = el('hint');
  h.firstElementChild.textContent = msg;
  h.style.opacity = 1;
  clearTimeout(hintT);
  hintT = setTimeout(() => h.style.opacity = 0, 7000);
}

/** 延迟隐藏提示条（开场时用，给玩家 14s 读第一条引导） */
function hideHintAfter(ms) {
  clearTimeout(hintT);
  hintT = setTimeout(() => el('hint').style.opacity = 0, ms);
}
