/* 八市地图交互：空白处拖动、滚轮缩放、触屏双指缩放；站点拖线保持优先。 */
'use strict';
let earthPointers = new Map();
let earthGesture = null;

// 按模式重建目录；东莞和中山无县级区，按全市列出。
function updateRegionLegend() {
  const legend=el('guangfoLegend'), summary=legend.querySelector('summary'), body=legend.querySelector('.guangfo-legend-body');
  if (!summary || !body) return;
  const endless=G.mapId==='endless', districts=endless ? REGION_DISTRICTS : GUANGFO_DISTRICTS;
  summary.innerHTML=(endless ? '八市地区' : '广佛 16 区')+' <span>查看目录</span>';
  const cities=endless ? ['广州','佛山','中山','珠海','东莞','清远','深圳','惠州'] : ['广州','佛山'];
  body.innerHTML=cities.map(city=>{
    const list=districts.filter(d=>d.city===city);
    return '<strong>'+city+' · '+(city==='中山' || city==='东莞' ? '全市' : list.length+' 个地区')+'</strong><p class="district-list">'+
      list.map(d=>'<button type="button" data-city="'+d.city+'" data-district="'+d.name+'"'+(endless ? '' : ' disabled')+'>'+d.name+'</button>').join('')+'</p>';
  }).join('')+'<small>© OpenStreetMap contributors / geoBoundaries · ODbL<br>历史简化边界；点击地区定位<br>中山、东莞按全市显示</small>';
}

function initEarthControls(canvas) {
  const active = () => G && G.mapId === 'endless' && G.running && !G.modal && !G.over;
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; };
  const isMapTarget = p => {
    if (stationAt(p, 24) || findSegment(p)) return false;
    for (const line of G.lines) if (!line.loop && line.stations.length >= 2) {
      for (const which of ['start', 'end']) {
        const h = handlePos(line, which);
        if (Math.hypot(h.x - p.x, h.y - p.y) < 18) return false;
      }
    }
    return true;
  };
  canvas.addEventListener('wheel', e => {
    if (!active() || editing) return;
    e.preventDefault(); const p = pos(e);
    earthZoomAt(G.camera.zoom - Math.max(-1, Math.min(1, e.deltaY / 200)), p.x, p.y);
  }, {passive:false});
  canvas.addEventListener('pointerdown', e => {
    if (!active() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = pos(e); earthPointers.set(e.pointerId, p);
    if (earthPointers.size === 2) {
      const points = [...earthPointers.values()], a = points[0], b = points[1];
      const mid = {x:(a.x+b.x)/2, y:(a.y+b.y)/2}, size = earthSize();
      earthGesture = { type:'pinch', distance:Math.max(1, Math.hypot(a.x-b.x, a.y-b.y)), zoom:G.camera.zoom,
        anchorX:G.camera.cx+(mid.x-W/2)/size, anchorY:G.camera.cy+(mid.y-H/2)/size };
      clearEditing(); if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation(); e.preventDefault(); return;
    }
    if (!editing && isMapTarget(p)) {
      earthGesture = {type:'pan', id:e.pointerId, x:p.x, y:p.y};
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation(); e.preventDefault();
    }
  }, true);
  canvas.addEventListener('pointermove', e => {
    if (!active() || !earthPointers.has(e.pointerId)) return;
    const p = pos(e); earthPointers.set(e.pointerId, p);
    if (!earthGesture) return;
    if (earthGesture.type === 'pinch' && earthPointers.size >= 2) {
      const points = [...earthPointers.values()], a = points[0], b = points[1];
      const mid = {x:(a.x+b.x)/2, y:(a.y+b.y)/2};
      const dist = Math.max(1, Math.hypot(a.x-b.x,a.y-b.y));
      const z = Math.max(earthMinimumZoom(), Math.min(19, earthGesture.zoom + Math.log2(dist / earthGesture.distance)));
      const size = 256 * Math.pow(2,z);
      earthSetCamera(earthGesture.anchorX-(mid.x-W/2)/size, earthGesture.anchorY-(mid.y-H/2)/size, z);
      e.stopImmediatePropagation(); e.preventDefault();
    } else if (earthGesture.type === 'pan' && earthGesture.id === e.pointerId) {
      const dx = p.x-earthGesture.x, dy = p.y-earthGesture.y;
      earthGesture.x=p.x; earthGesture.y=p.y;
      earthSetCamera(G.camera.cx-dx/earthSize(), G.camera.cy-dy/earthSize(), G.camera.zoom);
      e.stopImmediatePropagation(); e.preventDefault();
    }
  }, true);
  const end = e => {
    earthPointers.delete(e.pointerId);
    // 双指结束后必须重新按下才开始平移，防止另一根手指松开时地图跳动。
    if (earthGesture && (earthGesture.type === 'pinch' || earthGesture.id === e.pointerId)) earthGesture = null;
  };
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  el('earthZoomIn').onclick = () => { if (active()) earthZoomAt(G.camera.zoom + 1, W/2, H/2); };
  el('earthZoomOut').onclick = () => { if (active()) earthZoomAt(G.camera.zoom - 1, W/2, H/2); };
  el('guangfoLegend').addEventListener('click', e => {
    const button=e.target.closest('button[data-district]');
    if (button && active()) { earthFocusDistrict(button.dataset.district,button.dataset.city); el('guangfoLegend').open=false; }
  });
  el('waterQuality').onclick = () => { if (active()) toggleWaterThreeQuality(); };
  el('earthClose').onclick = () => { if (active()) earthFocusStart(); };
  el('earthHome').onclick = () => { if (active()) earthFitGuangfo(); };
}
