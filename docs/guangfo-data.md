# 八市与广佛底图数据与精度

## 行政区

- 数据：**geoBoundaries gbOpen China ADM3**（2017 年区县边界），底层来源为 Lee Beryman / OpenStreetMap，© OpenStreetMap contributors；以 **ODbL 1.0** 授权。致谢 geoBoundaries 项目。
- 获取来源：[geoBoundaries 项目](https://github.com/wmgeolab/geoBoundaries)，[按省拆分的 gbOpen 数据副本](https://github.com/MatChaRoubei/eath-analyse/tree/main/public/data/china-counties)，使用广东文件 `43563684B38891657012300.geojson`。
- 本项目从广东文件中选择广州 11 区和佛山 5 区，补充中文区名与标签位置，**保留该文件中的全部多边形、内环、离岛及坐标，不再额外简化或舍入**。所得数据位于 `src/js/world/guangfo-data.js`，依据 ODbL 1.0 提供；许可文本见 <https://opendatacommons.org/licenses/odbl/1-0/>。
- **限制**：上述广东副本本身来自 geoBoundaries 的简化版本，并非未经简化的原始测绘区界；2017 年区划也可能与现状不同。本项目无法据此提供完整的高精度原始边界，不适用于导航、测量或行政争议判定。

## 无限模式扩展：中山、珠海、东莞、清远、深圳、惠州

- 在广佛 16 区之外，从同一广东 2017 简化数据选择珠海 3 区、清远 8 个区县（含县级市）、惠州 5 个区县、深圳的 7 个区，以及中山、东莞两个整市边界。中山和东莞不设县级区，游戏仅用**整市**多边形表示，未提供镇街细分。
- 该 2017 副本缺少深圳盐田和光明；使用 [missinglink/osm-boundaries 历史快照](https://github.com/missinglink/osm-boundaries/tree/4b9b610f25ec3477683c8a203ed486ecdb8c9f9f/data) 中的 OpenStreetMap 关系 [盐田 5663273](https://github.com/missinglink/osm-boundaries/blob/4b9b610f25ec3477683c8a203ed486ecdb8c9f9f/data/005/663/273/005663273.geojson)、[光明 5664192](https://github.com/missinglink/osm-boundaries/blob/4b9b610f25ec3477683c8a203ed486ecdb8c9f9f/data/005/664/192/005664192.geojson)，以及 [大鹏新区 3536166](https://github.com/missinglink/osm-boundaries/blob/4b9b610f25ec3477683c8a203ed486ecdb8c9f9f/data/003/536/166/003536166.geojson)。© OpenStreetMap contributors，ODbL 1.0。该仓库快照不晚于 2019 年，光明数据仍标作「光明新区」，仅作为现光明区的**历史近似**。大鹏为功能新区，不是另一个法定县级区；未纳入位于汕尾的深汕特别合作区。
- 不同数据源和年代的区域存在重叠，生成时使用 Shapely 将新增的盐田、光明、大鹏多边形从有重叠的广东副本区域中扣除，避免地图绘制和建站命中冲突；边界不再额外简化或舍入，但差集会增加交点。标签采用最大多边形内部代表点，离岛和内环予以保留。混合年代且经过差集的成果仅为游戏地图，**不代表当前官方行政边界**，不能用于测绘、导航或纠纷判定。
- 无限模式共有 44 条区域目录记录（广佛 16、珠海 3、清远 8、惠州 5、深圳 9 区及大鹏功能新区、中山 1、东莞 1），保留原独立广佛地图的 16 区不变。数据输出为 `src/js/world/region-data.js`；可用 `python scripts/build-region-data.py <广东geojson> <NaturalEarth河流geojson> <OSM目录>` 重建（需 Shapely；OSM 目录包含上述三个按关系号命名的文件）。

## 水系

- 数据：[Natural Earth 1:10m Rivers + Lake Centerlines](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_rivers_lake_centerlines.geojson)，Natural Earth 数据为公有领域；本项目将与广佛范围相交的线段裁切到经纬度范围 112.38–114.06、22.55–23.94，并剔除长度小于 0.001 度的微小碎线。无限模式单独按八市全部边界外接框加 0.03 度余量裁切，独立广佛模式仍用原范围。
- 水系为地理数据中已有的西江、北江、东江等主要河流中心线，覆盖并不完整；它不是实测河岸多边形，不包含所有河汊、湖泊或小河。为让稀疏中心线的弯曲更平滑，游戏对原始河道节点做 centripetal Catmull–Rom 插值并固定采样；近景显示、跨河和建站避水共用这条采样曲线；远景渲染会进一步降低显示采样密度，不改变判定。插值位置不是实测河道。河宽变化、深浅颜色、岸坡、泡沫与流动波纹均为游戏化效果，不代表真实河宽、河床深度、流速或流向。
- 跨河按线路段与水系中心线的交点计算隧道库存；跨河段用可见的三维隧道剖面展示，并按显示河宽、中心线交角估算两岸入口。它们只是游戏示意，不表示实测河岸、隧道位置、埋深或实际工程。生成车站时避开显示河道。经典城市保留原本的示意河流与判定。

## 投影与游戏内容

无限模式显示上述广东八市，使用以约北纬 23° 为标准纬线的等距圆柱投影，支持缩放和平移，水平比例尺随纬度调整。开局的海珠近景保留原广佛全图线性放大 50 倍时的绝对显示比例；可通过「全图」「近景」和区县目录切换视角，新站在当前可视范围内的八市区域边界中生成（视口不含区域或位置不足时暂不生成）。经纬网随缩放自适应，色彩渐变和纸纹是装饰，不表示真实高程、地貌或道路。屏幕尺寸不等于真实世界物理尺寸：该历史底图并非测绘级或街道级 1:1 数据。站点为游戏随机生成，不代表实际地铁站。

## 渲染技术与限制

河流按采样曲线切线生成梯形槽形截面，三角网格分别绘制两岸坡、水面和半透明泡沫带。在支持 WebGL 2 的设备上由 Three.js 绘制：水面顶点叠加三组正弦波，有限差分产生法线，物理材质读取由本地程序天空生成的 PMREM 环境反射。全图远景降低网格密度并关闭波浪和泡沫，水面更新限制在每秒 30 次。

无限模式右侧「水效+」可启用 N8AO 半分辨率环境遮蔽和两级 CSM 阴影；它们仅覆盖 Three.js 河槽和岸坡，**不会给 2D 地图、列车、线路或站点添加场景级阴影**。增强模式更耗 GPU，默认关闭；开启失败会回到标准水效。WebGL 2 不可用或上下文丢失时切回原生 WebGL 1，WebGL 不可用时使用 Canvas 近似画法。

当前没有真实地形高程、桥墩或雨棚场景，也没有雨棚后期、实时流体、平面反射或 SSR。数据和地图均为离线文件，没有 Overpass、MapLibre 或 deck.gl 运行时请求。依赖版本、许可和可选重建命令见 [vendor/README.md](../vendor/README.md)。
