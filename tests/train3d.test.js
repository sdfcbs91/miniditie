'use strict';
// 零依赖回归检查：经典脚本共享同一上下文，画布使用只记录操作的替身。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script src="(\.\/src\/js\/[^\"]+)"/g)].map(m => m[1].split('?')[0]);
assert.equal(scripts.length, 32);
assert.equal(scripts.at(-1), './src/js/main.js');
assert(!/<script[^>]*type=["']module/i.test(html));
assert(!/(?:src|href)=["']https?:\/\//i.test(html));
const names = new Map();
for (const file of scripts) {
  const src = fs.readFileSync(file, 'utf8');
  cp.execFileSync(process.execPath, ['--check', file]);
  for (const m of src.matchAll(/^(?:let|const|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    assert(!names.has(m[1]), `重复的全局声明 ${m[1]}: ${file} / ${names.get(m[1])}`);
    names.set(m[1], file);
  }
}

const calls = [];
const canvas = new Proxy({}, {
  get(target, key) {
    if (key === 'createLinearGradient') return () => ({addColorStop() {}});
    if (!(key in target)) target[key] = (...args) => {
      for (const arg of args) if (typeof arg === 'number') assert(Number.isFinite(arg), `${String(key)} 坐标非法`);
      calls.push([key, ...args]);
    };
    return target[key];
  },
  set(target, key, value) { target[key] = value; return true; }
});
const element = () => ({ style: {}, firstElementChild: { style: {} }, classList: { add() {}, remove() {}, toggle() {} },
  getContext: () => canvas, addEventListener() {}, setAttribute() {}, querySelector: () => element(), querySelectorAll: () => [] });
const elements = new Map();
const context = vm.createContext({ console, Math, Set, Map, Date, canvasMock: canvas, calls,
  performance: { now: () => 0 },
  document: { createElement() { return element(); }, getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } },
  window: { addEventListener() {}, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1 },
  localStorage: { getItem() { return null; }, setItem() {} }, setTimeout() {}, clearTimeout() {} });
for (const file of scripts.slice(0, -1)) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
vm.runInContext(`
  W = 1200; H = 800; ctx = canvasMock;
  updateHUD = () => {}; renderChips = () => {}; setPauseIcon = () => {};
  AU.deliver = () => {}; AU.chime = () => {};
`, context);
for (const map of ['endless', 'london', 'paris', 'newyork', 'berlin', 'melbourne', 'hongkong', 'guangfo']) {
  for (const loop of [false, true]) {
    vm.runInContext(`reset(${JSON.stringify(map)});`, context);
    vm.runInContext(`
      G.stations = [
        {nx:.2, ny:.3, shape:'circle', passengers:[], cap:6, oc:0, born:0, spawnT:100},
        {nx:.6, ny:.3, shape:'triangle', passengers:[], cap:6, oc:0, born:0, spawnT:100},
        {nx:.7, ny:.6, shape:'square', passengers:[], cap:6, oc:0, born:0, spawnT:100}
      ];
      G.lines = [{stations:G.stations, loop:${loop}, color:'#dc514d', carriages:3,
        served:new Set(['circle','triangle','square']), trains:[{idx:0, d:0, dir:1, dwell:0,
          passengers:Array.from({length:G.carrCap * 4}, (_, i) => ({shape:['circle','triangle','square'][i % 3]})), carriages:3}]}];
      G.t = 1; G.stationTimer = 100;
      for (let i = 0; i < 60; i++) { update(.1); render(); }
      { const before = JSON.stringify(G);
      render();
      if (JSON.stringify(G) !== before) throw Error('渲染改变了游戏状态'); }
    `, context);
  }
}
// 真实到站流程：首站上客、实际抵达计数、折返、换乘、断线和运力上限。
vm.runInContext(`
  { W=1200; H=800; reset('london'); AU.deliver=()=>{}; toast=()=>{};
    const station=(x,shape)=>({nx:x,ny:.4,shape,passengers:[],cap:8,oc:0});
    const a=station(.2,'circle'), b=station(.4,'triangle'), c=station(.6,'square');
    G.stations=[a,b,c]; G.lines=[]; G.carrCap=2; G.spareLocos=4;
    const line=stations=>({stations,loop:false,trains:[],carriages:0,color:'#e33'});
    const l1=line([a,b]); G.lines=[l1];
    a.passengers=[{shape:'triangle'},{shape:'square'},{shape:'triangle'},{shape:'triangle'}];
    addTrain(l1); l1._path=buildPath(l1);
    if (l1.trains[0].passengers.length!==2 || a.passengers.length!==2 || G.delivered!==0) throw Error('首站上客/运力/不可达路线错误');
    stepTrain(l1.trains[0],l1,l1._path,100);
    if (G.delivered!==2 || el('delivered').textContent!==2 || l1.trains[0].passengers.length) throw Error('直达未计数');
    b.passengers.push({shape:'circle'});
    stepTrain(l1.trains[0],l1,l1._path,100); // 等待停站
    arriveAt(l1.trains[0],l1,b); // 乘客在终点上车后折返
    stepTrain(l1.trains[0],l1,l1._path,100);
    if (G.delivered!==3 || l1.trains[0].idx!==0) throw Error('折返送达失败');
    // 第二条线路接通前，去方形的乘客不能上车；接通后在三角站换乘。
    G.lines=[]; a.passengers=[{shape:'square'}]; b.passengers=[]; c.passengers=[]; G.delivered=0;
    const x=line([a,b]), y=line([b,c]); G.lines=[x]; addTrain(x); x._path=buildPath(x);
    if (x.trains[0].passengers.length || a.passengers.length!==1) throw Error('不可达乘客错误上车');
    G.lines.push(y); addTrain(y); y._path=buildPath(y);
    arriveAt(x.trains[0],x,a);
    stepTrain(x.trains[0],x,x._path,100);
    if (G.delivered!==0 || b.passengers.length!==1 || x.trains[0].passengers.length) throw Error('换乘应下车等候但不得提前计数');
    arriveAt(y.trains[0],y,b); stepTrain(y.trains[0],y,y._path,100);
    if (G.delivered!==1 || b.passengers.length || y.trains[0].passengers.length) throw Error('换乘最终送达失败');
    // 删除线路不制造虚假送达，也不将乘客放在自身目的形状站导致永久滞留。
    x.trains[0].passengers=[{shape:'triangle'}]; x.trains[0].d=x._path.total;
    deleteLine(x);
    if (G.delivered!==1 || a.passengers.length!==1 || b.passengers.length) throw Error('删线乘客恢复错误');
  }
`, context);
// 八市完整区县索引、区域点面命中、相机定位和独立广佛边界隔离。
vm.runInContext(`
  { W=1200; H=800; reset('endless');
    const counts={广州:11,佛山:5,中山:1,珠海:3,东莞:1,清远:8,深圳:10,惠州:5};
    if (REGION_DISTRICTS.length!==44) throw Error('八市地区数量错误');
    for (const [city,count] of Object.entries(counts)) if (REGION_DISTRICTS.filter(d=>d.city===city).length!==count) throw Error('城市地区缺失：'+city);
    for (const d of REGION_DISTRICTS) {
      if (guangfoDistrictAt(...d.label)!==d) throw Error('区县标签不在自身边界：'+d.city+d.name);
      earthFocusDistrict(d.name,d.city);
      const at=earthUnproject(W/2,H/2);
      if (Math.abs(at.lon-d.label[0])>1e-8 || Math.abs(at.lat-d.label[1])>1e-8) throw Error('区县无法定位：'+d.name);
    }
    const dongguan=REGION_DISTRICTS.find(d=>d.name==='东莞市');
    reset('guangfo'); if (guangfoDistrictAt(...dongguan.label)) throw Error('独立广佛地图污染');
  }
`, context);
// Three 几何沿原屏幕投影对齐，缓存颜色/流向属性；未加载库时无副作用并回退。
vm.runInContext(`
  { if (drawWaterThree() !== false) throw Error('缺少 Three 时必须降级');
    const T = { BufferGeometry: class { constructor() { this.attributes={}; } setAttribute(n,v) { this.attributes[n]=v; } },
      BufferAttribute: class { constructor(a,n) { this.array=a; this.itemSize=n; } } };
    const m={vertices:new Float32Array([10,20,5, .6,.8,0, 30,.5,1])};
    const geometry=waterThreeGeometry(m,0,1,100,true,T);
    const p=geometry.attributes.position.array, flow=geometry.attributes.aWaterFlow.array;
    if (Math.abs(p[0]-8.1)>.0001 || p[1]!==84 || p[2]!==5 || flow[0]!==30 || flow[1]!==.5) throw Error('Three 河流坐标或流向错误');
    if (geometry.attributes.normal.array[2]!==1) throw Error('Three 水面法线错误');
  }
`, context);
// 八种车站轮廓与站点形状一致；无 Three/WebGL 时使用带阴影的 Canvas 挤出。
vm.runInContext(`
  { const expected={circle:40,triangle:3,square:4,diamond:4,pentagon:5,hexagon:6,star:10,cross:12};
    for (const [shape,count] of Object.entries(expected)) {
      const points=stationThreeOutline(shape);
      if (points.length!==count || points.some(p=>!Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw Error('车站轮廓错误: '+shape);
    }
    const tip=stationThreeOutline('triangle')[0];
    if (Math.abs(tip[0])>1e-10 || tip[1]!==12) throw Error('三角站顶点方向错误');
    const oldLines=G.lines, stA={shape:'circle'}, stB={shape:'triangle'};
    const lineA={color:'#dc493a',stations:[stA,stB,stA]}, lineB={color:'#2d8fd5',stations:[stA]};
    G.lines=[lineA,lineB];
    if (stationServiceColors(stA).join(',')!=='#dc493a,#2d8fd5' || stationServiceColors(stB).join(',')!=='#dc493a') throw Error('换乘站线路识别错误');
    G.lines=[lineA];
    if (stationServiceColors(stA).length!==1) throw Error('删线后站点未恢复单线样式');
    G.lines=oldLines;
    if (drawStationsThree()!==false) throw Error('无 Three 时站点必须降级');
    const before=JSON.stringify(G), original=shapePath; let paths=0;
    shapePath=(...args)=>{ paths++; original(...args); };
    drawStation({nx:.5,ny:.5,born:0,shape:'star',passengers:[{shape:'circle'}],cap:6,oc:.8},false);
    shapePath=original;
    if (paths!==2 || JSON.stringify(G)!==before) throw Error('Canvas 站点降级或渲染只读错误');
  }
`, context);
// 检查终点换向瞬间各节车厢的投影中心没有跳到车头。
vm.runInContext(`
  reset('endless');
  G.stations = [{nx:.2, ny:.5}, {nx:.8, ny:.5}];
  G.lines = [{stations:G.stations, loop:false, color:'#e33', trains:[], carriages:3}];
  G.lines[0]._path = buildPath(G.lines[0]);
  G.lines[0].trains = [{d:G.lines[0]._path.total, dir:1, carriages:3, passengers:[]}];
  calls.length = 0; drawTrain(G.lines[0].trains[0], G.lines[0]);
  globalThis.beforeCenters = calls.filter(c => c[0] === 'translate').slice(0, 4);
  G.lines[0].trains[0].dir = -1;
  calls.length = 0; drawTrain(G.lines[0].trains[0], G.lines[0]);
  globalThis.afterCenters = calls.filter(c => c[0] === 'translate').slice(0, 4);
`, context);
assert.deepEqual(context.beforeCenters, context.afterCenters);
assert.equal(new Set(context.afterCenters.map(c => c[1])).size, 4);
// 真正推进到两端再换向，检查每节车厢在换向前后的地面中心。
for (const end of ['start', 'end']) {
  vm.runInContext(`
    { const line = G.lines[0], path = line._path, tr = line.trains[0];
      tr.d = ${end === 'end' ? 'path.total - .01' : '.01'};
      tr.idx = ${end === 'end' ? '0' : '1'};
      tr.dir = ${end === 'end' ? '1' : '-1'}; tr.dwell = 0;
      calls.length = 0; drawTrain(tr, line);
      globalThis.approachCenters = calls.filter(c => c[0] === 'translate').slice(0, 4);
      // 空站不触发乘客或声音逻辑。
      line.stations.forEach(s => { s.passengers = []; });
      stepTrain(tr, line, path, .01);
      if (tr.dir !== ${end === 'end' ? '-1' : '1'}) throw Error('未在端点换向');
      calls.length = 0; drawTrain(tr, line);
      globalThis.departureCenters = calls.filter(c => c[0] === 'translate').slice(0, 4);
    }
  `, context);
  for (let i = 0; i < 4; i++) {
    assert(Math.hypot(context.approachCenters[i][1] - context.departureCenters[i][1],
      context.approachCenters[i][2] - context.departureCenters[i][2]) < .02);
  }
}
// 满载时所有乘客图标仍然绘制，空/退化路径不会产生非法坐标。
vm.runInContext(`
  { const original = shapePath; let count = 0;
    shapePath = (...args) => { count++; original(...args); };
    G.carrCap = 9;
    const line = G.lines[0], tr = line.trains[0];
    tr.passengers = Array.from({length:36}, (_, i) => ({shape:['circle','triangle','square'][i % 3]}));
    drawTrain(tr, line);
    if (count !== 36) throw Error('乘客图标数量不正确');
    shapePath = original;
    drawTrain(tr, {loop:false, _path:{total:0}});
  }
`, context);
// 广佛为独立开放地图；完整 16 区的地理轮廓、入口与旧进度互不影响。
vm.runInContext(`
  { const expected = ['荔湾区','越秀区','海珠区','天河区','白云区','黄埔区','番禺区','花都区','南沙区','从化区','增城区','禅城区','南海区','顺德区','三水区','高明区'];
    if (GUANGFO_DISTRICTS.length !== 16 || expected.some(n => !GUANGFO_DISTRICTS.some(d => d.name === n))) throw Error('行政区不完整');
    PROG = {unlocked:1, best:{}};
    if (!isMapUnlocked(6) || isMapUnlocked(1)) throw Error('免费区域图影响经典解锁');
    showMainMenu();
    if (!el('modal').innerHTML.includes('btnGuangfo')) throw Error('主菜单缺少入口');
    AU.init = () => {}; el('btnGuangfo').onclick();
    if (G.mapId !== 'guangfo' || !G.running || el('guangfoLegend').hidden) throw Error('广佛入口无法开局');
    if (PROG.unlocked !== 1) throw Error('广佛开局改变了解锁进度');
    calls.length = 0; drawGuangfoLabels();
    const labels = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
    if (expected.some(n => !labels.includes(n))) throw Error('桌面地图遗漏区名');
    showMapSelect();
    if (!el('modal').innerHTML.includes('自由挑战 · 无需解锁')) throw Error('地图选择未显示广佛');
  }
`, context);
for (const [w, h] of [[1200,800], [390,844], [800,500]]) {
  vm.runInContext(`
    W = ${w}; H = ${h};
    for (let run = 0; run < 12; run++) {
      reset('guangfo');
      if (G.stations.length !== 3) throw Error('广佛开局站点不足: ' + W + '×' + H);
      for (const st of G.stations) {
        const district = guangfoDistrictAt(st.gfLon, st.gfLat);
        if (!district || district.name !== st.district) throw Error('站点不在所属区内');
        if (tooCloseToRiver(st.nx * W, st.ny * H, 12)) throw Error('站点过近主要水系');
      }
    }
  `, context);
}
vm.runInContext(`
  { W=1200; H=800; reset('guangfo');
    const st = G.stations[0], lon = st.gfLon, lat = st.gfLat;
    G.lines = [{stations:G.stations.slice(0,2), loop:false, trains:[]}];
    canvasEl = {style:{}}; window.innerWidth = 800; window.innerHeight = 600;
    resize(); reprojectGuangfoStations();
    const p = guangfoProject(lon, lat);
    if (Math.abs(st.nx*W-p.x) > .0001 || Math.abs(st.ny*H-p.y) > .0001 || !G.lines[0]._path) throw Error('resize 未同步投影和线路');
    reset('london'); if (!el('guangfoLegend').hidden) throw Error('切图未隐藏广佛目录');
  }
`, context);
// 在广佛底图上走真实 pointerdown/move/finish 建线，再推进并渲染。
vm.runInContext(`
  { W=1200; H=800; reset('guangfo'); G.running=true; G.modal=false; G.totalTunnels=100;
    AU.init = () => {}; AU.tick = () => {}; AU.chime = () => {}; AU.deny = () => {};
    const handlers = {}, pc = {style:{}, addEventListener:(name, cb) => { handlers[name]=cb; }, getBoundingClientRect:() => ({left:0, top:0})};
    initPointer(pc);
    const a=G.stations[0], b=G.stations[1];
    handlers.pointerdown({clientX:a.nx*W, clientY:a.ny*H});
    handlers.pointermove({clientX:b.nx*W, clientY:b.ny*H});
    finishEdit();
    if (G.lines.length !== 1 || G.lines[0].trains.length !== 1) throw Error('广佛拖拽建线失败');
    update(.1); calls.length=0; render();
  }
`, context);
// 无限模式仅覆盖广佛：投影/反投影、相机边界、缩放锚点与线路进度。
vm.runInContext(`
  { W=1200; H=800; reset('endless');
    if (!G.camera || el('earthTools').hidden || G.stations.length !== 3) throw Error('广佛无限模式初始化失败');
    for (const st of G.stations) if (!guangfoDistrictAt(st.gfLon, st.gfLat)) throw Error('无限模式初始站不在广佛');
    for (const lon of [-180, -45, 0, 113, 180]) for (const lat of [-90, -23, 0, 23, 90]) {
      const p=earthProject(lon,lat), q=earthUnproject(p.x,p.y);
      if (Math.abs(q.lon-lon)>1e-8 || Math.abs(q.lat-lat)>1e-8) throw Error('投影往返失败');
    }
    const line = {stations:G.stations.slice(0,2), loop:false, trains:[{idx:0,d:0,dir:1,dwell:0,carriages:0,passengers:[]}],carriages:0,served:new Set(),color:'#e33'};
    line._path=buildPath(line); line.trains[0].d = line._path.total * .4; G.lines=[line];
    const fixed = earthUnproject(850, 300), points=G.stations.map(st=>[st.gfLon,st.gfLat]);
    earthZoomAt(G.camera.zoom+2,850,300);
    const fixed2=earthUnproject(850,300);
    if (Math.abs(fixed.lon-fixed2.lon)>1e-8 || Math.abs(fixed.lat-fixed2.lat)>1e-8) throw Error('缩放锚点漂移');
    if (Math.abs(line.trains[0].d/line._path.total-.4)>1e-8) throw Error('缩放改变列车进度');
    const size1=earthSize(), speed1=earthScaleFactor(); earthZoomAt(G.camera.zoom-1,600,400);
    if (Math.abs(earthSize()/size1 - .5)>1e-8 || Math.abs(earthScaleFactor()/speed1-.5)>1e-8) throw Error('列车速度未随投影比例同步');
    earthSetCamera(-999, -999, 0);
    const nw=earthGeographic(REGION_BOUNDS[0],REGION_BOUNDS[3]), se=earthGeographic(REGION_BOUNDS[2],REGION_BOUNDS[1]);
    if (G.camera.cx<nw.x || G.camera.cx>se.x || G.camera.cy<nw.y || G.camera.cy>se.y || G.camera.zoom < earthMinimumZoom()) throw Error('相机超出广佛范围');
    if (JSON.stringify(points)!==JSON.stringify(G.stations.map(st=>[st.gfLon,st.gfLat]))) throw Error('相机更改了地理坐标');
    earthFocusDistrict('连州市','清远');
    if (!spawnStation('circle') || !guangfoDistrictAt(G.stations.at(-1).gfLon,G.stations.at(-1).gfLat)) throw Error('广佛视图建站不在广佛');
    earthFitGuangfo();
    const snapshot = JSON.stringify(G); calls.length=0; render();
    if (JSON.stringify(G)!==snapshot) throw Error('广佛渲染改变状态');
    reset('london'); if (!el('earthTools').hidden) throw Error('城市图不应显示广佛地图控件');
  }
`, context);
// 海珠开局相对全图线性放大 50 倍；初始站落在当前视口，并能不重置进度地跳转区县。
for (const [w, h] of [[1200,800], [390,844], [320,568]]) {
  vm.runInContext(`
    { W=${w}; H=${h};
      for (let n=0; n<12; n++) {
        reset('endless');
        const a=earthGeographic(112.38,23.94), b=earthGeographic(114.06,22.55);
        const oldZoom=Math.log2(Math.min(Math.max(100,W-40)/(b.x-a.x),Math.max(100,H-150)/(b.y-a.y))/256);
        if (Math.abs(Math.pow(2,G.camera.zoom-oldZoom)-50)>1e-7) throw Error('开局近景比例改变');
        if (G.stations.length!==3 || G.stations.some(st => st.nx<.1 || st.nx>.83 || st.ny*H<60 || st.ny*H>H-60)) throw Error('近景初始车站不在视口');
        for (const st of G.stations) if (!guangfoDistrictAt(st.gfLon,st.gfLat) || tooCloseToRiver(st.nx*W,st.ny*H,12)) throw Error('近景车站不在陆地安全位置');
      }
      const original = G.stations.map(s=>[s.gfLon,s.gfLat]);
      earthFitGuangfo();
      if (Math.abs(G.camera.zoom-earthOverviewCamera().zoom)>1e-8) throw Error('无法回到全域');
      earthFocusDistrict('顺德区');
      const d = GUANGFO_DISTRICTS.find(x=>x.name==='顺德区'), center=earthUnproject(W/2,H/2);
      if (Math.abs(center.lon-d.label[0])>1e-8 || Math.abs(center.lat-d.label[1])>1e-8) throw Error('行政区定位失败');
      if (JSON.stringify(G.stations.map(s=>[s.gfLon,s.gfLat]))!==JSON.stringify(original)) throw Error('定位更改了站点地理坐标');
      earthFocusStart();
      const near = earthUnproject(W/2,H/2);
      if (Math.abs(near.lon-113.31)>1e-8 || Math.abs(near.lat-23.055)>1e-8 || Math.abs(G.camera.zoom-earthInitialCamera().zoom)>1e-7) throw Error('近景按钮错误');
    }
  `, context);
}
// 不再在项目内简化/舍入：回归源副本的原始顶点数和精度。
vm.runInContext(`
  { const vertices = GUANGFO_DISTRICTS.reduce((n, d) => n + d.polygons.reduce((p, poly) => p + poly.reduce((r, ring) => r + ring.length, 0), 0), 0);
    if (vertices !== 2651 || GUANGFO_DISTRICTS[0].polygons[0][0][0][0] !== 113.2503784998679) throw Error('区界源坐标遭到简化或舍入');
    if (GUANGFO_RIVERS.length < 3 || !GUANGFO_RIVERS.some(r => r.name === 'Xi') || !GUANGFO_RIVERS.some(r => r.name === 'Bei') || !GUANGFO_RIVERS.some(r => r.name === 'Dong')) throw Error('珠江主要水系数据不完整');
  }
`, context);
// 地理河道的相交、共享端点去重、避水、缩放不变性及库存校验。
vm.runInContext(`
  { W=1200; H=800; reset('endless'); G.running=true; G.modal=false;
    const original=REGION_RIVERS.slice();
    REGION_RIVERS.splice(0, REGION_RIVERS.length,
      {coords:[[113,23],[113,23.15],[113,23.3]]},
      {coords:[[113.1,23],[113.1,23.3]]});
    const station=(lon,lat) => { const p=earthProject(lon,lat); return {gfLon:lon,gfLat:lat,nx:p.x/W,ny:p.y/H,passengers:[]}; };
    const a=station(112.9,23.15), b=station(113.2,23.15), c=station(113.2,23.25);
    if (segCrossCount(a,b)!==2 || segCrossCount(b,a)!==2) throw Error('多河交点或共用端点计数错误');
    const tunnelSpans=metroTunnelSpans(a,b);
    if (tunnelSpans.length!==2 || tunnelSpans.some(span=>!(span.start<=span.t && span.t<=span.end)) || tunnelSpans[0].end>tunnelSpans[1].start) throw Error('多河隧道剖面位置错误');
    if (metroTunnelSpans(a,a).length!==0) throw Error('零长线路不能生成隧道');
    let mid=earthProject(113,23.15);
    if (!tooCloseToRiver(mid.x,mid.y,0)) throw Error('未避开水面');
    G.stations=[a,b,c];
    const before=guangfoWaterCrossings(a,b).join(',');
    earthZoomAt(G.camera.zoom+2,W/2,H/2); earthSetCamera(G.camera.cx+.0003,G.camera.cy-.0002,G.camera.zoom);
    if (guangfoWaterCrossings(a,b).join(',')!==before) throw Error('相机改变跨河判定');
    mid=earthProject(113,23.15); if (!tooCloseToRiver(mid.x,mid.y,0)) throw Error('缩放后河流避让错误');
    calls.length=0; domeIf(a,b);
    if (calls.filter(c=>c[0]==='arc').length!==2) throw Error('多河隧道口没有画在交点');
    calls.length=0; drawRiver(); if (calls.filter(c=>c[0]==='stroke').length < 5) throw Error('河流立体分层未绘制');
    AU.init=()=>{}; AU.tick=()=>{}; AU.deny=()=>{}; AU.chime=()=>{}; toast=()=>{};
    const handlers={}, pc={style:{},addEventListener:(n,cb)=>{handlers[n]=cb},getBoundingClientRect:()=>({left:0,top:0})}; initPointer(pc);
    G.totalTunnels=1; G.lines=[];
    handlers.pointerdown({clientX:a.nx*W,clientY:a.ny*H});
    handlers.pointermove({clientX:b.nx*W,clientY:b.ny*H});
    if (editing.path.length!==1 || editing.deny<=0) throw Error('隧道不足时允许跨越两条河');
    G.totalTunnels=2; editing.deny=0;
    handlers.pointermove({clientX:b.nx*W,clientY:b.ny*H});
    if (editing.path.length!==2 || tunnelsLeft()!==0) throw Error('跨河库存未扣除');
    handlers.pointermove({clientX:a.nx*W,clientY:a.ny*H});
    if (editing.path.length!==1 || tunnelsLeft()!==2) throw Error('回退未归还隧道');
    // 人工构造一个已使用所有隧道的路径，闭环段再次跨河应被拒绝。
    editing.path=[a,b,c]; editing.loopClosed=false; G.totalTunnels=2; editing.deny=0;
    handlers.pointermove({clientX:a.nx*W,clientY:a.ny*H});
    if (editing.loopClosed || editing.deny<=0) throw Error('闭环未检查隧道库存');
    clearEditing(); REGION_RIVERS.splice(0,REGION_RIVERS.length,...original);
    reset('london'); if (isGuangfoWater() || RIVERS.length!==1) throw Error('经典城市河流被覆盖');
    reset('newyork');
    const west={nx:.05,ny:.5}, east={nx:.9,ny:.5};
    const classical=metroTunnelSpans(west,east), reversed=metroTunnelSpans(east,west);
    if (segCrossCount(west,east)!==2 || classical.length!==2 || reversed.length!==2 ||
        classical.some(span=>!(span.start<span.t && span.t<span.end)) ||
        Math.abs(classical[0].t-(1-reversed[1].t))>1e-8) throw Error('经典双河隧道位置或跨河数量错误');
    calls.length=0; const stateBefore=JSON.stringify(G);
    drawMetroFallback({stations:[west,east],loop:false,color:'#dc493a'});
    if (calls.filter(c=>c[0]==='quadraticCurveTo').length!==4 || JSON.stringify(G)!==stateBefore) throw Error('Canvas 隧道降级未显示两个跨河段或修改了状态');
  }
`, context);
// 三维河岸分层和流动波纹为纯显示，动画不修改游戏状态或碰撞几何。
vm.runInContext(`
  { W=1200; H=800; reset('endless'); G.t=1;
    const before = JSON.stringify(G); calls.length=0; drawRiver();
    if (JSON.stringify(G)!==before) throw Error('河流渲染改变游戏状态');
    const waves1=JSON.stringify(calls.filter(c=>c[0]==='quadraticCurveTo'));
    if (waves1==='[]' || calls.filter(c=>c[0]==='stroke').length < 6) throw Error('广佛河流缺少波纹或侧壁');
    G.t=2; calls.length=0; drawRiver();
    if (JSON.stringify(calls.filter(c=>c[0]==='quadraticCurveTo'))===waves1) throw Error('河水波纹未流动');
    const clipped=waterVisibleRange({x:-100,y:100},{x:1300,y:100},0);
    if (!clipped || Math.abs(clipped[0]-100/1400)>1e-8 || Math.abs(clipped[1]-1300/1400)>1e-8) throw Error('波纹裁剪错误');
    if (waterVisibleRange({x:-100,y:-50},{x:-20,y:-50},0)) throw Error('屏幕外河段未剔除');
    reset('london'); G.t=1; calls.length=0; drawRiver();
    if (calls.filter(c=>c[0]==='fill').length < 3 || !calls.some(c=>c[0]==='quadraticCurveTo')) throw Error('经典城市缺少立体河岸或流动波纹');
  }
`, context);
// 样条经过原始节点，且跨河与避水共用相同的曲线，不随相机改变。
vm.runInContext(`
  { W=1200; H=800; reset('endless');
    const r={coords:[[113.2,23.0],[113.25,23.02],[113.3,23.0],[113.35,23.04]]};
    const curve=guangfoRiverCurve(r);
    if (curve.length!==25 || curve[0][0]!==r.coords[0][0] || curve[8][0]!==r.coords[1][0] || curve.at(-1)[1]!==r.coords.at(-1)[1] || curve!==guangfoRiverCurve(r)) throw Error('样条节点或缓存不正确');
    const source=REGION_RIVERS.slice(); REGION_RIVERS.splice(0,REGION_RIVERS.length,r);
    const point=curve[12], p=earthProject(point[0],point[1]);
    if (!guangfoWaterNear(p.x,p.y,0)) throw Error('避水与样条不一致');
    const st=(lon,lat) => { const q=earthProject(lon,lat); return {gfLon:lon,gfLat:lat,nx:q.x/W,ny:q.y/H}; };
    const a=st(point[0],point[1]-.03), b=st(point[0],point[1]+.03);
    const hits=guangfoWaterCrossings(a,b);
    if (hits.length!==1 || Math.abs(hits[0]-.5)>.00001) throw Error('跨河与曲线不一致');
    earthZoomAt(G.camera.zoom+2,600,400);
    if (guangfoWaterCrossings(a,b).length!==1) throw Error('样条跨河数随缩放变化');
    REGION_RIVERS.splice(0,REGION_RIVERS.length,...source);
  }
`, context);
// WebGL 岸壁网格具有高度和法线，裁剪极长河段后坐标与 UV 保持有界。
vm.runInContext(`
  { W=600; H=400;
    const mesh=buildWater3dMesh([{width:20,points:[{x:-100000,y:200},{x:100000,y:200}]}]);
    if (mesh.bankCount<12 || mesh.waterCount!==mesh.bankCount*2 || mesh.foamCount!==mesh.bankCount || mesh.vertices.length!==(mesh.bankCount+mesh.waterCount+mesh.foamCount)*9) throw Error('河流网格或泡沫三角形数量不对');
    const far=buildWater3dMesh([{width:20,points:[{x:-100000,y:200},{x:100000,y:200}]}],false);
    if (far.foamCount!==0 || far.vertices.length >= mesh.vertices.length) throw Error('远景 LOD 未降低网格细节');
    const vs=mesh.vertices;
    if (!vs.some((v,i)=>i%9===2 && v>0)) throw Error('岸壁没有三维高度');
    if (!vs.some((v,i)=>i%9===4 && Math.abs(v)>.1)) throw Error('岸壁缺少侧面法线');
    for (let i=0;i<vs.length;i+=9) if (Math.abs(vs[i])>2000 || Math.abs(vs[i+6])>2000 || !Number.isFinite(vs[i])) throw Error('河流网格裁剪/UV 异常');
    const empty=buildWater3dMesh([{width:10,points:[{x:20,y:20},{x:20,y:20}]}]);
    if (empty.waterCount || empty.bankCount) throw Error('退化河段不应产生三角形');
  }
`, context);
// 模拟 WebGL：帧间只更新时间，拖动/缩放才上传新网格，丢失上下文后安全降级。
vm.runInContext(`
  { W=1200; H=800; reset('endless');
    const oldGet=document.getElementById, oldRenderer=water3dRenderer, oldUnavailable=water3dUnavailable;
    let uploads=0, uniforms=0, draws=0, now=0; const events={}, waves=[];
    const oldNow=performance.now; performance.now=()=>now;
    const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,
      COLOR_BUFFER_BIT:7,DEPTH_TEST:8,BLEND:9,FLOAT:10,TRIANGLES:11,SRC_ALPHA:12,ONE_MINUS_SRC_ALPHA:13,
      createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,deleteShader(){},
      createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,deleteProgram(){},createBuffer:()=>({}),
      getAttribLocation:()=>1,getUniformLocation:(_,name)=>name,isContextLost:()=>false,bindBuffer(){},bufferData(){uploads++},
      viewport(){},clearColor(){},clear(){},disable(){},enable(){},blendFunc(){},useProgram(){},enableVertexAttribArray(){},vertexAttribPointer(){},
      uniform2f(){},uniform1f(location,value){uniforms++; if(location==='u_wave') waves.push(value)},drawArrays(){draws++}};
    const waterCanvas={style:{},hidden:true,getContext:()=>gl,addEventListener:(name,fn)=>{events[name]=fn}};
    document.getElementById=id=>id==='waterSurface'?waterCanvas:oldGet(id);
    water3dRenderer=null; water3dUnavailable=false;
    if (!drawWaterWebGL() || waterCanvas.hidden || uploads!==1 || draws!==3) throw Error('WebGL 水面初始化失败');
    G.t=1; now+=10; if (!drawWaterWebGL() || draws!==3) throw Error('水面帧率限制失效');
    G.t=10; now+=40; if (!drawWaterWebGL() || uploads!==1 || uniforms!==4) throw Error('动画帧不应重复上传河流网格');
    earthZoomAt(G.camera.zoom+1,W/2,H/2); drawWaterWebGL(); if (uploads!==2 || waves.at(-1)!==1) throw Error('近景未更新网格或启用波浪');
    earthFitGuangfo(); drawWaterWebGL(); if (uploads!==3 || waves.at(-1)!==0 || water3dRenderer.foamCount!==0) throw Error('全图 LOD 未关闭波浪或泡沫');
    if (water3dPaths(false).reduce((s,p)=>s+p.points.length,0) >= water3dPaths(true).reduce((s,p)=>s+p.points.length,0)) throw Error('远景中心线未降采样');
    events.webglcontextlost({preventDefault(){}});
    if (!waterCanvas.hidden || drawWaterWebGL()) throw Error('上下文丢失未降级');
    events.webglcontextrestored();
    if (!drawWaterWebGL() || waterCanvas.hidden || uploads!==4) throw Error('上下文恢复未重建');
    document.getElementById=oldGet; performance.now=oldNow; water3dRenderer=oldRenderer; water3dUnavailable=oldUnavailable;
  }
`, context);
console.log(`PASS: ${scripts.length} 脚本、${names.size} 个唯一全局声明；8 地图 × 环线/往返线；多车厢、折返、广佛 16 区、建站/建线、50 倍近景、行政区定位、缩放、WebGL 水体/降级与隧道库存`);
