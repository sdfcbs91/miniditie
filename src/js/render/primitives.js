/* src/js/render/primitives.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * Canvas 基础图元：正多边形、车站形状、圆角矩形
 * 只负责「往当前路径里塞点/塞矩形」，不负责 fill/stroke（由调用方决定）。
 */

/* ← 依赖 ../core/viewport.js （提供 ctx） */

/** 正 n 边形（rot 为起始角） */
function poly(x, y, r, n, rot) {
  for (let i = 0; i < n; i++) {
    const a = rot + i * Math.PI * 2 / n;
    i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

/** 按形状名生成路径（车站、乘客、列车内乘客小图标共用） */
function shapePath(shape, x, y, r) {
  ctx.beginPath();
  switch (shape) {
    case 'circle':   ctx.arc(x, y, r, 0, Math.PI * 2); break;
    case 'triangle': poly(x, y, r, 3, -Math.PI / 2); break;
    case 'square':   ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break;
    case 'diamond':  poly(x, y, r, 4, -Math.PI / 2); break;
    case 'pentagon': poly(x, y, r, 5, -Math.PI / 2); break;
    case 'hexagon':  poly(x, y, r, 6, 0); break;
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 === 0 ? r : r * 0.48;
        i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
          : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    }
    case 'cross': {
      const a = r * 0.38;
      ctx.moveTo(x - a, y - r); ctx.lineTo(x + a, y - r); ctx.lineTo(x + a, y - a); ctx.lineTo(x + r, y - a);
      ctx.lineTo(x + r, y + a); ctx.lineTo(x + a, y + a); ctx.lineTo(x + a, y + r); ctx.lineTo(x - a, y + r);
      ctx.lineTo(x - a, y + a); ctx.lineTo(x - r, y + a); ctx.lineTo(x - r, y - a); ctx.lineTo(x - a, y - a);
      ctx.closePath();
      break;
    }
  }
}

/** 圆角矩形路径 */
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
