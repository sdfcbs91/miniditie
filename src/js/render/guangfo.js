/* 广佛战略地图图层：离线矢量区界、柔和地貌色、地名与图例。 */
'use strict';

let guangfoBackdrop = null;
let guangfoBackdropKey = '';
function drawGuangfoMap() {
  if (G.mapId !== 'guangfo') return;
  const key = [W, H, DPR].join(',');
  if (!guangfoBackdrop || guangfoBackdropKey !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(W * DPR)); canvas.height = Math.max(1, Math.round(H * DPR));
    const paint = canvas.getContext('2d'); paint.setTransform(DPR, 0, 0, DPR, 0, 0);
    paintGuangfoBackdrop(paint);
    guangfoBackdrop = canvas; guangfoBackdropKey = key;
  }
  ctx.drawImage(guangfoBackdrop, 0, 0, W, H);
}
function paintGuangfoBackdrop(paint) {
  const v = guangfoView();
  const px = lon => v.x + (lon - v.west) * v.aspectX * v.scale;
  const py = lat => v.y + (v.north - lat) * v.scale;
  const colors = ['#c4cbb3', '#cfd3ba', '#bfc9ad', '#d8d5bc', '#c8ceb2', '#c8d1bc', '#d5d6be', '#c6d0bd'];
  paint.save();
  paint.fillStyle = '#e5e8dc'; paint.fillRect(0, 0, W, H);
  // 低对比经纬网赋予纸质战略底图层次，不参与地理或碰撞计算。
  paint.lineWidth = .6; paint.strokeStyle = 'rgba(101,119,103,.12)';
  for (let lon = 112.5; lon <= 114; lon += .25) {
    paint.beginPath(); paint.moveTo(px(lon), 0); paint.lineTo(px(lon), H); paint.stroke();
  }
  for (let lat = 22.75; lat <= 23.75; lat += .25) {
    paint.beginPath(); paint.moveTo(0, py(lat)); paint.lineTo(W, py(lat)); paint.stroke();
  }
  GUANGFO_DISTRICTS.forEach((district, index) => {
    paint.beginPath();
    for (const polygon of district.polygons) for (const ring of polygon) {
      ring.forEach((p, i) => i ? paint.lineTo(px(p[0]), py(p[1])) : paint.moveTo(px(p[0]), py(p[1])));
      paint.closePath();
    }
    paint.fillStyle = colors[index % colors.length]; paint.fill('evenodd');
    // 先绘浅色边缘再绘细深边界，形成分区浮雕效果。
    paint.lineJoin = 'round'; paint.lineWidth = 2.3; paint.strokeStyle = 'rgba(246,247,227,.68)'; paint.stroke();
    paint.lineWidth = .75; paint.strokeStyle = 'rgba(79,98,82,.62)'; paint.stroke();
  });
  paint.restore();
}

function drawGuangfoLabels() {
  if (G.mapId !== 'guangfo') return;
  ctx.save();
  const used = [];
  const small = W < 600 || H < 500;
  const size = small ? 9 : 11;
  ctx.font = 'bold ' + size + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // 密集城区依次尝试偏移，并以细引线标出；避免名字互相覆盖。
  for (const district of GUANGFO_DISTRICTS) {
    const p = guangfoProject(district.label[0], district.label[1]);
    const half = district.name.length * size * .52 + 3;
    const offsets = [[0,0],[0,-16],[0,16],[-30,0],[30,0],[-30,-18],[30,-18],[-30,18],[30,18],[0,-32],[0,32],[-56,0],[56,0],[-56,-22],[56,-22]];
    let chosen = null;
    for (const [dx, dy] of offsets) {
      const x = Math.max(half + 3, Math.min(W - half - 3, p.x + dx));
      const y = Math.max(68, Math.min(H - 65, p.y + dy));
      const box = {x1:x-half, x2:x+half, y1:y-size*.65, y2:y+size*.65};
      if (!used.some(b => box.x1 < b.x2 + 2 && box.x2 + 2 > b.x1 && box.y1 < b.y2 + 2 && box.y2 + 2 > b.y1)) {
        chosen = {x, y, box}; break;
      }
    }
    if (!chosen) continue;
    used.push(chosen.box);
    if (Math.hypot(chosen.x - p.x, chosen.y - p.y) > 10) {
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(chosen.x, chosen.y);
      ctx.lineWidth = .7; ctx.strokeStyle = 'rgba(64,80,67,.45)'; ctx.stroke();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(231,235,218,.9)'; ctx.strokeText(district.name, chosen.x, chosen.y);
    ctx.fillStyle = '#536959'; ctx.fillText(district.name, chosen.x, chosen.y);
  }
  // 图例明确区界和河流的性质，避免把游戏化河道当作实测地理数据。
  if (W >= 700 && H >= 500) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#526a5b'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('广佛都市圈', 24, H - 108);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#708475';
    ctx.fillText('16 个行政区 · 主要水系', 24, H - 91);
  }
  // 常显数据署名，不依赖展开目录或联网。
  ctx.textAlign = 'right'; ctx.font = '9px sans-serif'; ctx.fillStyle = '#617967';
  ctx.fillText('© OpenStreetMap contributors / geoBoundaries · ODbL', W - 12, 72);
  ctx.restore();
}
