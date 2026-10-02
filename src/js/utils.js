/* src/js/utils.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/** 通用小工具 */

/** 区间随机浮点数 */
const rand = (a, b) => a + Math.random() * (b - a);

/** 按 id 取 DOM（项目内所有 HUD 节点都靠它取） */
const el = id => document.getElementById(id);

/** 数值钳制 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
