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

/** 原有城市的示意河也绘成立体河岸，几何和跨河判定保持不变。 */
function drawRiver() {
  if (drawWaterWebGL()) return;
  if (isGuangfoWater()) { drawGuangfoWater(); return; }
  ctx.save();
  for (const r of RIVERS) {
    const horiz = r.axis === 'x', len = horiz ? W : H, half = riverHalfPx(r), step = 8;
    // 重建带状路径：只给装饰层加屏幕偏移，不改变原始河面和游戏判定。
    const band = (dx, dy) => {
      ctx.beginPath();
      for (let u = -20; u <= len + 20; u += step) {
        const c = riverCenterAt(r, u) - half;
        if (horiz) { if (u === -20) ctx.moveTo(u + dx, c + dy); else ctx.lineTo(u + dx, c + dy); }
        else { if (u === -20) ctx.moveTo(c + dx, u + dy); else ctx.lineTo(c + dx, u + dy); }
      }
      for (let u = len + 20; u >= -20; u -= step) {
        const c = riverCenterAt(r, u) + half;
        if (horiz) ctx.lineTo(u + dx, c + dy); else ctx.lineTo(c + dx, u + dy);
      }
      ctx.closePath();
    };
    band(3, 7); ctx.fillStyle = 'rgba(60,91,78,.14)'; ctx.fill();
    band(2, 4); ctx.fillStyle = '#83a9a2'; ctx.fill();
    band(0, 0); ctx.fillStyle = '#b2dbe1'; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,248,229,.8)'; ctx.stroke();
    // 散开的短波纹代替道路式中线，随时间缓慢流动。
    ctx.strokeStyle = 'rgba(245,255,252,.62)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    const waveStep = 58, phase = ((G.t || 0) * 10) % waveStep;
    for (let u = -waveStep + phase; u < len + waveStep; u += waveStep) {
      for (const side of [-.35, .2]) {
        const c = riverCenterAt(r, u) + half * side;
        ctx.beginPath();
        if (horiz) { ctx.moveTo(u, c); ctx.quadraticCurveTo(u + 7, c - 2, u + 14, c); }
        else { ctx.moveTo(c, u); ctx.quadraticCurveTo(c - 2, u + 7, c, u + 14); }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/* ---------------- 线路 ---------------- */

// 屏幕投影路径在多个河岸/水面层之间复用；每层单独绘制所有河汊以避免交汇处断层。
function traceGuangfoWater(paths, dx, dy) {
  ctx.beginPath();
  for (const points of paths) points.forEach((p, i) => {
    if (i) ctx.lineTo(p.x + dx, p.y + dy); else ctx.moveTo(p.x + dx, p.y + dy);
  });
}

// 只在屏幕附近取样，避免超大缩放下对画面外的长河段逐像素遍历。
function waterVisibleRange(a, b, padding) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, a.x + padding], [dx, W + padding - a.x],
                         [-dy, a.y + padding], [dy, H + padding - a.y]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  return [lo, hi];
}

/** 广佛地理河流：投影河岸侧壁、接地阴影、渐层水面和动态波纹。 */
function drawGuangfoWater() {
  const width = guangfoWaterWidth(), depth = Math.max(1, Math.min(7, width * .27));
  const rim = Math.max(1, Math.min(3.5, width * .24));
  const paths = guangfoProjectedWater();
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  traceGuangfoWater(paths, depth * .35, depth + 1);
  ctx.strokeStyle = 'rgba(59,84,73,.16)'; ctx.lineWidth = width + rim * 2; ctx.stroke();
  traceGuangfoWater(paths, depth * .22, depth);
  ctx.strokeStyle = '#82a8a0'; ctx.lineWidth = width + rim; ctx.stroke();
  traceGuangfoWater(paths, 0, 0);
  ctx.strokeStyle = 'rgba(244,244,224,.94)'; ctx.lineWidth = width + rim * 2; ctx.stroke();
  ctx.strokeStyle = '#80b1b7'; ctx.lineWidth = width + 1; ctx.stroke();
  ctx.strokeStyle = '#a9d4dd'; ctx.lineWidth = width; ctx.stroke();
  // 轻微偏移的高光形成水面的浅深层次；水面中心不偏移，隧道口仍位于原河道。
  traceGuangfoWater(paths, 0, -Math.min(2, width * .10));
  ctx.strokeStyle = 'rgba(225,245,242,.40)'; ctx.lineWidth = Math.max(1, width * .55); ctx.stroke();

  if (width >= 5) {
    ctx.strokeStyle = 'rgba(250,255,249,.72)'; ctx.lineWidth = Math.max(1, Math.min(1.8, width * .1));
    const spacing = 36, phase = ((G.t || 0) * 9) % spacing, wave = Math.max(2, Math.min(9, width * .3));
    for (const points of paths) {
      let travelled = 0;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        const range = len > 1e-6 && waterVisibleRange(a, b, width / 2 + 10);
        if (range) {
          const nx = -dy / len, ny = dx / len, tx = dx / len, ty = dy / len;
          const first = Math.ceil((travelled + range[0] * len - phase) / spacing) * spacing + phase - travelled;
          for (let d = first; d <= range[1] * len; d += spacing) {
            const index = Math.round((travelled + d - phase) / spacing);
            const offset = ((index % 3 + 3) % 3 - 1) * Math.min(width * .18, 4);
            const x = a.x + tx * d + nx * offset, y = a.y + ty * d + ny * offset;
            ctx.beginPath(); ctx.moveTo(x - tx * wave, y - ty * wave);
            ctx.quadraticCurveTo(x + nx * 1.5, y + ny * 1.5, x + tx * wave, y + ty * wave); ctx.stroke();
          }
        }
        travelled += len;
      }
    }
  }
  ctx.restore();
}

