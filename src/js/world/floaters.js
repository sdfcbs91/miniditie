/* src/js/world/floaters.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 飘字：建站提示、+N 送达提示等短生命周期文字。
 * 独立于渲染层，world 与 render 都可安全引用。
 */

/* ← 依赖 ../core/state.js （提供 G） */
/* ← 依赖 ../core/viewport.js （提供 ctx） */

/** 在 (x, y) 处冒一条飘字 */
function floater(x, y, txt, color) {
  G.floaters.push({ x, y, txt, t: 0, life: 1.1, color: color || '#2e7d46' });
}

/** 每帧推进飘字寿命，过期移除（由 simulate 调用） */
function updateFloaters(dt) {
  G.floaters = G.floaters.filter(f => (f.t += dt) < f.life);
}

/** 绘制全部飘字（向上飘 + 淡出） */
function drawFloaters() {
  ctx.textAlign = 'center';
  ctx.font = '800 13px Nunito, sans-serif';
  for (const f of G.floaters) {
    ctx.globalAlpha = 1 - f.t / f.life;
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, f.x, f.y - f.t * 26);
  }
  ctx.globalAlpha = 1;
}
