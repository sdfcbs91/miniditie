/* src/js/main.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 入口：初始化顺序固定为
 *   视口 → 输入 → HUD → 控制 → 重置状态 → 主菜单 → 主循环
 * 注意：reset() 会读写 HUD/按钮，所以必须在 initHud/initControls 之后。
 * 进游戏先弹主菜单（无限模式 / 城市地图），玩家选完才真正 startGame(mapId)。
 */

/* ← 依赖 ./core/viewport.js （提供 initViewport） */
/* ← 依赖 ./core/state.js （提供 reset） */
/* ← 依赖 ./core/loop.js （提供 startLoop） */
/* ← 依赖 ./input/pointer.js （提供 initPointer） */
/* ← 依赖 ./ui/hud.js （提供 initHud） */
/* ← 依赖 ./ui/controls.js （提供 initControls） */
/* ← 依赖 ./ui/modal.js （提供 showMainMenu, icons） */

const canvas = document.getElementById('game');

initViewport(canvas);
initPointer(canvas);
initHud();
initControls();

showMainMenu();
icons();

startLoop();
