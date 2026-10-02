/* src/js/input/pointer.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 指针交互：拖拽建线、拖拽端点延长 / 缩短 / 成环、吸附判定
 *
 * 唯一的可变交互态是 `editing`（模块级变量，渲染层直接按名字读）。
 * editing = null 表示当前没有在拖拽。
 */

/* ← 依赖 ../core/viewport.js （提供 W, H） */
/* ← 依赖 ../core/state.js （提供 G） */
/* ← 依赖 ../core/audio.js （提供 AU） */
/* ← 依赖 ../config.js （提供 PALETTE） */
/* ← 依赖 ../world/river.js （提供 segCrosses, crossingsOf） */
/* ← 依赖 ../world/line.js （提供 handlePos, buildPath, updateMeta, addTrain, deleteLine） */
/* ← 依赖 ../ui/hud.js （提供 toast, hintOnce, renderChips, updateHUD） */

let editing = null;       // 当前拖拽中的线路编辑态
let hoverStation = null;  // 未拖拽时鼠标悬停的车站
let hoverHandle = null;   // 未拖拽时鼠标悬停的端点手柄 { line, which }

let pointerCanvas = null;

/** 外部强制结束拖拽（弹窗弹出前调用，避免编辑态残留） */
function clearEditing() {
  editing = null;
}

/** 绑定画布指针事件 */
function initPointer(canvas) {
  pointerCanvas = canvas;

  canvas.addEventListener('pointerdown', e => {
    if (!G.running || G.paused || G.modal || G.over) return;
    AU.init();
    const p = evPos(e);

    // 1) 优先命中线路端点的圆钮 → 延长该线
    for (const line of G.lines) {
      if (line.loop || line.stations.length < 2) continue;
      for (const which of ['start', 'end']) {
        const h = handlePos(line, which);
        if (Math.hypot(h.x - p.x, h.y - p.y) < 16) { startEdit(line, which, p); return; }
      }
    }

    // 2) 命中车站
    const st = stationAt(p, 17);
    if (!st) return;

    if (G.lines.length < G.unlockedLines) {
      // 还有空位 → 从这座站开始拉一条新线
      editing = { isNew: true, color: nextColor(), path: [st], loopClosed: false, cursor: p, hover: st, deny: 0 };
      AU.tick();
    } else {
      // 没有空位 → 只能改已有线的端点，否则提示
      const hit = findEndpointLine(st);
      if (hit) startEdit(hit.line, hit.which, p);
      else toast('没有可用的新线路：拖拽线路端点的圆钮来延长，或删除线路');
    }
  });

  canvas.addEventListener('pointermove', e => {
    const p = evPos(e);

    // 未拖拽：只更新悬停态与鼠标指针样式
    if (!editing) {
      hoverStation = stationAt(p, 16);
      hoverHandle = null;
      if (!hoverStation) {
        for (const line of G.lines) {
          if (line.loop || line.stations.length < 2) continue;
          for (const which of ['start', 'end']) {
            const h = handlePos(line, which);
            if (Math.hypot(h.x - p.x, h.y - p.y) < 14) { hoverHandle = { line, which }; break; }
          }
          if (hoverHandle) break;
        }
      }
      pointerCanvas.style.cursor = (hoverStation || hoverHandle) ? 'pointer' : 'default';
      return;
    }

    editing.cursor = p;
    if (!G.running || G.paused || G.modal) return;
    editing.hover = stationAt(p, 20);

    const P = editing.path, hov = editing.hover;
    if (editing.loopClosed || !hov) return;

    const last = P[P.length - 1];
    if (hov === last) return;
    if (P.length >= 2 && hov === P[P.length - 2]) { P.pop(); AU.tick(); return; }  // 回退一步
    if (hov === P[0] && P.length >= 3) { editing.loopClosed = true; AU.chime(); return; } // 首尾闭合 → 环线
    if (P.includes(hov)) return;

    // 跨河需要隧道，不够就拒绝（deny 用于红色虚线反馈 + 节流提示）
    if (segCrosses(last, hov) && tunnelsLeft() <= 0) {
      if (editing.deny <= 0) { toast('隧道不足！无法跨河修建'); AU.deny(); }
      editing.deny = 0.6;
      return;
    }
    P.push(hov);
    AU.tick();
  });

  window.addEventListener('pointerup', () => { if (editing) finishEdit(); });
  window.addEventListener('pointercancel', () => { if (editing) finishEdit(); });
}

/** 把浏览器事件坐标换算成画布 CSS 像素坐标 */
const evPos = e => {
  const r = pointerCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

/** 找离 p 最近且距离 < r 的车站 */
function stationAt(p, r) {
  let best = null, bd = r;
  for (const s of G.stations) {
    const d = Math.hypot(s.nx * W - p.x, s.ny * H - p.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** 某座站是否是某条非环线的端点 → 返回 { line, which } */
function findEndpointLine(st) {
  for (const line of G.lines) {
    if (line.loop || line.stations.length < 2) continue;
    if (line.stations[0] === st) return { line, which: 'start' };
    if (line.stations[line.stations.length - 1] === st) return { line, which: 'end' };
  }
  return null;
}

const usedColors = () => new Set(G.lines.map(l => l.color));
const nextColor = () => PALETTE.find(c => !usedColors().has(c));

/** 当前编辑还能再跨几次河（负数即不允许） */
function tunnelsLeft() {
  if (!editing) return 0;
  const others = G.lines.reduce((s, l) => s + (editing.line === l ? 0 : l.tunnels), 0);
  return G.totalTunnels - others - crossingsOf(editing.path, editing.loopClosed);
}

/** 开始拖拽已有线路：统一把拖拽端翻转到数组末尾，逻辑只处理「末尾追加」 */
function startEdit(line, which, p) {
  const path = line.stations.slice();
  let reversed = false;
  if (which === 'start') { path.reverse(); reversed = true; }
  editing = { isNew: false, line, path, reversed, loopClosed: false, cursor: p, hover: path[path.length - 1], deny: 0 };
  AU.tick();
}

/** 松手结算：新线落库 / 旧线写回 / 无效拖拽则删线 */
function finishEdit() {
  let { path, isNew, line, reversed, loopClosed, color } = editing;
  editing = null;

  if (reversed) path.reverse();
  if (path.length < 3) loopClosed = false;

  if (path.length < 2) {
    // 拖到只剩一个站：视为删除该线路
    if (!isNew && line) deleteLine(line);
  } else if (isNew) {
    const nl = { id: G.nextId++, color, stations: path, loop: loopClosed, trains: [], carriages: 0 };
    updateMeta(nl);
    G.lines.push(nl);
    addTrain(nl);
    hintOnce(1, '列车会自动往返运行，接送与车站图案相同的乘客');
    AU.chime();
  } else {
    line.stations = path;
    line.loop = loopClosed;
    updateMeta(line);

    // 站点变了，重算各列车所在弧长与朝向，避免列车瞬移到错误位置
    const p = buildPath(line);
    line._path = p;
    for (const tr of line.trains) {
      tr.idx = Math.min(tr.idx, line.stations.length - 1);
      tr.d = p.cum[tr.idx];
      if (!line.loop) {
        if (tr.idx === 0) tr.dir = 1;
        else if (tr.idx === line.stations.length - 1) tr.dir = -1;
      }
    }
  }

  renderChips();
  updateHUD();
}
