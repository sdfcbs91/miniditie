/* src/js/world/station.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 车站与乘客生成
 * 车站坐标用归一化值 nx/ny（0~1）保存，这样窗口 resize 后布局不会跑偏。
 */

/* ← 依赖 ../core/viewport.js （提供 W, H） */
/* ← 依赖 ../core/state.js （提供 G） */
/* ← 依赖 ../core/audio.js （提供 AU） */
/* ← 依赖 ../config.js （提供 INK, BASE_CAP, SHAPES_SPECIAL, SHAPE_NAMES, PASSENGER_WEIGHT） */
/* ← 依赖 ../utils.js （提供 rand） */
/* ← 依赖 ./river.js （提供 tooCloseToRiver） */
/* ← 依赖 ./floaters.js （提供 floater） */

/**
 * 生成一座车站
 * @param {string} [force] 强制指定形状（开局用 circle/triangle/square）
 * @returns {object|null} 找不到合法位置时返回 null
 */
function spawnStation(force) {
  let shape = force;
  if (!shape) {
    if (G.simpleShapes) {
      // 简单图（前几城）：只抽基础三形，不出特殊站
      const r = Math.random();
      shape = r < 0.40 ? 'circle' : (r < 0.74 ? 'triangle' : 'square');
    } else {
      // 特殊站全场唯一：先统计已占用的特殊形状，只在剩下的里面抽
      const usedSpecial = new Set(G.stations.filter(s => s.special).map(s => s.shape));
      const r = Math.random();
      if (r < 0.38) shape = 'circle';
      else if (r < 0.72) shape = 'triangle';
      else if (r < 0.88) shape = 'square';
      else {
        const avail = SHAPES_SPECIAL.filter(s => !usedSpecial.has(s));
        shape = avail.length ? avail[Math.floor(Math.random() * avail.length)] : 'circle';
      }
    }
  }

  const regional = G.mapId === 'guangfo' || G.mapId === 'endless';
  // 每次先均匀选一个区再从它的外接框采样，避免中心小区永远没有站。
  for (let k = 0; k < (regional ? 600 : 80); k++) {
    let nx, ny, geo = null, district = null;
    if (G.mapId === 'endless') {
      // 在当前可操作视口内采样；50 倍近景开局时也能立即看到、连接三个站。
      const px = rand(W * .12, W * .82);
      const top = Math.min(H * .3, 105), bottom = Math.max(top + 1, H - Math.min(H * .25, 125));
      const py = rand(top, bottom);
      if (px < 175 && py < 145) continue; // 不与当前地区提示卡重叠
      geo = earthUnproject(px, py); district = guangfoDistrictAt(geo.lon, geo.lat);
      if (!district) continue;
      nx = px / W; ny = py / H;
    } else if (regional) {
      const candidate = GUANGFO_DISTRICTS[Math.floor(Math.random() * GUANGFO_DISTRICTS.length)];
      const bounds = candidate.bounds;
      geo = { lon: rand(bounds[0], bounds[2]), lat: rand(bounds[1], bounds[3]) };
      district = guangfoDistrictAt(geo.lon, geo.lat);
      if (!district || district !== candidate) continue;
      const p = guangfoProject(geo.lon, geo.lat);
      nx = p.x / W; ny = p.y / H;
    } else { nx = rand(0.07, 0.93); ny = rand(0.15, 0.85); }
    const x = nx * W, y = ny * H;
    if (tooCloseToRiver(x, y, regional ? 12 : 34)) continue;                                     // 不能建在河里 / 太贴河岸
    if (G.stations.some(s => Math.hypot(s.nx * W - x, s.ny * H - y) < 74 * (G.mapId === 'endless' ? earthScaleFactor() : 1))) continue; // 不能和已有站太近
    const st = {
      id: G.nextId++,
      nx, ny, shape,
      special: SHAPES_SPECIAL.includes(shape),
      passengers: [],
      cap: BASE_CAP + G.capBonus,
      oc: 0,               // 拥挤度 0~1，转满即关站
      born: G.t,           // 用于出生缩放动画
      spawnT: rand(2, 5),  // 下次生成乘客倒计时
      warned: false
    };
    if (regional) { st.gfLon = geo.lon; st.gfLat = geo.lat; st.district = district.name; }
    G.stations.push(st);
    AU.station();
    floater(x, y - 26, SHAPE_NAMES[shape] + '站', INK);
    return st;
  }
  return null;
}

/** 给某座车站生成一名乘客（目的地 = 场上存在的另一种形状） */
function spawnPassenger(st) {
  const present = [...new Set(G.stations.map(s => s.shape))].filter(sh => sh !== st.shape);
  if (!present.length) return;

  let tot = 0;
  present.forEach(s => tot += (PASSENGER_WEIGHT[s] || 1));

  let r = Math.random() * tot, target = present[0];
  for (const s of present) {
    r -= (PASSENGER_WEIGHT[s] || 1);
    if (r <= 0) { target = s; break; }
  }
  st.passengers.push({ shape: target });
}
