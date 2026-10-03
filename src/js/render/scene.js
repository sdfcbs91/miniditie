/* src/js/render/scene.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 场景渲染：每帧由 core/loop.js 调用 render()
 * 只读状态、不改状态（唯一的例外是缓存 line._path，由 simulate 写入）。
 */

/* ← 依赖 ../core/viewport.js （提供 ctx, W, H） */
/* ← 依赖 ../core/state.js （提供 G） */
/* ← 依赖 ../config.js （提供 INK, BG, RIVER, DAY_LEN） */
/* ← 依赖 ../utils.js （提供 el） */
/* ← 依赖 ../world/river.js （提供 RIVERS, riverCenterAt, riverHalfPx, segCrosses） */
/* ← 依赖 ../world/line.js （提供 pointAt, handlePos） */
/* ← 依赖 ../world/floaters.js （提供 drawFloaters） */
/* ← 依赖 ../input/pointer.js （提供 editing, hoverHandle, hoverSeg） */
/* ← 依赖 ./primitives.js （提供 shapePath, rr） */

/* ---------------- 背景 ---------------- */

/** 画当前地图的所有河流（横河沿 x 扫描成带，竖河沿 y 扫描成带） */
function drawRiver() {
  ctx.fillStyle = RIVER;
  const step = 8;
  for (const r of RIVERS) {
    const horiz = r.axis === 'x';
    const len = horiz ? W : H;
    const half = riverHalfPx(r);
    ctx.beginPath();
    // 中心线 -半宽 的一侧（左/上边缘）
    for (let u = -20; u <= len + 20; u += step) {
      const c = riverCenterAt(r, u) - half;
      if (horiz) { u === -20 ? ctx.moveTo(u, c) : ctx.lineTo(u, c); }
      else       { u === -20 ? ctx.moveTo(c, u) : ctx.lineTo(c, u); }
    }
    // 中心线 +半宽 的一侧（右/下边缘），反向描回闭合
    for (let u = len + 20; u >= -20; u -= step) {
      const c = riverCenterAt(r, u) + half;
      if (horiz) ctx.lineTo(u, c); else ctx.lineTo(c, u);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/* ---------------- 线路 ---------------- */

/** 跨河段中点画一个「隧道口」白点 */
function domeIf(a, b) {
  if (!segCrosses(a, b)) return;
  const mx = (a.nx * W + b.nx * W) / 2, my = (a.ny * H + b.ny * H) / 2;
  ctx.beginPath();
  ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
}

function strokePolyline(arr, loop, color, width) {
  if (arr.length < 2) return;
  ctx.beginPath();
  arr.forEach((s, i) => { const x = s.nx * W, y = s.ny * H; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  if (loop) ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawLinePath(arr, loop, color) {
  strokePolyline(arr, loop, color, 9);
  for (let i = 0; i < arr.length - 1; i++) domeIf(arr[i], arr[i + 1]);
  if (loop && arr.length > 2) domeIf(arr[arr.length - 1], arr[0]);
}

/* ---------------- 车站 ---------------- */

function drawStation(st) {
  const x = st.nx * W, y = st.ny * H;

  // 出生缩放动画（0.4s ease-out cubic）
  const pop = Math.min(1, (G.t - st.born) / 0.4);
  const sc = 1 - Math.pow(1 - pop, 3);
  ctx.save();
  ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y);

  // 拥挤预警圆环：随 oc 转满一圈；>66% 开始抖动 + 变红
  if (st.passengers.length > st.cap || st.oc > 0.01) {
    const frac = st.oc;
    const pulse = frac > 0.66 ? Math.sin(G.t * 9) * 1.5 : 0;
    ctx.beginPath();
    ctx.arc(x, y, 20 + pulse, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.strokeStyle = frac > 0.66 ? '#d64545' : (frac > 0.33 ? '#d98f2b' : '#8f8a7d');
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  shapePath(st.shape, x, y, 12);
  ctx.fillStyle = st.oc > 0.5 ? '#f6e3de' : BG;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  // 候车乘客：靠右侧竖排，屏幕右边缘的站改到左侧显示
  const dir = x > W - 150 ? -1 : 1;
  const n = st.passengers.length;
  for (let i = 0; i < n; i++) {
    const col = Math.floor(i / 5), row = i % 5;
    const px = x + dir * (22 + col * 12), py = y - 24 + row * 12;
    shapePath(st.passengers[i].shape, px, py, 5);
    ctx.fillStyle = INK;
    ctx.fill();
  }
}

/* ---------------- 列车 ---------------- */

function drawTrain(tr, line) {
  const path = line._path;
  if (!path) return;
  const sign = line.loop ? 1 : tr.dir;

  // 每节车厢的座位数 = 单节运力；横向座位间距 7.5px，纵向两排留 1.2px 缝隙，四周留边距
  const per = G.carrCap;
  const cols = Math.ceil(per / 2), rows = Math.ceil(per / cols);
  const pr = 3;
  const len = Math.max(30, (cols - 1) * 7.5 + 15);  // 默认 6 座 → 30px；墨尔本 9 座 → 45px
  const gapX = 7.5;
  const gapY = rows > 1 ? 7.2 : 0;                                // > 图标直径 6，上下排不贴
  const pitch = len + 4;                       // 车厢节距：比车长多 4px，留出连接缝

  // 从最后一节车厢往前画，保证车头盖在最上层
  for (let k = tr.carriages; k >= 0; k--) {
    const p = pointAt(path, tr.d - sign * k * pitch);

    // 车厢连接圆点：画在两节车厢缝隙正中（按路径弧长取点，拐弯时也对齐）
    if (k > 0) {
      const mid = pointAt(path, tr.d - sign * (k - 0.5) * pitch);
      ctx.beginPath();
      ctx.arc(mid.x, mid.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = INK; ctx.fill();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.ang);
    rr(-len / 2, -9, len, 18, 9);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
    const slice = tr.passengers.slice(k * per, k * per + per);
    slice.forEach((pg, i) => {
      const ix = (i % cols - (cols - 1) / 2) * gapX;
      const iy = (Math.floor(i / cols) - (rows - 1) / 2) * gapY;
      // 三角形是外接圆画法，面积只有同半径圆的 ~40%，补偿放大避免显小
      shapePath(pg.shape, ix, iy, pg.shape === 'triangle' ? pr * 1.35 : pr);
      ctx.fillStyle = INK; ctx.fill();
    });
    ctx.restore();
  }
}

/* ---------------- 端点手柄 / 编辑预览 ---------------- */

function drawHandles() {
  for (const line of G.lines) {
    if (line.loop || line.stations.length < 2) continue;
    if (editing && editing.line === line) continue; // 正在编辑的线由 drawEditing 画
    for (const which of ['start', 'end']) {
      const h = handlePos(line, which);
      const hov = hoverHandle && hoverHandle.line === line && hoverHandle.which === which;
      ctx.beginPath();
      ctx.arc(h.x, h.y, hov ? 11 : 8.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = line.color; ctx.stroke();
    }
  }
}

/** 拖拽建线 / 改线 / 线段插入时的实时预览 */
function drawEditing() {
  if (editing.isInsert) { drawInsertPreview(); return; }
  const P = editing.path;
  const col = editing.isNew ? editing.color : editing.line.color;

  strokePolyline(P, editing.loopClosed, col, 9);
  for (let i = 0; i < P.length - 1; i++) domeIf(P[i], P[i + 1]);
  if (editing.loopClosed && P.length > 2) domeIf(P[P.length - 1], P[0]);

  // 从最后一个站到光标的虚线预览；悬停到合法站时吸附过去
  const last = P[P.length - 1];
  let tp = editing.cursor;
  const hov = editing.hover;
  if (hov && hov !== last && (!P.includes(hov) || (hov === P[0] && P.length >= 3))) tp = { x: hov.nx * W, y: hov.ny * H };

  ctx.beginPath();
  ctx.moveTo(last.nx * W, last.ny * H);
  ctx.lineTo(tp.x, tp.y);
  ctx.setLineDash([6, 7]);
  ctx.strokeStyle = editing.deny > 0 ? '#d64545' : col;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // 吸附高亮圈
  if (hov && hov !== last) {
    ctx.beginPath();
    ctx.arc(hov.nx * W, hov.ny * H, 18, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 光标点
  ctx.beginPath();
  ctx.arc(editing.cursor.x, editing.cursor.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** 线段插入预览：原段两端 → 目标站（或光标）的虚线折线，安全计算不通过时整体变红 */
function drawInsertPreview() {
  const line = editing.line, i = editing.insertIdx;
  const prev = line.stations[i - 1], next = line.stations[i % line.stations.length];
  const hov = editing.hover;
  const col = editing.invalid ? '#d64545' : line.color;

  // 吸附到目标站时画到该站中心，否则中段跟着光标走
  const mid = hov ? { x: hov.nx * W, y: hov.ny * H } : editing.cursor;

  ctx.beginPath();
  ctx.moveTo(prev.nx * W, prev.ny * H);
  ctx.lineTo(mid.x, mid.y);
  ctx.lineTo(next.nx * W, next.ny * H);
  ctx.setLineDash([6, 7]);
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // 吸附高亮圈（非法目标也用红色圈出，让玩家看清拒绝对象）
  if (hov) {
    ctx.beginPath();
    ctx.arc(hov.nx * W, hov.ny * H, 18, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 光标点
  ctx.beginPath();
  ctx.arc(editing.cursor.x, editing.cursor.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ---------------- 左上角周进度环 ---------------- */

function drawPie() {
  const c = el('pie'), x = c.getContext('2d');
  x.clearRect(0, 0, 80, 80);
  x.lineWidth = 10;
  x.strokeStyle = 'rgba(51,48,43,.12)';
  x.beginPath(); x.arc(40, 40, 30, 0, Math.PI * 2); x.stroke();
  const frac = ((G.day - 1) % 7 + G.dayT / DAY_LEN) / 7;
  x.strokeStyle = INK;
  x.lineCap = 'round';
  x.beginPath(); x.arc(40, 40, 30, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); x.stroke();
}

/* ---------------- 每帧总入口 ---------------- */

function render() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  drawRiver();

  for (const line of G.lines) {
    // 插入模式保留原线照常绘制（预览只叠加虚线三角），其余编辑态隐藏原线改由 drawEditing 画
    if (editing && editing.line === line && !editing.isInsert) continue;
    drawLinePath(line.stations, line.loop, line.color);
  }

  if (editing) drawEditing();

  // 悬停线段提示点：告知玩家此处可按住拖出插入中间站
  if (!editing && !G.modal && !G.over && hoverSeg) {
    ctx.beginPath();
    ctx.arc(hoverSeg.x, hoverSeg.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = hoverSeg.line.color; ctx.stroke();
  }

  for (const line of G.lines) for (const tr of line.trains) drawTrain(tr, line);
  for (const st of G.stations) drawStation(st);

  if (!G.modal && !G.over) drawHandles();

  drawFloaters();
  drawPie();
}