/** 广佛按真实交点画隧道口，经典地图保留原版线段中点标记。 */
function domeIf(a, b) {
  const hits = isGuangfoWater() ? guangfoWaterCrossings(a, b) : (segCrosses(a, b) ? [.5] : []);
  for (const t of hits) {
    const mx = (a.nx + (b.nx - a.nx) * t) * W, my = (a.ny + (b.ny - a.ny) * t) * H;
    ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  }
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

// WebGL 2 不可用时保留立体轨床、双轨与跨河隧道剖面的 Canvas 近似。
function drawMetroFallback(line) {
  const arr=line.stations, n=arr.length;
  if (n<2) return;
  ctx.save(); ctx.translate(1,3); strokePolyline(arr,line.loop,'#66736b',12); ctx.restore();
  strokePolyline(arr,line.loop,line.color,9);
  const count=line.loop && n>2 ? n : n-1;
  ctx.save(); ctx.lineCap='round'; ctx.strokeStyle='rgba(245,250,244,.83)'; ctx.lineWidth=.8;
  for (let i=0;i<count;i++) {
    const a=arr[i], b=arr[(i+1)%n], ax=a.nx*W, ay=a.ny*H, dx=b.nx*W-ax, dy=b.ny*H-ay;
    const length=Math.hypot(dx,dy); if (length<.001) continue;
    const nx=-dy/length*2.6, ny=dx/length*2.6;
    for (const side of [-1,1]) { ctx.beginPath(); ctx.moveTo(ax+nx*side,ay+ny*side); ctx.lineTo(ax+dx+nx*side,ay+dy+ny*side); ctx.stroke(); }
  }
  ctx.restore();
  for (let i=0;i<count;i++) {
    const a=arr[i], b=arr[(i+1)%n], ax=a.nx*W, ay=a.ny*H, dx=b.nx*W-ax, dy=b.ny*H-ay;
    if (Math.hypot(dx,dy)<.001) continue;
    const angle=Math.atan2(dy,dx);
    for (const span of metroTunnelSpans(a,b)) {
      ctx.beginPath(); ctx.moveTo(ax+dx*span.start,ay+dy*span.start); ctx.lineTo(ax+dx*span.end,ay+dy*span.end);
      ctx.strokeStyle='rgba(65,105,108,.30)'; ctx.lineWidth=13; ctx.lineCap='round'; ctx.stroke();
      for (const t of [span.start,span.end]) {
        ctx.save(); ctx.translate(ax+dx*t,ay+dy*t); ctx.rotate(angle);
        ctx.beginPath(); ctx.moveTo(-1,-7); ctx.quadraticCurveTo(-5,0,-1,7);
        ctx.lineWidth=3; ctx.strokeStyle='#e3e9dc'; ctx.stroke(); ctx.restore();
      }
    }
  }
}

/* ---------------- 车站 ---------------- */

function drawStation(st, station3d) {
  const x = st.nx * W, y = st.ny * H;
  const colors = stationServiceColors(st), transfer = colors.length >= 2;

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
    ctx.arc(x, y, (transfer ? 31 : 27) + pulse, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.strokeStyle = frac > 0.66 ? '#d64545' : (frac > 0.33 ? '#d98f2b' : '#8f8a7d');
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // 地面阴影与二维退路；退路也区分单线和换乘入口。
  ctx.beginPath(); ctx.ellipse(x + 3, y + 11, transfer ? 23 : 19, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(35, 38, 32, .18)'; ctx.fill();
  if (!station3d) {
    const width = transfer ? 40 : 32;
    // 地面台座、玻璃墙、檐篷与支柱。
    ctx.fillStyle = '#a8b3a9'; ctx.fillRect(x-width/2, y+4, width+3, 12);
    ctx.fillStyle = '#567e7d'; ctx.fillRect(x-width/2+3, y-1, width-6, 12);
    ctx.fillStyle = '#53625e';
    ctx.fillRect(x-width/2+3, y-1, 2, 12); ctx.fillRect(x+width/2-5, y-1, 2, 12);
    ctx.fillStyle = '#e9e9dd'; ctx.fillRect(x-width/2, y-8, width, 11);
    ctx.strokeStyle = '#53625e'; ctx.lineWidth = 1; ctx.strokeRect(x-width/2, y-8, width, 11);
    const signs = colors.length ? colors : ['#84918c'];
    signs.forEach((color,i) => { ctx.fillStyle=color; ctx.fillRect(x-width/2+3+i*(width-6)/signs.length,y-7,
      Math.max(.5,(width-6)/signs.length-.4),2); });
    for (const dx of transfer ? [-10,10] : [0]) {
      const stepWidth=transfer ? 11 : 14;
      ctx.fillStyle='#53625e'; ctx.fillRect(x+dx-stepWidth/2,y+9,stepWidth,4);
      ctx.strokeStyle='#e0e4d9'; ctx.lineWidth=1;
      for (let i=0;i<3;i++) { ctx.beginPath(); ctx.moveTo(x+dx-stepWidth/2,y+13+i*2); ctx.lineTo(x+dx+stepWidth/2,y+13+i*2); ctx.stroke(); }
    }
    shapePath(st.shape,x,y,7.2);
    ctx.fillStyle=st.oc>.5 ? '#f6d2c9' : '#faf8f0'; ctx.fill();
    ctx.lineWidth=2.5; ctx.strokeStyle='#232f2c'; ctx.stroke();
  }
  ctx.restore();

  // 候车乘客：靠右侧竖排，屏幕右边缘的站改到左侧显示
  const dir = x > W - 150 ? -1 : 1;
  const n = st.passengers.length;
  for (let i = 0; i < n; i++) {
    const col = Math.floor(i / 5), row = i % 5;
    const px = x + dir * (36 + col * 12), py = y - 24 + row * 12;
    shapePath(st.passengers[i].shape, px, py, 5);
    ctx.fillStyle = INK;
    ctx.fill();
  }
}

/* ---------------- 列车 ---------------- */

function drawTrain(tr, line) {
  const path = line._path;
  if (!path || path.total <= 0) return;
  const sign = line.loop ? 1 : tr.dir;
  const per = G.carrCap;
  const cols = Math.ceil(per / 2), rows = Math.ceil(per / cols);
  const len = Math.max(30, (cols - 1) * 7.5 + 15);
  const pitch = len + 4;
  // 高度始终投向屏幕左上，而不是随车身旋转，保证各方向的光照一致。
  const liftX = -3, liftY = -7;

  // 折返后车厢仍留在进站一侧：将越过端点的弧长镜像回线路，环线则由 pointAt 环绕。
  // 仅用于绘制，不修改列车状态；取模也支持短线路和多次镜像。
  function pose(distance) {
    let d = distance, direction = sign;
    if (!line.loop) {
      const period = path.total * 2;
      const folded = ((d % period) + period) % period;
      if (folded > path.total) { d = period - folded; direction = -sign; }
      else d = folded;
    }
    const p = pointAt(path, d);
    return { x: p.x, y: p.y, ang: p.ang + (direction < 0 ? Math.PI : 0) };
  }

  function trace(points) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
  }
  function mixPoint(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function local(p, x, y, z) {
    const c = Math.cos(p.ang), s = Math.sin(p.ang);
    return { x: p.x + x * c - y * s + liftX * z,
             y: p.y + x * s + y * c + liftY * z };
  }

  const cars = [];
  for (let k = 0; k <= tr.carriages; k++) cars.push(pose(tr.d - sign * k * pitch));
  ctx.save();

  // 投影到地面的软阴影与车体分开绘制，避免覆盖相邻车厢。
  for (const p of cars) {
    ctx.save(); ctx.translate(p.x + 2, p.y + 3); ctx.rotate(p.ang);
    ctx.beginPath(); ctx.ellipse(0, 0, len / 2 + 2, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(35, 32, 27, .18)'; ctx.fill(); ctx.restore();
  }

  // 两节车厢端点之间的立体风挡：先画深色侧面，再画顶面和折褶。
  for (let k = 1; k < cars.length; k++) {
    const a = local(cars[k - 1], -len / 2 + 1, 0, 0.55);
    const b = local(cars[k], len / 2 - 1, 0, 0.55);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineWidth = 8; ctx.strokeStyle = '#333a3a'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x + liftX * .45, a.y + liftY * .45);
    ctx.lineTo(b.x + liftX * .45, b.y + liftY * .45);
    ctx.lineWidth = 6; ctx.strokeStyle = '#69716f'; ctx.stroke();
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length > 1) {
      const nx = -dy / length * 2.7, ny = dx / length * 2.7;
      for (const t of [0.25, 0.5, 0.75]) {
        const x = a.x + dx * t + liftX * .45, y = a.y + dy * t + liftY * .45;
        ctx.beginPath(); ctx.moveTo(x - nx, y - ny); ctx.lineTo(x + nx, y + ny);
        ctx.lineWidth = .8; ctx.strokeStyle = '#d0d5d1'; ctx.stroke();
      }
    }
  }

  // 顺序与原来的乘客分配一致：最后一节先画，车头最后画。
  for (let k = cars.length - 1; k >= 0; k--) {
    const p = cars[k], h = len / 2;
    // 切角轮廓形成流线型车头；挤出侧面只绘制朝向观察者的面。
    const outline = [[-h, -5], [-h + 3, -9], [h - 5, -9], [h - 1, -6],
                     [h, -3], [h, 3], [h - 1, 6], [h - 5, 9],
                     [-h + 3, 9], [-h, 5]];
    const bottom = outline.map(v => local(p, v[0], v[1], 0));
    const roof = outline.map(v => local(p, v[0], v[1], 1));
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      const dx = bottom[j].x - bottom[i].x, dy = bottom[j].y - bottom[i].y;
      const facing = dy * -liftX - dx * -liftY;
      if (facing <= 0) continue;
      // 不同方向的面使用不同灰度，色带也沿同一面投影。
      const light = (dy - dx * .6) / (Math.hypot(dx, dy) || 1);
      trace([bottom[i], bottom[j], roof[j], roof[i]]);
      ctx.fillStyle = light > 0 ? '#d0d7d3' : '#aebbb8'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = '#56615e'; ctx.stroke();
      trace([mixPoint(bottom[i], roof[i], .30), mixPoint(bottom[j], roof[j], .30),
             mixPoint(bottom[j], roof[j], .53), mixPoint(bottom[i], roof[i], .53)]);
      ctx.fillStyle = line.color; ctx.fill();
    }

    trace(roof); ctx.fillStyle = '#f9fbf8'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#45514e'; ctx.stroke();

    // 车顶高光、驾驶窗及灯均与车体一起旋转；乘客图标仍清晰地铺在车顶。
    ctx.save(); ctx.translate(p.x + liftX, p.y + liftY); ctx.rotate(p.ang);
    ctx.beginPath(); ctx.moveTo(-h + 4, -7); ctx.lineTo(h - 6, -7);
    ctx.lineWidth = 1; ctx.strokeStyle = '#d4dedb'; ctx.stroke();
    if (k === 0) {
      ctx.beginPath();
      ctx.moveTo(h - 5, -5.5); ctx.lineTo(h - 2, -3.5);
      ctx.lineTo(h - 2, 3.5); ctx.lineTo(h - 5, 5.5); ctx.closePath();
      ctx.fillStyle = '#425e66'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(h - 4.2, -4); ctx.lineTo(h - 3.1, -2.8);
      ctx.lineWidth = .8; ctx.strokeStyle = '#b8d4d5'; ctx.stroke();
      for (const y of [-6.4, 6.4]) {
        ctx.beginPath(); ctx.arc(h - 4, y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe69a'; ctx.fill();
      }
    }
    if (k === cars.length - 1) {
      for (const y of [-5.5, 5.5]) {
        ctx.beginPath(); ctx.arc(-h + 2.4, y, 1, 0, Math.PI * 2);
        ctx.fillStyle = '#cf5650'; ctx.fill();
      }
    }
    const slice = tr.passengers.slice(k * per, k * per + per);
    slice.forEach((pg, i) => {
      const ix = (i % cols - (cols - 1) / 2) * 7.5;
      const iy = (Math.floor(i / cols) - (rows - 1) / 2) * (rows > 1 ? 7.2 : 0);
      shapePath(pg.shape, ix, iy, pg.shape === 'triangle' ? 4.05 : 3);
      ctx.fillStyle = INK; ctx.fill();
    });
    ctx.restore();
  }
  ctx.restore();
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

let mapBackgroundSceneKey = '';
function render() {
  if (mapBackgroundCtx) {
    // 地图只在视口/相机变化时重绘；WebGL 与线路画布可独立逐帧更新。
    const key = [G.mapId,W,H,DPR,viewportRevision,G.camera && G.camera.cx,G.camera && G.camera.cy,G.camera && G.camera.zoom].join(',');
    if (mapBackgroundSceneKey !== key) {
      const foreground = ctx; ctx = mapBackgroundCtx;
      try { ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); drawGuangfoMap(); drawEarthMap(); }
      finally { ctx = foreground; }
      mapBackgroundSceneKey = key;
    }
    ctx.clearRect(0, 0, W, H);
  } else {
    // 无 DOM 分层时也可独立运行（测试替身 / 特殊宿主）。
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    drawGuangfoMap(); drawEarthMap();
  }

  drawRiver();
  drawGuangfoLabels();
  drawEarthLabels();

  const metro3d=drawMetroThree();
  if (!metro3d) for (const line of G.lines) {
    // 插入模式保留原线，其余编辑态隐藏原线改由 drawEditing 画。
    if (editing && editing.line === line && !editing.isInsert) continue;
    drawMetroFallback(line);
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
  const station3d = drawStationsThree();
  for (const st of G.stations) drawStation(st, station3d);
  if (!G.modal && !G.over) drawHandles();
  drawFloaters();
  drawPie();
}
