/* src/js/world/train.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 列车运行：沿路径推进、到站上下客
 */

/* ← 依赖 ../core/viewport.js （提供 W, H） */
/* ← 依赖 ../core/state.js （提供 G） */
/* ← 依赖 ../core/audio.js （提供 AU） */
/* ← 依赖 ../config.js （提供 DWELL） */
/* ← 依赖 ../utils.js （提供 el） */
/* ← 依赖 ./line.js （提供 pointAt, capOf） */
/* ← 依赖 ./floaters.js （提供 floater） */

/**
 * 推进一辆列车（按剩余步长逐段推进，跨过站点就触发到站逻辑）
 * 速度读 G.trainSpeed（地图可覆写，如墨尔本电车更慢、香港更快）
 */
function stepTrain(tr, line, path, dt) {
  if (tr.dwell > 0) { tr.dwell -= dt; return; }

  let rem = G.trainSpeed * dt;
  const n = line.stations.length;
  let guard = 8; // 防死循环：极端小 dt 下最多推进 8 段

  while (rem > 1e-4 && guard-- > 0) {
    let nextIdx;
    if (line.loop) {
      nextIdx = (tr.idx + 1) % n;
    } else {
      nextIdx = tr.idx + tr.dir;
      if (nextIdx < 0 || nextIdx >= n) { tr.dir *= -1; continue; } // 到端点折返
    }

    const target = path.cum[nextIdx];
    let distTo;
    if (line.loop) {
      distTo = target - tr.d;
      if (distTo <= 1e-6) distTo += path.total; // 环形：绕一圈
    } else {
      distTo = (target - tr.d) * tr.dir;
    }

    if (distTo <= rem) {
      tr.d = line.loop ? (target % path.total) : target;
      tr.idx = nextIdx;
      arriveAt(tr, line, line.stations[tr.idx]);
      if (!line.loop && (tr.idx === 0 || tr.idx === n - 1)) tr.dir *= -1;
      tr.dwell = DWELL;
      return;
    } else {
      tr.d += (line.loop ? 1 : tr.dir) * rem;
      if (line.loop) tr.d = ((tr.d % path.total) + path.total) % path.total;
      rem = 0;
    }
  }
}

/** 到站：先下客（目的地匹配），再上客（目的地在本线服务范围内且未超载） */
function arriveAt(tr, line, st) {
  let got = 0;
  tr.passengers = tr.passengers.filter(p => { if (p.shape === st.shape) { got++; return false; } return true; });

  if (got) {
    G.delivered += got;
    AU.deliver();
    floater(st.nx * W, st.ny * H - 22, '+' + got, '#2e7d46');
    el('delivered').textContent = G.delivered;
  }

  const cap = capOf(tr);
  for (let i = 0; i < st.passengers.length && tr.passengers.length < cap;) {
    const p = st.passengers[i];
    if (line.served.has(p.shape)) { tr.passengers.push(p); st.passengers.splice(i, 1); }
    else i++;
  }
}
