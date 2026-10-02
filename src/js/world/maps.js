/* src/js/world/maps.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 城市地图定义：官方《Mini Metro》初版 6 城 + 无限模式的默认河流
 *
 * 每张图 = 专属河流布局 + 少量参数覆写 + 解锁阈值。
 * 覆写字段（缺省即用 config.js 的全局默认值）：
 *   tunnels       开局隧道数（默认 3）
 *   locos         开局备用列车（默认 3）
 *   lines         开局可开线路数（默认 3）
 *   trainSpeed    列车速度 px/s（默认 TRAIN_SPEED 92）
 *   carrCap       每节车厢运力（默认 BASE_CAP 6）
 *   maxCarr       单列车最多车厢数（默认 MAX_CARR_PER_TRAIN 3）
 *   spawnFactor   乘客生成间隔倍率（默认 1，越小刷得越快）
 *   stationFactor 新站生成间隔倍率（默认 1）
 * unlockNext：在这张图上单局送达 N 人 → 解锁下一张图（最后一张为 null）
 *
 * 河流用 mkRiverX / mkRiverY 构造（world/river.js），坐标全部归一化，resize 不跑偏。
 */

/* ← 依赖 ./river.js （提供 mkRiverX, mkRiverY） */

/** 无限模式的默认河流：横贯屏幕的双正弦带（即重构前唯一的河） */
const ENDLESS_RIVERS = [mkRiverX(0.52, [[0.0035, 1.7, 0.055], [0.0011, 0.4, 0.035]], 0.042, 26, 38)];

const MAPS = [
  {
    id: 'london', name: '伦敦', en: 'LONDON', river: '泰晤士河',
    blurb: '蜿蜒大河穿城而过，规则最标准，适合上手',
    unlockNext: 100,
    rivers: [mkRiverX(0.50, [[0.0016, 0.3, 0.16], [0.0042, 2.1, 0.045]], 0.050)]
  },
  {
    id: 'paris', name: '巴黎', en: 'PARIS', river: '塞纳河',
    blurb: '河道窄而多弯，开局隧道只有 2 条，跨河要精打细算',
    unlockNext: 140, tunnels: 2,
    rivers: [mkRiverX(0.46, [[0.0028, 1.2, 0.095], [0.006, 4.0, 0.020]], 0.032)]
  },
  {
    id: 'newyork', name: '纽约', en: 'NEW YORK', river: '哈德逊河 × 东河',
    blurb: '两条竖河夹出曼哈顿长岛，开局隧道 5 条',
    unlockNext: 180, tunnels: 5,
    rivers: [
      mkRiverY(0.26, [[0.0022, 0.8, 0.030]], 0.045),   // 哈德逊河（西）
      mkRiverY(0.56, [[0.0026, 2.6, 0.035]], 0.040)    // 东河（东）
    ]
  },
  {
    id: 'berlin', name: '柏林', en: 'BERLIN', river: '施普雷河',
    blurb: '单列车最多可挂 4 节车厢，长线运力更强',
    unlockNext: 220, maxCarr: 4,
    rivers: [mkRiverX(0.52, [[0.0012, 2.5, 0.10], [0.0033, 0.9, 0.03]], 0.038)]
  },
  {
    id: 'melbourne', name: '墨尔本', en: 'MELBOURNE', river: '雅拉河',
    blurb: '有轨电车：列车慢 33%，但每节车厢运力 9 人',
    unlockNext: 260, trainSpeed: 62, carrCap: 9,
    rivers: [mkRiverX(0.68, [[0.0019, 1.1, 0.07]], 0.045)]
  },
  {
    id: 'hongkong', name: '香港', en: 'HONG KONG', river: '维多利亚港',
    blurb: '海港宽阔、乘客蜂拥：刷客快 25%，列车也快',
    unlockNext: null, trainSpeed: 110, spawnFactor: 0.8, tunnels: 4,
    rivers: [mkRiverX(0.50, [[0.0009, 0.6, 0.05]], 0.085)]
  }
];

/** 按 id 找地图定义（找不到返回 null，调用方按无限模式处理） */
function mapById(id) {
  return MAPS.find(m => m.id === id) || null;
}
