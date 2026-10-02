/* src/js/config.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 全局常量与调参入口
 * 想改游戏节奏 / 配色 / 形状，优先改这里，不要把魔法数字散落到各模块。
 */

/* ---- 配色 ---- */
const INK   = '#33302b';   // 主墨色（描边、文字）
const BG    = '#f5f2ea';   // 背景米色
const RIVER = '#cde6ee';   // 河流浅蓝

/* ---- 节奏参数 ---- */
const DAY_LEN    = 9;     // 一天的时长（秒）
const DWELL      = 0.55;  // 列车到站停留时间（秒）
const TRAIN_SPEED = 92;   // 列车速度（像素/秒）
const OC_LIMIT   = 38;    // 车站持续超载到关闭所需时间（秒）
const BASE_CAP   = 6;     // 车站基础容纳人数

/* ---- 数量上限 ---- */
const MAX_TRAINS        = 4;  // 单条线路最多列车数
const MAX_CARR_PER_TRAIN = 3; // 单列车最多挂车厢数

/* ---- 线路配色（按顺序分配，用完即无新线路可开） ---- */
const PALETTE = ['#dc493a', '#2d8fd5', '#53a548', '#f0b429', '#f08a24', '#9b59b6', '#12aaa3'];

/* ---- 车站形状 ---- */
const SHAPES_SPECIAL = ['star', 'diamond', 'pentagon', 'cross', 'hexagon']; // 特殊站（低概率、全场唯一）
const SHAPE_NAMES = {
  circle: '圆形', triangle: '三角形', square: '方形',
  star: '星形', diamond: '菱形', pentagon: '五边形', cross: '十字形', hexagon: '六边形'
};

/* ---- 乘客目的地权重（越大越容易被选中） ---- */
const PASSENGER_WEIGHT = {
  circle: 4, triangle: 4, square: 3,
  star: 1.6, diamond: 1.6, pentagon: 1.6, cross: 1.6, hexagon: 1.6
};

/* ---- 生成规则 ---- */
const MAX_STATIONS = 28;  // 站点数量上限
