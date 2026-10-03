/* src/js/world/simulate.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 世界推进：每天 tick 一次的所有逻辑都在这里
 * 由 core/loop.js 每帧调用 update(dt)，dt 已乘过倍速。
 */

/* ← 依赖 ../core/state.js （提供 G） */
/* ← 依赖 ../core/storage.js （提供 unlockTo） */
/* ← 依赖 ../core/audio.js （提供 AU） */
/* ← 依赖 ../config.js （提供 DAY_LEN, OC_LIMIT, MAX_STATIONS, UPGRADE_EVERY） */
/* ← 依赖 ../utils.js （提供 rand） */
/* ← 依赖 ./maps.js （提供 MAPS） */
/* ← 依赖 ./station.js （提供 spawnStation, spawnPassenger） */
/* ← 依赖 ./line.js （提供 buildPath, distribute） */
/* ← 依赖 ./train.js （提供 stepTrain） */
/* ← 依赖 ./floaters.js （提供 updateFloaters） */
/* ← 依赖 ../input/pointer.js （提供 editing） */
/* ← 依赖 ../ui/hud.js （提供 hintOnce, updateHUD, toast） */
/* ← 依赖 ../ui/modal.js （提供 openUpgrade, gameOver） */

/** 主推进函数；返回 false 表示本帧游戏已结束 */
function update(dt) {
  G.t += dt;
  G.dayT += dt;
  if (G.dayT >= DAY_LEN) { G.dayT -= DAY_LEN; G.day++; onDay(); }
  const week = Math.floor((G.day - 1) / 7) + 1;

  // 新站生成：周数越高间隔越短（最低 8.5s）；stationFactor 为地图倍率
  G.stationTimer -= dt;
  if (G.stationTimer <= 0) {
    G.stationTimer = Math.max(8.5, 15 - (week - 1) * 1.0) * rand(0.8, 1.2) * G.stationFactor;
    if (G.stations.length < MAX_STATIONS) spawnStation();
    else G.stationTimer = 5; // 满站后每 5s 再试一次
  }

  // 乘客生成：天数越高间隔越短（最低 2.7s）；第 3 周起 30% 概率一次刷两人
  // spawnFactor 为地图倍率（如香港 0.8 = 刷客快 25%）
  const pInt = Math.max(2.7, 6.2 - (G.day - 1) * 0.09) * G.spawnFactor;
  for (const st of G.stations) {
    st.spawnT -= dt;
    if (st.spawnT <= 0) {
      st.spawnT = pInt * rand(0.6, 1.4);
      if (st.passengers.length < 16) {
        spawnPassenger(st);
        if (week >= 3 && Math.random() < 0.3) spawnPassenger(st);
      }
    }
  }

  // 列车推进
  for (const line of G.lines) {
    distribute(line);
    const path = buildPath(line);
    line._path = path; // 缓存给渲染层与删除线路时取点用
    for (const tr of line.trains) stepTrain(tr, line, path, dt);
  }

  // 拥挤度结算：超载累加，缓解则回落；转满一圈即关站 → 游戏结束
  for (const st of G.stations) {
    if (st.passengers.length > st.cap) {
      st.oc += dt / OC_LIMIT;
      if (!st.warned) { st.warned = true; hintOnce(2, '车站人满为患！圆环转满游戏就会结束'); }
      if (st.oc >= 1) { gameOver(st); return false; }
    } else {
      st.oc = Math.max(0, st.oc - dt / 14);
      if (st.passengers.length <= st.cap - 2) st.warned = false;
    }
  }

  // 城市图达标 → 解锁下一城（官方规则：送达 N 人即解锁；每局只触发一次）
  if (G.mapIdx >= 0 && !G.unlockedThisRun) {
    const def = MAPS[G.mapIdx];
    if (def.unlockNext && G.delivered >= def.unlockNext) {
      G.unlockedThisRun = MAPS[G.mapIdx + 1].name;
      unlockTo(G.mapIdx + 2);
      toast('已送达 ' + def.unlockNext + ' 人 —— 解锁新城市：' + G.unlockedThisRun + '！');
      AU.chime();
    }
  }

  if (editing && editing.deny > 0) editing.deny -= dt;
  updateFloaters(dt);
  return true;
}

/** 跨天：刷新 HUD；每 UPGRADE_EVERY 天弹一次升级选择（第 4 / 7 / 10 … 天） */
function onDay() {
  updateHUD();
  if (G.day > 1 && (G.day - 1) % UPGRADE_EVERY === 0) {
    openUpgrade(Math.floor((G.day - 1) / UPGRADE_EVERY));
  }
}
