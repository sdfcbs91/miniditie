/* 无限模式广东八市底图：离线行政区边界，纯 Canvas 绘制。 */
'use strict';

// 仅缓存地理投影，不缓存画布、窗口尺寸或游戏状态；相机移动时无需重复计算地理坐标投影。
let earthProjectedDistricts = null;
let earthBackdrop = null;
let earthBackdropKey = '';
function projectEarthPolygons(features) {
  return features.map(feature => feature.polygons.map(poly => poly.map(ring =>
    ring.map(coord => earthGeographic(coord[0], coord[1])))));
}

function drawEarthMap() {
  if (G.mapId !== 'endless' || !G.camera) return;
  const key = [W, H, DPR, G.camera.cx, G.camera.cy, G.camera.zoom].join(',');
  if (!earthBackdrop || earthBackdropKey !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(W * DPR)); canvas.height = Math.max(1, Math.round(H * DPR));
    const paint = canvas.getContext('2d');
    paint.setTransform(DPR, 0, 0, DPR, 0, 0);
    paintEarthBackdrop(paint);
    earthBackdrop = canvas; earthBackdropKey = key;
  }
  ctx.drawImage(earthBackdrop, 0, 0, W, H);
}

function paintEarthBackdrop(paint) {
  paint.save();
  paint.fillStyle = '#e8e9dc'; paint.fillRect(0, 0, W, H);
  const size = earthSize();
  const screen = p => ({x:W / 2 + (p.x - G.camera.cx) * size, y:H / 2 + (p.y - G.camera.cy) * size});
  const colors = ['#c6d1b8', '#ced7be', '#d8d9c1', '#bdceb7', '#d9d7be', '#c7d4be'];
  if (!earthProjectedDistricts) earthProjectedDistricts = projectEarthPolygons(REGION_DISTRICTS);
  const shade = paint.createLinearGradient(0, 0, W, H);
  shade.addColorStop(0, 'rgba(255,253,226,.14)'); shade.addColorStop(1, 'rgba(67,100,75,.09)');
  REGION_DISTRICTS.forEach((district, index) => {
    const b = district.bounds, nw = earthProject(b[0], b[3]), se = earthProject(b[2], b[1]);
    if (se.x < -4 || nw.x > W + 4 || se.y < -4 || nw.y > H + 4) return;
    paint.beginPath();
    for (const polygon of earthProjectedDistricts[index]) for (const ring of polygon) {
      ring.forEach((coord, i) => { const p = screen(coord);
        if (i) paint.lineTo(p.x, p.y); else paint.moveTo(p.x, p.y); });
      paint.closePath();
    }
    paint.fillStyle = colors[index % colors.length]; paint.fill('evenodd');
    paint.fillStyle = shade; paint.fill('evenodd');
    paint.lineJoin = 'round'; paint.lineWidth = 4; paint.strokeStyle = 'rgba(247,247,225,.74)'; paint.stroke();
    paint.lineWidth = 1.25; paint.strokeStyle = 'rgba(68,94,75,.70)'; paint.stroke();
  });
  // 微小纸纹只作视觉装饰，不暗示道路或实际地形；固定在地理投影上。
  const anchor = earthProject(113, 23), gap = 18;
  const ox = ((anchor.x % gap) + gap) % gap, oy = ((anchor.y % gap) + gap) % gap;
  paint.fillStyle = 'rgba(50,78,55,.045)';
  for (let y = oy - gap, row = 0; y < H; y += gap, row++) {
    for (let x = ox - gap + (row % 2) * 7; x < W; x += gap) paint.fillRect(x, y, 1, 1);
  }
  // 按投影比例自动选择经纬网密度，近景与全图都保持可辨识。
  const pixelsPerDegree = size / 360;
  const target = 100 / pixelsPerDegree, power = Math.pow(10, Math.floor(Math.log10(target)));
  const step = [1, 2, 5, 10].reduce((a, b) => Math.abs(b * power - target) < Math.abs(a * power - target) ? b : a) * power;
  const nw = earthUnproject(0, 0), se = earthUnproject(W, H);
  paint.lineWidth = .7; paint.strokeStyle = 'rgba(78,108,84,.10)';
  for (let lon = Math.ceil(nw.lon / step) * step; lon <= se.lon; lon += step) {
    const p = earthProject(lon, 23); paint.beginPath(); paint.moveTo(p.x, 0); paint.lineTo(p.x, H); paint.stroke();
  }
  for (let lat = Math.ceil(se.lat / step) * step; lat <= nw.lat; lat += step) {
    const p = earthProject(113, lat); paint.beginPath(); paint.moveTo(0, p.y); paint.lineTo(W, p.y); paint.stroke();
  }
  paint.restore();
}

function drawEarthLabels() {
  if (G.mapId !== 'endless' || !G.camera) return;
  ctx.save();
  {
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const boxes = [];
    for (const district of REGION_DISTRICTS) {
      const p = earthProject(district.label[0], district.label[1]);
      if (p.x < 0 || p.x > W || p.y < 65 || p.y > H - 60) continue;
      // 中心城区拥挤时隐藏重叠文字；可随时通过目录查看全部区名。
      if (boxes.some(b => Math.abs(b.x - p.x) < 38 && Math.abs(b.y - p.y) < 14)) continue;
      boxes.push(p);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(237,240,224,.9)'; ctx.strokeText(district.name, p.x, p.y);
      ctx.fillStyle = '#536959'; ctx.fillText(district.name, p.x, p.y);
    }
  }
  // 近景中行政区文字锚点可能在屏幕外，以当前位置提示保持方向感。
  const centerGeo = earthUnproject(W / 2, H / 2), currentDistrict = guangfoDistrictAt(centerGeo.lon, centerGeo.lat);
  const zoomRatio = Math.pow(2, G.camera.zoom - earthOverviewCamera().zoom);
  const place = currentDistrict ? currentDistrict.city + ' · ' + currentDistrict.name : '广东八市';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  rr(16, 92, Math.max(150, place.length * 12 + 20), 38, 8); ctx.fillStyle = 'rgba(245,247,231,.91)'; ctx.fill();
  ctx.strokeStyle = 'rgba(92,117,94,.38)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#405e4c'; ctx.fillText(place, 26, 105);
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#718672';
  ctx.fillText('地图比例  ' + (zoomRatio >= 10 ? zoomRatio.toFixed(0) : zoomRatio.toFixed(1)) + '×', 26, 120);
  // 水平比例尺按当前纬度修正；标注地面距离，不假称物理屏幕 1:1。
  const lat = earthUnproject(W / 2, H / 2).lat;
  const metersPerPixel = 40075016.68557849 * Math.cos(lat * Math.PI / 180) / (.92 * earthSize());
  const target = metersPerPixel * 90, power = Math.pow(10, Math.floor(Math.log10(target)));
  const units = [1, 2, 5, 10], nice = units.reduce((a, b) => Math.abs(b * power - target) < Math.abs(a * power - target) ? b : a) * power;
  const length = nice / metersPerPixel, x = Math.max(20, W - 130), y = H - 108;
  ctx.strokeStyle = '#405d51'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + length, y); ctx.lineTo(x + length, y - 4); ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#405d51';
  ctx.fillText(nice >= 1000 ? (nice / 1000) + ' km' : nice + ' m', x, y - 5);
  ctx.textAlign = 'right'; ctx.font = '9px sans-serif';
  ctx.fillText('© OpenStreetMap / geoBoundaries · ODbL', W - 10, H - 78);
  ctx.restore();
}
