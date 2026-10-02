/* src/js/core/viewport.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 视口 / 画布上下文
 *
 * W / H / ctx 是全局词法作用域里的 `let` 绑定，所有脚本按名字直接读，不缓存在本地变量里，
 * 因此 resize 之后所有模块读到的 W/H 会自动更新，不需要任何同步机制。
 */

let W = 0;      // 逻辑宽（CSS 像素）
let H = 0;      // 逻辑高（CSS 像素）
let DPR = 1;    // 设备像素比（上限 2）
let ctx = null; // CanvasRenderingContext2D

let canvasEl = null;

/** 绑定画布并监听窗口尺寸变化 */
function initViewport(canvas) {
  canvasEl = canvas;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

/** 重算尺寸：按 DPR 放大位图，再用 setTransform 把绘制坐标拉回 CSS 像素 */
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvasEl.width  = W * DPR;
  canvasEl.height = H * DPR;
  canvasEl.style.width  = W + 'px';
  canvasEl.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

/** 拿到原始 canvas 元素（绑定事件用） */
const getCanvas = () => canvasEl;
