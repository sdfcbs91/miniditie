/* src/js/core/storage.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 解锁进度与最佳纪录的持久化（localStorage）
 *
 * 只存「元进度」：已解锁到第几城 + 每张图的历史最佳送达人数。
 * 不存对局内状态 —— 刷新后对局仍然重来，这是刻意保持的街机感。
 *
 * 惰性初始化（prog()）：项目约定顶层不执行语句，且 localStorage 在
 * 隐私模式 / 部分 file:// 环境下可能抛错，统一 try/catch 退化为内存存档。
 */

/* （无跨文件依赖，纯本地存取） */

const PROG_KEY = 'minimetro.progress.v1';

/** 内存中的进度对象：{ unlocked: 已解锁城市图数量（≥1）, best: { mapId: 最高送达 } } */
let PROG = null;

/** 取进度对象；首次访问时从 localStorage 读，读不到/解析失败则用默认值 */
function prog() {
  if (PROG) return PROG;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(PROG_KEY)); } catch (e) { raw = null; }
  PROG = (raw && typeof raw.unlocked === 'number' && raw.best) ? raw : { unlocked: 1, best: {} };
  return PROG;
}

function saveProg() {
  try { localStorage.setItem(PROG_KEY, JSON.stringify(prog())); } catch (e) { /* 无存档环境，静默退化 */ }
}

/** 某张图的历史最佳送达人数（无纪录返回 0） */
function bestOf(mapId) {
  return prog().best[mapId] || 0;
}

/** 结算时刷新最佳纪录（只升不降） */
function recordBest(mapId, delivered) {
  if (delivered > bestOf(mapId)) { prog().best[mapId] = delivered; saveProg(); }
}

/** 第 idx 张城市图是否已解锁（0 起，第一张恒解锁） */
function isMapUnlocked(idx) {
  return idx < prog().unlocked;
}

/** 把解锁进度推进到「前 n 张已解锁」（只增不减，由达标逻辑调用） */
function unlockTo(n) {
  if (n > prog().unlocked) { prog().unlocked = n; saveProg(); }
}
