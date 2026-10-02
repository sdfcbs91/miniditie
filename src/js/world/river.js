/* src/js/world/river.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 河流引擎：一张地图可以有 0~N 条河，每条河把地图切成两岸。
 * 跨河修线路需要消耗「隧道」（每跨过一条河算 1 条），所有跨河判定都基于这里的函数。
 *
 * 河的两种朝向（都保证「单值」，这样任意点在哪一侧才有明确定义）：
 *   axis 'x'：横河，中心线是 y = c(x)，宽度随 H 缩放（如泰晤士河）
 *   axis 'y'：竖河，中心线是 x = c(y)，宽度随 W 缩放（如哈德逊河 / 东河）
 * 河流定义由 world/maps.js 通过 setRiverLayout() 注入，本文件不关心具体城市。
 */

/* ← 依赖 ../core/viewport.js （提供 W, H） */

/** 当前地图的河流数组，元素由 mkRiverX / mkRiverY 构造 */
let RIVERS = [];

/**
 * 构造一条横河：y = c(x)
 * @param base  中心线基准高度（归一化 0~1，乘 H）
 * @param amps  叠加正弦 [频率 rad/px, 相位, 振幅(归一化乘 H)]，越多弯越曲折
 * @param halfH 半宽（归一化乘 H）
 * @param lo/hi 可选：半宽的像素下限/上限（无限模式用，防窗口过小时河太窄）
 */
function mkRiverX(base, amps, halfH, lo, hi) {
  return { axis: 'x', base, amps, halfH, lo, hi };
}

/** 构造一条竖河：x = c(y)，参数含义同上（基准与振幅乘 W） */
function mkRiverY(base, amps, halfH, lo, hi) {
  return { axis: 'y', base, amps, halfH, lo, hi };
}

/** 切换地图时由 state.reset() 调用，替换整张河流布局 */
function setRiverLayout(rivers) {
  RIVERS = rivers;
}

/** 河流中心线坐标（横河传入 x 得 y，竖河传入 y 得 x），返回像素值 */
function riverCenterAt(r, u) {
  let v = r.base;
  for (const a of r.amps) v += a[2] * Math.sin(a[0] * u + a[1]);
  return v * (r.axis === 'x' ? H : W);
}

/** 河流半宽（像素），横河随 H、竖河随 W 缩放 */
function riverHalfPx(r) {
  const h = r.halfH * (r.axis === 'x' ? H : W);
  return r.lo == null ? h : Math.max(r.lo, Math.min(r.hi, h));
}

/**
 * 点 (x, y) 在某条河的哪一侧：-1 / 1 为两岸，0 为河面内
 * 横河比 y、竖河比 x，符号本身不重要，只要两岸异号即可。
 */
function riverSideOf(r, x, y) {
  const c = r.axis === 'x' ? riverCenterAt(r, x) : riverCenterAt(r, y);
  const v = r.axis === 'x' ? y : x;
  const h = riverHalfPx(r);
  return v < c - h ? -1 : (v > c + h ? 1 : 0);
}

/** 两站连线跨过了几条河（双河地图可能一次跨 2 条 → 消耗 2 条隧道） */
function segCrossCount(a, b) {
  const ax = a.nx * W, ay = a.ny * H, bx = b.nx * W, by = b.ny * H;
  let n = 0;
  for (const r of RIVERS) if (riverSideOf(r, ax, ay) * riverSideOf(r, bx, by) === -1) n++;
  return n;
}

/** 两站之间的连线是否跨河 */
const segCrosses = (a, b) => segCrossCount(a, b) > 0;

/** 统计一条线路（站点数组）消耗了几条隧道（跨几条河算几条） */
function crossingsOf(arr, loop) {
  let c = 0;
  for (let i = 0; i < arr.length - 1; i++) c += segCrossCount(arr[i], arr[i + 1]);
  if (loop && arr.length > 2) c += segCrossCount(arr[arr.length - 1], arr[0]);
  return c;
}

/** 建站避让：点 (x, y) 距任意一条河的中心线小于 半宽+margin 则不能建站 */
function tooCloseToRiver(x, y, margin) {
  for (const r of RIVERS) {
    const c = r.axis === 'x' ? riverCenterAt(r, x) : riverCenterAt(r, y);
    const v = r.axis === 'x' ? y : x;
    if (Math.abs(v - c) < riverHalfPx(r) + margin) return true;
  }
  return false;
}
