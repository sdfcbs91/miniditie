/* src/js/world/line.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 线路几何与线路增删
 * 一条线路 = 有序站点数组 + 是否成环 + 列车列表 + 车厢数。
 */

/* ← 依赖 ../core/viewport.js （提供 W, H） */
/* ← 依赖 ../core/state.js （提供 G） */
/* ← 依赖 ../config.js （提供 MAX_TRAINS） */
/* ← 依赖 ./river.js （提供 crossingsOf） */
/* ← 依赖 ../ui/hud.js （提供 toast） */

/**
 * 把站点数组展开成可沿路取点的路径
 * @returns {{pts:number[][], cum:number[], total:number, loop:boolean}}
 *   cum[i] = 从起点走到第 i 个站的累计弧长；total = 全线长
 */
function buildPath(line) {
  const pts = line.stations.map(s => [s.nx * W, s.ny * H]);
  const cum = [0];
  let total = 0;
  const n = pts.length;
  const seg = line.loop ? n : n - 1;
  for (let i = 0; i < seg; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cum.push(total);
  }
  return { pts, cum, total, loop: line.loop };
}

/** 沿路径取距离 d 处的点（含朝向 ang，列车据此旋转） */
function pointAt(path, d) {
  if (path.loop) d = ((d % path.total) + path.total) % path.total;
  else d = Math.max(0, Math.min(path.total, d));

  const { pts, cum } = path;
  const n = pts.length;
  for (let i = 0; i < cum.length - 1; i++) {
    if (d <= cum[i + 1] + 1e-9) {
      const a = pts[i], b = pts[(i + 1) % n];
      const segL = (cum[i + 1] - cum[i]) || 1e-6;
      const t = (d - cum[i]) / segL;
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
  }
  const a = pts[n - 1];
  return { x: a[0], y: a[1], ang: 0 };
}

/** 重算线路的隧道消耗数与该线服务的形状集合（列车据此决定载谁） */
function updateMeta(line) {
  line.tunnels = crossingsOf(line.stations, line.loop);
  line.served = new Set(line.stations.map(s => s.shape));
}

/** 给线路加一辆列车（受备用列车数与单线上限约束） */
function addTrain(line) {
  if (G.spareLocos <= 0 || line.trains.length >= MAX_TRAINS) return false;
  G.spareLocos--;
  line.trains.push({ idx: 0, d: 0, dir: 1, dwell: 0, passengers: [], carriages: 0 });
  return true;
}

/** 把线路的车厢数尽量均分给各列车（余数给靠前的几列） */
function distribute(line) {
  const n = line.trains.length || 1;
  line.trains.forEach((t, i) => t.carriages = Math.floor(line.carriages / n) + (i < line.carriages % n ? 1 : 0));
}

/** 单列列车运力：每节车厢运 G.carrCap 人（地图可覆写，如墨尔本电车 9 人/节） */
const capOf = tr => G.carrCap * (1 + tr.carriages);

/** 非环形线路端点手柄的位置（从端点往外延伸 30px，用于拖拽延长线路） */
function handlePos(line, which) {
  const st = line.stations;
  const a = which === 'start' ? st[0] : st[st.length - 1];
  const b = which === 'start' ? st[1] : st[st.length - 2];
  const ax = a.nx * W, ay = a.ny * H, bx = b.nx * W, by = b.ny * H;
  const dx = ax - bx, dy = ay - by, L = Math.hypot(dx, dy) || 1;
  return { x: ax + dx / L * 30, y: ay + dy / L * 30 };
}

/**
 * 删除线路：车上乘客就近放回车站，列车回收为备用
 */
function deleteLine(line) {
  for (const tr of line.trains) {
    const p = line._path ? pointAt(line._path, tr.d) : { x: line.stations[0].nx * W, y: line.stations[0].ny * H };
    for (const pg of tr.passengers) {
      let best = null, bd = 1e9;
      for (const s of G.stations) {
        const d = Math.hypot(s.nx * W - p.x, s.ny * H - p.y);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) best.passengers.push(pg);
    }
  }
  G.spareLocos += line.trains.length;
  G.lines = G.lines.filter(l => l !== line);
  toast('线路已删除，列车与隧道已回收');
}
