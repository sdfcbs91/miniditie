/* 广佛离线行政区投影与点面查询；不依赖网络或外部地图 SDK。 */
'use strict';

// 等距圆柱投影按纬度修正经度比例，再等比缩放到 HUD 之间的可用画布。
function guangfoView() {
  const west = 112.38, east = 114.06, south = 22.55, north = 23.94;
  const aspectX = .92, spanX = (east - west) * aspectX, spanY = north - south;
  const top = Math.min(74, H * .13), bottom = Math.min(76, H * .13);
  const scale = Math.min(Math.max(1, W - 28) / spanX, Math.max(1, H - top - bottom) / spanY);
  return { west, north, aspectX, scale, x: (W - spanX * scale) / 2,
    y: top + (H - top - bottom - spanY * scale) / 2 };
}

function guangfoProject(lon, lat) {
  const v = guangfoView();
  return { x: v.x + (lon - v.west) * v.aspectX * v.scale,
           y: v.y + (v.north - lat) * v.scale };
}

// 奇偶规则同时支持多边形、离岛与内环；返回真实命中的区而不是矩形包围盒。
function guangfoDistrictAt(lon, lat) {
  for (const district of (G && G.mapId === 'endless' ? REGION_DISTRICTS : GUANGFO_DISTRICTS)) {
    const b = district.bounds;
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    for (const polygon of district.polygons) {
      let inside = false;
      for (const ring of polygon) {
        let inRing = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i], b = ring[j];
          if ((a[1] > lat) !== (b[1] > lat) &&
              lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inRing = !inRing;
        }
        if (inRing) inside = !inside;
      }
      if (inside) return district;
    }
  }
  return null;
}

// resize 时同步地图锚点和线路缓存，仍沿用现有归一化坐标与指针命中逻辑。
function reprojectGuangfoStations() {
  if (!G || G.mapId !== 'guangfo') return;
  for (const station of G.stations) {
    if (station.gfLon == null) continue;
    const p = guangfoProject(station.gfLon, station.gfLat);
    station.nx = p.x / W; station.ny = p.y / H;
  }
  for (const line of G.lines) if (line.stations.length >= 2) line._path = buildPath(line);
}
