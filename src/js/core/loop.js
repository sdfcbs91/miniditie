/* src/js/core/loop.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 主循环：固定 requestAnimationFrame，dt 上限 0.05s（切后台回来不会瞬移）
 * 顺序：先推进世界，再渲染。
 */

/* ← 依赖 ./state.js （提供 G） */
/* ← 依赖 ../world/simulate.js （提供 update） */
/* ← 依赖 ../render/scene.js （提供 render） */

let last = performance.now();

function startLoop() {
  last = performance.now();
  requestAnimationFrame(frame);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (G.running && !G.paused && !G.modal && !G.over) update(dt * G.speed);
  render();
}
