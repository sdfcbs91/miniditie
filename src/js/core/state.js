/* src/js/core/state.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 全局游戏状态 G（唯一数据源）
 *
 * G 是全局词法作用域里的一个 `let` 绑定，所有脚本按名字直接读，不缓存在本地变量里，
 * reset() 重新赋值时，其它模块下一次读到的就是新对象（等价于 ESM 的 live binding）。
 *
 * reset(mapId)：按地图初始化。mapId 省略 / 'endless' → 无限模式（默认河流）；
 * 否则取 maps.js 里对应城市的河流布局与参数覆写（速度/运力/隧道/刷客倍率等）。
 */

/* ← 依赖 ../utils.js （提供 el） */
/* ← 依赖 ../config.js （提供 TRAIN_SPEED, BASE_CAP, MAX_CARR_PER_TRAIN） */
/* ← 依赖 ../world/river.js （提供 setRiverLayout） */
/* ← 依赖 ../world/maps.js （提供 MAPS, ENDLESS_RIVERS, mapById） */
/* ← 依赖 ../world/station.js （提供 spawnStation） */
/* ← 依赖 ../ui/hud.js （提供 updateHUD, renderChips） */
/* ← 依赖 ../ui/controls.js （提供 setPauseIcon） */

let G = null;

/**
 * 重置到初始局面（主菜单背景 / 开始游戏 / 重新开始都走这里）
 * @param {string} [mapId] 城市图 id；缺省为无限模式
 */
function reset(mapId) {
  const def = mapId && mapId !== 'endless' ? mapById(mapId) : null;

  G = {
    running: false,   // 是否已开始（主菜单/开场弹窗关闭后置 true）
    modal: true,      // 是否有弹窗遮挡（弹窗期间游戏暂停推进）
    over: false,      // 是否已结束
    t: 0,             // 累计游戏时间（秒），动画用
    day: 1,           // 当前天数
    dayT: 0,          // 当天已过秒数
    delivered: 0,     // 累计送达乘客
    stations: [],     // 车站
    lines: [],        // 线路
    floaters: [],     // 飘字
    stationTimer: 7,  // 下一座新站的倒计时
    speed: 1,         // 1× / 2×
    paused: false,
    nextId: 1,        // 自增 id（车站 / 线路共用）
    hintStage: 0,     // 教学提示进度，只前进不回退

    /* ---- 地图相关 ---- */
    mapId: def ? def.id : 'endless',      // 当前图 id（'endless' = 无限模式）
    mapIdx: def ? MAPS.indexOf(def) : -1, // 在 MAPS 里的下标（-1 = 无限模式）
    mapName: def ? def.name : '无限模式',
    unlockedThisRun: null,                // 本局达标后新解锁的城市名（结算页展示用）

    /* ---- 地图参数覆写：缺省回落到 config.js 全局值 ---- */
    trainSpeed: (def && def.trainSpeed) || TRAIN_SPEED,
    carrCap: (def && def.carrCap) || BASE_CAP,
    maxCarr: (def && def.maxCarr) || MAX_CARR_PER_TRAIN,
    spawnFactor: (def && def.spawnFactor) || 1,
    stationFactor: (def && def.stationFactor) || 1,
    unlockedLines: (def && def.lines) || 3,
    spareLocos: (def && def.locos) != null ? def.locos : 3,
    totalTunnels: (def && def.tunnels) != null ? def.tunnels : 3,
    spareCars: 0,     // 备用车厢
    capBonus: 0       // 车站容量额外加成
  };

  // 切换河流布局（城市图用专属河流，无限模式用默认正弦河）
  setRiverLayout(def ? def.rivers : ENDLESS_RIVERS);

  // 开局送三个基础形状，保证第一条线能立刻开出来
  spawnStation('circle');
  spawnStation('triangle');
  spawnStation('square');

  updateHUD();
  renderChips();

  const h = el('hint');
  h.firstElementChild.textContent = '按住车站并拖拽到另一座车站，开通第一条线路';
  h.style.opacity = 1;
  el('btnSpeed').textContent = '1×';
  setPauseIcon();
}
