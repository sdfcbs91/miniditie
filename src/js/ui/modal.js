/* src/js/ui/modal.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 弹窗层：主菜单 / 城市选择 / 升级三选一 / 游戏结束
 * 弹窗期间 G.modal = true，主循环不再推进世界。
 *
 * 入口流程：进游戏先弹主菜单（无限模式 / 城市地图）→ 选城市地图则进选图页，
 * 官方 6 城逐张解锁（上一城单局送达达标即解锁下一城，进度存 localStorage）。
 */

/* ← 依赖 ../core/state.js （提供 G, reset） */
/* ← 依赖 ../core/storage.js （提供 prog, bestOf, recordBest, isMapUnlocked） */
/* ← 依赖 ../core/audio.js （提供 AU） */
/* ← 依赖 ../config.js （提供 PALETTE, SHAPE_NAMES, UPGRADE_OPTS） */
/* ← 依赖 ../utils.js （提供 el） */
/* ← 依赖 ../world/maps.js （提供 MAPS） */
/* ← 依赖 ../input/pointer.js （提供 clearEditing） */
/* ← 依赖 ./hud.js （提供 updateHUD, renderChips, hideHintAfter, toast） */

/** 重绘 lucide 图标（弹窗是动态 innerHTML，插入后必须调用） */
function icons() {
  try { window.lucide && lucide.createIcons(); } catch (e) { /* 图标库没加载就忽略 */ }
}

function hideModal() {
  el('modal').innerHTML = '';
  G.modal = false;
}

/* ---------------- 主菜单 / 城市选择 ---------------- */

/** 开一局：按地图重置 → 关弹窗 → 起跑 */
function startGame(mapId) {
  AU.init();
  reset(mapId);
  hideModal();
  G.running = true;
  hideHintAfter(14000);
  if (G.mapIdx >= 0) {
    const def = MAPS[G.mapIdx];
    toast(def.name + ' · ' + def.river + (def.unlockNext
      ? '：送达 ' + def.unlockNext + ' 人解锁下一城'
      : '：最终挑战，尽情发挥'));
  }
}

/** 主菜单：无限模式 / 城市地图 二选一（每次进游戏都出现） */
function showMainMenu() {
  reset(); // 背景回到无限模式的默认河流；G.modal 随之置 true
  clearEditing();

  const eBest = bestOf('endless');
  const unlockedCount = Math.min(prog().unlocked, MAPS.length);

  el('modal').innerHTML =
    '<div class="modal-mask"><div class="card pop w-[min(94vw,540px)] p-8 md:p-10 text-center">'
    + '<div class="flex items-center justify-center gap-2.5 mb-1">'
    + '<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="9" fill="#f5f2ea" stroke="#33302b" stroke-width="3"/></svg>'
    + '<svg width="26" height="26" viewBox="0 0 26 26"><polygon points="13,4 23,21 3,21" fill="#f5f2ea" stroke="#33302b" stroke-width="3" stroke-linejoin="round"/></svg>'
    + '<svg width="26" height="26" viewBox="0 0 26 26"><rect x="5" y="5" width="16" height="16" fill="#f5f2ea" stroke="#33302b" stroke-width="3"/></svg>'
    + '<svg width="26" height="26" viewBox="0 0 26 26"><polygon points="13,2 15.9,9.4 24,9.7 17.6,14.7 19.7,22.5 13,18 6.3,22.5 8.4,14.7 2,9.7 10.1,9.4" fill="#f5f2ea" stroke="#33302b" stroke-width="2.4" stroke-linejoin="round"/></svg>'
    + '</div>'
    + '<h1 class="text-4xl font-black tracking-tight">迷你地铁</h1>'
    + '<div class="text-[11px] font-black tracking-[0.4em] opacity-40 mt-1">MINI METRO</div>'
    + '<p class="mt-3 text-sm opacity-70 font-bold">为不断扩张的城市规划地铁网络，别让车站挤爆。</p>'
    + '<div class="mt-7 space-y-3 text-left">'
    + '<button id="btnEndless" class="menubtn">'
    + '<span class="menubic" style="background:#dc493a"><i data-lucide="infinity" class="w-5 h-5"></i></span>'
    + '<span class="flex-1"><span class="block font-black text-lg">无限模式</span>'
    + '<span class="block text-xs opacity-60 font-bold mt-0.5">随机河流 · 无尽挑战'
    + (eBest ? ' · 历史最佳 ' + eBest + ' 人' : '') + '</span></span>'
    + '<i data-lucide="chevron-right" class="w-5 h-5 opacity-40"></i>'
    + '</button>'
    + '<button id="btnMaps" class="menubtn">'
    + '<span class="menubic" style="background:#2d8fd5"><i data-lucide="map" class="w-5 h-5"></i></span>'
    + '<span class="flex-1"><span class="block font-black text-lg">城市地图</span>'
    + '<span class="block text-xs opacity-60 font-bold mt-0.5">官方 6 城 · 逐城解锁（已解锁 ' + unlockedCount + '/' + MAPS.length + '）</span></span>'
    + '<i data-lucide="chevron-right" class="w-5 h-5 opacity-40"></i>'
    + '</button>'
    + '</div>'
    + '<div class="mt-5 text-[11px] opacity-40 font-bold">灵感来自 Dinosaur Polo Club 的《Mini Metro》</div>'
    + '</div></div>';

  icons();
  el('btnEndless').onclick = () => startGame('endless');
  el('btnMaps').onclick = () => { AU.tick(); showMapSelect(); };
}

