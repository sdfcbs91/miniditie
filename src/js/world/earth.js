/* 无限模式的八市等距圆柱投影相机：经纬度与屏幕坐标可互相转换。 */
'use strict';

// 等距圆柱投影的标准纬线约为北纬 23°，让广佛附近东西与南北比例接近一致。
function earthGeographic(lon, lat) {
  const limited = Math.max(-90, Math.min(90, lat));
  return { x: (lon + 180) / 360 * .92, y: (90 - limited) / 360 };
}

// 全域视角和海珠开局近景分开；改变视角不改变地理坐标。
function earthOverviewCamera() {
  const [west,south,east,north]=REGION_BOUNDS;
  const center = earthGeographic((west+east)/2, (south+north)/2);
  const a = earthGeographic(west, north), b = earthGeographic(east, south);
  const width = Math.max(100, W - 40), height = Math.max(100, H - 150);
  const zoom = Math.max(0, Math.min(19, Math.log2(Math.min(width / (b.x - a.x), height / (b.y - a.y)) / 256)));
  return {cx:center.x, cy:center.y, zoom};
}
function earthInitialCamera() {
  const center = earthGeographic(113.31, 23.055);
  // 保留扩域前广佛全图的 50 倍开局比例，避免八市全图变大后近景意外缩小。
  const a=earthGeographic(112.38,23.94), b=earthGeographic(114.06,22.55);
  const width=Math.max(100,W-40), height=Math.max(100,H-150);
  const oldZoom=Math.max(0,Math.min(19,Math.log2(Math.min(width/(b.x-a.x),height/(b.y-a.y))/256)));
  const zoom = Math.min(19, oldZoom + Math.log2(50));
  // 速度、避让与站距以开局近景为基准，不会因 50 倍相机而把车站挤出屏幕。
  return {cx:center.x, cy:center.y, zoom, baseZoom:zoom};
}

function earthMinimumZoom() { return Math.max(0, earthOverviewCamera().zoom - .35); }

function earthSize() { return 256 * Math.pow(2, G.camera.zoom); }
function earthProject(lon, lat) {
  const p = earthGeographic(lon, lat), size = earthSize();
  return { x: W / 2 + (p.x - G.camera.cx) * size, y: H / 2 + (p.y - G.camera.cy) * size };
}
function earthUnproject(x, y) {
  const size = earthSize(), mx = G.camera.cx + (x - W / 2) / size, my = G.camera.cy + (y - H / 2) / size;
  return { lon: mx / .92 * 360 - 180, lat: 90 - my * 360 };
}
function earthScaleFactor() { return Math.pow(2, G.camera.zoom - G.camera.baseZoom); }

// 相机变化后只改屏幕坐标；按路径长度比例同步列车弧长，平移/缩放不会重置行驶进度。
function reprojectEarthStations() {
  if (!G || G.mapId !== 'endless' || !G.camera) return;
  const totals = G.lines.map(line => line._path ? line._path.total : 0);
  for (const st of G.stations) {
    if (st.gfLon == null) continue;
    const p = earthProject(st.gfLon, st.gfLat); st.nx = p.x / W; st.ny = p.y / H;
  }
  G.lines.forEach((line, i) => {
    if (line.stations.length < 2) return;
    line._path = buildPath(line);
    if (totals[i] > 1e-9) for (const tr of line.trains) tr.d *= line._path.total / totals[i];
  });
}

function earthSetCamera(cx, cy, zoom) {
  if (!G || G.mapId !== 'endless' || !G.camera) return;
  // 相机中心限制在八市外接框，其他地区不显示行政区底图。
  const [west,south,east,north]=REGION_BOUNDS;
  const nw = earthGeographic(west, north), se = earthGeographic(east, south);
  G.camera.cx = Math.max(nw.x, Math.min(se.x, cx));
  G.camera.cy = Math.max(nw.y, Math.min(se.y, cy));
  G.camera.zoom = Math.max(earthMinimumZoom(), Math.min(19, zoom));
  reprojectEarthStations();
}

// 缩放固定屏幕锚点的地理位置，滚轮、按钮和双指共用。
function earthZoomAt(zoom, x, y) {
  if (!G || G.mapId !== 'endless' || !G.camera) return;
  const oldSize = earthSize();
  const anchorX = G.camera.cx + (x - W / 2) / oldSize;
  const anchorY = G.camera.cy + (y - H / 2) / oldSize;
  const z = Math.max(earthMinimumZoom(), Math.min(19, zoom)), size = 256 * Math.pow(2, z);
  earthSetCamera(anchorX - (x - W / 2) / size, anchorY - (y - H / 2) / size, z);
}

function earthFitGuangfo() {
  if (!G || G.mapId !== 'endless') return;
  const fit = earthOverviewCamera(); earthSetCamera(fit.cx, fit.cy, fit.zoom);
}

// 重返初始海珠近景（不重置线路、列车或游戏进度）。
function earthFocusStart() {
  if (!G || G.mapId !== 'endless') return;
  const initial = earthInitialCamera(); earthSetCamera(initial.cx, initial.cy, initial.zoom);
}

// 目录跳转到任一区县，保持完整边界数据；标签点用于居中，不改变几何。
function earthFocusDistrict(name, city) {
  if (!G || G.mapId !== 'endless') return;
  const district = REGION_DISTRICTS.find(d => d.name === name && (!city || d.city === city));
  if (!district) return;
  const center = earthGeographic(district.label[0], district.label[1]);
  const zoom = Math.min(19, earthOverviewCamera().zoom + Math.log2(50));
  earthSetCamera(center.x, center.y, zoom);
}
