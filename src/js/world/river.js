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
 * @param lo/hi 可选：半宽的像素下限/上限（防窗口过小时河太窄）
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
  if (isGuangfoWater()) return guangfoWaterCrossings(a, b).length;
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
  if (isGuangfoWater()) return guangfoWaterNear(x, y, margin);
  for (const r of RIVERS) {
    const c = r.axis === 'x' ? riverCenterAt(r, x) : riverCenterAt(r, y);
    const v = r.axis === 'x' ? y : x;
    if (Math.abs(v - c) < riverHalfPx(r) + margin) return true;
  }
  return false;
}

// 广佛河流使用 Natural Earth 地理中心线；经典城市仍使用原来的单值示意河。
function isGuangfoWater() { return G && (G.mapId === 'guangfo' || G.mapId === 'endless'); }
function guangfoWaterProject(lon, lat) {
  return G.mapId === 'endless' ? earthProject(lon, lat) : guangfoProject(lon, lat);
}
function guangfoWaterUnproject(x, y) {
  if (G.mapId === 'endless') return earthUnproject(x, y);
  const v = guangfoView();
  return { lon: v.west + (x - v.x) / (v.aspectX * v.scale), lat: v.north - (y - v.y) / v.scale };
}

// 在经纬度上固定采样 centripetal Catmull–Rom；同一折线用于水面、避让和跨河。
// 保留输入顶点和分支端点，曲线只是对稀疏来源的视觉/玩法近似，不是测绘数据。
const guangfoRiverCurveCache = new WeakMap();
function guangfoRiverCurve(river) {
  if (guangfoRiverCurveCache.has(river)) return guangfoRiverCurveCache.get(river);
  const input = river.coords, result = [];
  const dist = (a,b) => Math.pow(((a[0]-b[0])*.92)**2 + (a[1]-b[1])**2, .25);
  for (let i=0; i<input.length-1; i++) {
    const p0=input[Math.max(0,i-1)], p1=input[i], p2=input[i+1], p3=input[Math.min(input.length-1,i+2)];
    let dt0=dist(p0,p1), dt1=dist(p1,p2), dt2=dist(p2,p3);
    if (dt1 < 1e-8) continue;
    if (dt0 < 1e-8) dt0=dt1; if (dt2 < 1e-8) dt2=dt1;
    const tangent = axis => {
      const a=p0[axis], b=p1[axis], c=p2[axis], d=p3[axis];
      return [( (b-a)/dt0-(c-a)/(dt0+dt1)+(c-b)/dt1 )*dt1,
              ( (c-b)/dt1-(d-b)/(dt1+dt2)+(d-c)/dt2 )*dt1];
    };
    const tx=tangent(0), ty=tangent(1);
    for (let step=0; step<8; step++) {
      const t=step/8, t2=t*t, t3=t2*t;
      const h00=2*t3-3*t2+1, h10=t3-2*t2+t, h01=-2*t3+3*t2, h11=t3-t2;
      result.push([h00*p1[0]+h10*tx[0]+h01*p2[0]+h11*tx[1],
                   h00*p1[1]+h10*ty[0]+h01*p2[1]+h11*ty[1]]);
    }
  }
  if (input.length) result.push(input[input.length-1]);
  guangfoRiverCurveCache.set(river,result);
  return result;
}

// 相机静止时复用屏幕投影，车站采样与水面重绘不必反复投影整条河系。
let guangfoWaterProjectionCache = null;
function guangfoProjectedWater() {
  const camera=G.camera;
  const key=[G.mapId,W,H,camera && camera.cx,camera && camera.cy,camera && camera.zoom].join(',');
  const rivers=G.mapId==='endless' ? REGION_RIVERS : GUANGFO_RIVERS;
  const cache=guangfoWaterProjectionCache;
  if (cache && cache.key===key && cache.sources.length===rivers.length && cache.sources.every((r,i)=>r===rivers[i])) return cache.paths;
  const sources=rivers.slice();
  const paths=sources.map(river=>guangfoRiverCurve(river).map(c=>guangfoWaterProject(c[0],c[1])));
  guangfoWaterProjectionCache={key,sources,paths}; return paths;
}

// 用经纬度相交，避免平移缩放影响隧道数；共享节点处对重复交点去重。
// 返回线段上的参数 t，供绘制准确的隧道口；直线只与中心线相交，河宽为视觉化近似。
function guangfoWaterCrossings(a, b) {
  const A = a.gfLon == null ? guangfoWaterUnproject(a.nx * W, a.ny * H) : {lon:a.gfLon, lat:a.gfLat};
  const B = b.gfLon == null ? guangfoWaterUnproject(b.nx * W, b.ny * H) : {lon:b.gfLon, lat:b.gfLat};
  const rx = B.lon - A.lon, ry = B.lat - A.lat, hits = [];
  const minX=Math.min(A.lon,B.lon), maxX=Math.max(A.lon,B.lon), minY=Math.min(A.lat,B.lat), maxY=Math.max(A.lat,B.lat);
  for (const river of (G.mapId==='endless' ? REGION_RIVERS : GUANGFO_RIVERS)) {
    const coords = guangfoRiverCurve(river);
    for (let i = 1; i < coords.length; i++) {
      const c = coords[i - 1], d = coords[i];
      if (Math.max(c[0],d[0]) < minX || Math.min(c[0],d[0]) > maxX ||
          Math.max(c[1],d[1]) < minY || Math.min(c[1],d[1]) > maxY) continue;
      const sx = d[0] - c[0], sy = d[1] - c[1], det = rx * sy - ry * sx;
      if (Math.abs(det) < 1e-14) continue;
      const dx = c[0] - A.lon, dy = c[1] - A.lat;
      const t = (dx * sy - dy * sx) / det, u = (dx * ry - dy * rx) / det;
      if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 &&
          !hits.some(h => Math.abs(h - t) < 1e-6)) hits.push(t);
    }
  }
  return hits.sort((x, y) => x - y);
}

// 与近景绘制共用屏幕曲线；按最大视觉河宽保守避让，无限模式将安全距离按比例缩放。
function guangfoWaterNear(x, y, margin) {
  const scale = G.mapId === 'endless' ? earthScaleFactor() : 1;
  const limit = margin * scale + guangfoWaterWidth() / 2;
  for (const points of guangfoProjectedWater()) {
    if (!points.length) continue;
    let a = points[0];
    for (let i = 1; i < points.length; i++) {
      const b = points[i];
      if (x < Math.min(a.x,b.x)-limit || x > Math.max(a.x,b.x)+limit || y < Math.min(a.y,b.y)-limit || y > Math.max(a.y,b.y)+limit) { a=b; continue; }
      const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len)) : 0;
      if (Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)) < limit) return true;
      a = b;
    }
  }
  return false;
}
function guangfoWaterWidth() {
  return G.mapId === 'endless' ? Math.max(4, 16 * earthScaleFactor()) : 8;
}
