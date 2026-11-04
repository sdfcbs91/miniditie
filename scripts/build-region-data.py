#!/usr/bin/env python3
"""Build the offline eight-city layer. See docs/guangfo-data.md for sources/licences.
Usage: python scripts/build-region-data.py guangdong.geojson rivers.geojson osm-dir
Requires Shapely. The original 16 Guangzhou/Foshan features remain untouched.
"""
import json
import sys
from pathlib import Path
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union

source, rivers_file, osm_dir = map(Path, sys.argv[1:4])
features = {f['properties']['shapeName']: shape(f['geometry']) for f in json.loads(source.read_text())['features']}
# Guangming and Dapeng were functional areas in the historical source. Yantian was omitted.
osm = {name: shape(json.loads((osm_dir / (ident + '.geojson')).read_text())['geometry']) for name, ident in [
    ('盐田区','005663273'), ('光明区','005664192'), ('大鹏新区','003536166')]}
cut = unary_union(list(osm.values()))
entries = [
 ('中山','中山市','Zhongshan City'), ('珠海','香洲区','Xiangzhou District'), ('珠海','斗门区','Doumen District'), ('珠海','金湾区','金湾区'),
 ('东莞','东莞市','Dongguan City'),
 ('清远','清城区','Qingcheng District'), ('清远','清新区','Qingxin District'), ('清远','英德市','Yingde City'), ('清远','连州市','Lianzhou City'),
 ('清远','佛冈县','Fogang County'), ('清远','阳山县','Yangshan County'), ('清远','连山壮族瑶族自治县','Lianshan Zhuang and Yao Autonomous County'), ('清远','连南瑶族自治县','Liannan Yao Autonomous County'),
 ('深圳','福田区','Futian District'), ('深圳','罗湖区','Luohu District'), ('深圳','南山区','Nanshan district'),
 ('深圳','宝安区',"Bao'an District"), ('深圳','龙岗区','Longgang District'), ('深圳','龙华区','Longhua District'), ('深圳','坪山区','Pingshan District'),
 ('惠州','惠城区','Huicheng District'), ('惠州','惠阳区','Huiyang District'), ('惠州','博罗县','Boluo County'), ('惠州','惠东县','Huidong County'), ('惠州','龙门县','Longmen County')]

def extract(g):
    if g.geom_type == 'Polygon': return [g]
    if g.geom_type == 'MultiPolygon': return list(g.geoms)
    if g.geom_type == 'GeometryCollection':
        return [p for part in g.geoms for p in extract(part)]
    return []

def feature(city, name, g):
    parts=extract(g)
    if not parts: raise ValueError('empty geometry: '+name)
    largest=max(parts,key=lambda p:p.area)
    label=largest.representative_point()
    coords=[mapping(p)['coordinates'] for p in parts]
    bounds=[min(p.bounds[0] for p in parts),min(p.bounds[1] for p in parts),max(p.bounds[2] for p in parts),max(p.bounds[3] for p in parts)]
    return {'name':name,'city':city,'label':[label.x,label.y],'polygons':coords,'bounds':bounds}

added=[]
for city,name,key in entries:
    g=features[key]
    # Harmonise overlapping old/new OSM vintages; no simplification/rounding of input coordinates.
    if city in ('深圳','东莞','惠州') and g.intersects(cut): g=g.difference(cut)
    added.append(feature(city,name,g))
for name in ('盐田区','光明区','大鹏新区'):
    added.append(feature('深圳',name,osm[name]))

existing=json.loads(Path('src/js/world/guangfo-data.js').read_text().split('const GUANGFO_DISTRICTS = ',1)[1].split(';',1)[0])
all_features=existing+added
bounds=[min(d['bounds'][0] for d in all_features)-.03,min(d['bounds'][1] for d in all_features)-.03,
        max(d['bounds'][2] for d in all_features)+.03,max(d['bounds'][3] for d in all_features)+.03]
clip=box(*bounds); waters=[]
for f in json.loads(rivers_file.read_text())['features']:
    g=shape(f['geometry'])
    if not g.intersects(clip): continue
    g=g.intersection(clip)
    for part in list(g.geoms) if g.geom_type in ('MultiLineString','GeometryCollection') else [g]:
        if part.geom_type=='LineString' and part.length>=.001:
            waters.append({'name':f['properties']['name'],'coords':list(part.coords)})
compact=lambda value:json.dumps(value,ensure_ascii=False,separators=(',',':'))
out="/* 八市行政区：© OpenStreetMap contributors / geoBoundaries，ODbL；河流：Natural Earth 公有领域。详见 docs/guangfo-data.md。 */\n'use strict';\n"
out+='const REGION_ADDITIONAL_DISTRICTS = '+compact(added)+';\n'
out+='const REGION_DISTRICTS = GUANGFO_DISTRICTS.concat(REGION_ADDITIONAL_DISTRICTS);\n'
out+='const REGION_BOUNDS = '+compact(bounds)+';\n'
out+='const REGION_RIVERS = '+compact(waters)+';\n'
Path('src/js/world/region-data.js').write_text(out)
print('features',len(all_features),'bounds',bounds,'rivers',len(waters),'points',sum(len(r['coords']) for r in waters),'bytes',len(out.encode()))