/** 城市选择：6 张卡片，未解锁的置灰并显示解锁条件 */
function showMapSelect() {
  G.modal = true;

  let cards = '';
  MAPS.forEach((m, i) => {
    const unlocked = isMapUnlocked(i);
    let foot;
    if (!unlocked) {
      const prev = MAPS[i - 1];
      foot = '在' + prev.name + '送达 ' + prev.unlockNext + ' 人解锁';
    } else {
      const b = bestOf(m.id);
      const bestTxt = b ? '最佳 ' + b + ' 人' : '';
      const goalTxt = m.unlockNext ? '送达 ' + m.unlockNext + ' 人解锁' + MAPS[i + 1].name : '最终挑战';
      foot = [bestTxt, goalTxt].filter(Boolean).join(' · ');
    }
    cards += '<button class="mapcard' + (unlocked ? '' : ' locked') + '" data-i="' + i + '">'
      + '<div class="mapbar" style="background:' + PALETTE[i % PALETTE.length] + '"></div>'
      + '<div class="text-lg font-black mt-1">' + m.name + '</div>'
      + '<div class="text-[10px] font-black tracking-[0.25em] opacity-40">' + m.en + '</div>'
      + '<div class="mt-1.5 text-[12px] font-bold opacity-60">' + m.river + '</div>'
      + '<div class="mt-1 text-[11px] opacity-50 leading-4 min-h-[32px] font-bold">' + m.blurb + '</div>'
      + (unlocked
          ? '<div class="mt-2 text-[11px] font-black" style="color:#2e7d46">' + foot + '</div>'
          : '<div class="maplocktext"><i data-lucide="lock" class="w-3.5 h-3.5"></i><span>' + foot + '</span></div>')
      + '</button>';
  });

  el('modal').innerHTML =
    '<div class="modal-mask"><div class="card pop w-[min(96vw,720px)] p-6 md:p-8">'
    + '<div class="flex items-center gap-3 mb-5">'
    + '<button id="btnBack" class="card hbtn" title="返回主菜单"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>'
    + '<div><div class="text-2xl font-black">城市地图</div>'
    + '<div class="text-xs opacity-50 font-bold mt-0.5">官方《Mini Metro》初版 6 城 · 达标解锁下一城 · 纪录自动保存</div></div>'
    + '</div>'
    + '<div class="mapgrid">' + cards + '</div>'
    + '</div></div>';

  icons();
  el('btnBack').onclick = () => { AU.tick(); showMainMenu(); };
  el('modal').querySelectorAll('.mapcard').forEach(c => {
    c.onclick = () => {
      const i = +c.dataset.i;
      if (!isMapUnlocked(i)) {
        const prev = MAPS[i - 1];
        toast('先在' + prev.name + '送达 ' + prev.unlockNext + ' 人，才能解锁 ' + MAPS[i].name);
        AU.deny();
        return;
      }
      startGame(MAPS[i].id);
    };
  });
}

/* ---------------- 升级选择（节奏由 config.js 的 UPGRADE_EVERY / UPGRADE_OPTS 控制） ---------------- */

/** 升级项定义：ok() 判断是否还能选，apply() 立即生效 */
const UPGRADES = [
  { id: 'line', icon: 'circle-dot', color: '#dc493a', name: '新线路', desc: '+1 条线路 与 +1 辆列车', ok: () => G.unlockedLines < PALETTE.length, apply: () => { G.unlockedLines++; G.spareLocos++; } },
  { id: 'loco', icon: 'train-front', color: '#2d8fd5', name: '列车', desc: '+1 辆列车（在线路牌上点「+列车」分配）', ok: () => true, apply: () => { G.spareLocos++; } },
  { id: 'car', icon: 'layers', color: '#53a548', name: '车厢', desc: '+1 节车厢（提升单列运力）', ok: () => true, apply: () => { G.spareCars++; } },
  { id: 'tunnel', icon: 'mountain', color: '#8a6f4d', name: '隧道', desc: '+2 条隧道（跨河修线的必需品）', ok: () => true, apply: () => { G.totalTunnels += 2; } },
  { id: 'cap', icon: 'arrow-right-left', color: '#9b59b6', name: '站台扩建', desc: '所有车站的容纳上限 +2', ok: () => true, apply: () => { G.capBonus += 2; G.stations.forEach(s => s.cap += 2); } }
];

