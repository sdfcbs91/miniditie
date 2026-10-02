/* src/js/ui/controls.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 右上角控制按钮 + 键盘快捷键 + 切后台自动暂停
 */

/* ← 依赖 ../core/state.js （提供 G） */
/* ← 依赖 ../core/audio.js （提供 AU） */
/* ← 依赖 ../utils.js （提供 el） */
/* ← 依赖 ./modal.js （提供 icons） */

/** 暂停/播放图标跟随 G.paused 切换 */
function setPauseIcon() {
  el('btnPause').innerHTML = '<i data-lucide="' + (G.paused ? 'play' : 'pause') + '" class="w-5 h-5"></i>';
  icons();
}

function initControls() {
  el('btnPause').onclick = () => {
    if (G.modal || G.over) return;
    G.paused = !G.paused;
    setPauseIcon();
  };

  el('btnSpeed').onclick = () => {
    G.speed = G.speed === 1 ? 2 : 1;
    el('btnSpeed').textContent = G.speed + '×';
  };

  el('btnMute').onclick = () => {
    AU.muted = !AU.muted;
    el('btnMute').innerHTML = '<i data-lucide="' + (AU.muted ? 'volume-x' : 'volume-2') + '" class="w-5 h-5"></i>';
    icons();
  };

  document.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); if (!G.modal && !G.over) { G.paused = !G.paused; setPauseIcon(); } }
    if (e.code === 'KeyF') { el('btnSpeed').onclick(); }
    if (e.code === 'KeyM') { el('btnMute').onclick(); }
  });

  // 切到后台自动暂停，回来玩家自己点继续，避免挂机被挤爆
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.running && !G.modal && !G.over) { G.paused = true; setPauseIcon(); }
  });
}