/** 升级弹窗：从可用升级里随机抽 UPGRADE_OPTS 个 N 选一 */
function openUpgrade(round) {
  clearEditing();
  G.modal = true;

  const opts = UPGRADES.filter(u => u.ok()).sort(() => Math.random() - 0.5).slice(0, UPGRADE_OPTS);
  let btns = '';
  opts.forEach((u, i) => {
    btns += '<button class="optbtn" data-i="' + i + '">'
      + '<span class="optic" style="background:' + u.color + '"><i data-lucide="' + u.icon + '" class="w-5 h-5"></i></span>'
      + '<span><span class="block font-black">' + u.name + '</span>'
      + '<span class="block text-xs opacity-60 font-bold mt-0.5">' + u.desc + '</span></span>'
      + '</button>';
  });

  el('modal').innerHTML =
    '<div class="modal-mask"><div class="card pop w-[min(92vw,430px)] p-7 text-center">'
    + '<div class="text-[11px] font-black opacity-40 tracking-[0.3em]">第 ' + round + ' 次升级</div>'
    + '<div class="text-2xl font-black mt-1">城市在扩张 — 选择升级</div>'
    + '<div class="mt-6 space-y-3">' + btns + '</div>'
    + '</div></div>';

  icons();
  el('modal').querySelectorAll('.optbtn').forEach(b => {
    b.onclick = () => {
      opts[+b.dataset.i].apply();
      AU.chime();
      hideModal();
      updateHUD();
      renderChips();
    };
  });
}

/* ---------------- 游戏结束 ---------------- */

function gameOver(st) {
  G.over = true;
  G.running = false;
  G.modal = true;
  clearEditing();
  AU.over();

  // 结算：刷新本图最佳纪录（无限模式也记，key 为 'endless'）
  recordBest(G.mapId, G.delivered);
  const best = bestOf(G.mapId);

  el('modal').innerHTML =
    '<div class="modal-mask"><div class="card pop w-[min(92vw,430px)] p-8 text-center">'
    + '<div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center" style="background:#d6454518;color:#d64545"><i data-lucide="alarm-clock" class="w-7 h-7"></i></div>'
    + '<div class="text-2xl font-black mt-4">线路瘫痪' + (G.mapIdx >= 0 ? ' · ' + G.mapName : '') + '</div>'
    + '<p class="text-sm font-bold opacity-60 mt-1">一座' + SHAPE_NAMES[st.shape] + '车站因过度拥挤而关闭，地铁网络随之崩溃。</p>'
    + (G.unlockedThisRun
        ? '<div class="mt-4 rounded-xl px-4 py-2.5 font-black text-sm" style="background:#2e7d4618;color:#2e7d46">🎉 已解锁新城市：' + G.unlockedThisRun + '（回主菜单可进入）</div>'
        : '')
    + '<div class="mt-5 grid grid-cols-3 gap-3">'
    + stat(G.delivered, '运送乘客')
    + stat(G.day, '坚持天数')
    + stat(best, '历史最佳')
    + '</div>'
    + '<div class="mt-7 flex gap-3">'
    + '<button id="btnMenu" class="flex-1 py-3.5 rounded-2xl font-black transition-transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2" style="background:rgba(51,48,43,.08);color:#33302b"><i data-lucide="map" class="w-5 h-5"></i>主菜单</button>'
    + '<button id="btnRestart" class="flex-1 py-3.5 rounded-2xl text-white font-black transition-transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2" style="background:#33302b"><i data-lucide="rotate-ccw" class="w-5 h-5"></i>重新开始</button>'
    + '</div>'
    + '</div></div>';

  icons();
  el('btnRestart').onclick = () => { reset(G.mapId); hideModal(); G.running = true; };
  el('btnMenu').onclick = () => showMainMenu();

  function stat(v, label) {
    return '<div class="rounded-2xl py-3" style="background:rgba(51,48,43,.05)">'
      + '<div class="text-xl font-black">' + v + '</div>'
      + '<div class="text-[11px] font-bold opacity-50 mt-0.5">' + label + '</div></div>';
  }
}
