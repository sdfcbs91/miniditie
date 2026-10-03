# 迷你地铁 · Mini Metro

一个纯前端的地铁规划小游戏（Canvas 2D 渲染，**零构建工具、零依赖安装、零联网**）。
玩法取自 Dinosaur Polo Club 的《Mini Metro》：拖拽车站连成线路，列车自动往返接送乘客，别让任何一座车站挤爆。

两种模式：**无限模式**（随机河流，无尽挑战）与**城市地图**（官方初版 6 城 —— 伦敦/巴黎/纽约/柏林/墨尔本/香港，
各有专属河流布局与轻度规则差异；上一城单局送达达标人数即解锁下一城，进度与最佳纪录存 localStorage）。

> 本项目已于 2026-10 从「单文件 index.html（900 行）」重构为模块化结构，**游戏逻辑与视觉表现逐行等价，未做任何玩法改动**。
> 第三方依赖（Tailwind / Lucide / Nunito）已全部本地化到 `vendor/` 并内联字体，**双击 `index.html` 即可运行**。

---

## 1. 快速开始

**双击 `index.html`。** 就这么简单 —— 不需要 Node、不需要 npm install、不需要起服务器、不需要联网。

```
miniditie/index.html   ← 双击即玩
```

之所以能做到，是因为项目刻意采用了 **经典 `<script>`（非 ES Module）** 的加载方式，详见第 4 节「命名与加载顺序」。

| 想做的事 | 做法 |
| --- | --- |
| 玩 | 双击 `index.html` |
| 改代码 | 直接编辑 `src/` 下的文件，保存后刷新浏览器（F5） |
| 调数值 | 只改 `src/js/config.js` 一个文件即可，见第 7 节 |
| 发给别人 | 整个 `miniditie/` 文件夹打包发过去，对方解压双击即可 |

浏览器要求：支持 Pointer Events 的现代浏览器（Chrome / Edge / Safari / Firefox 近年版本均可）。
`file://` 协议下无需任何特殊设置。

> 唯一注意：本项目**不使用** `type="module"`。如果哪天你需要 `fetch` 读本地 JSON、或用 `Worker`，
> 那些能力同样受 `file://` 的 CORS 限制，届时需要用任意静态服务器（`python -m http.server` 即可）——
> 但**游戏本身不需要**。

---

## 2. 目录结构

```
miniditie/
├── index.html                  # 唯一的 HTML：DOM 骨架 + 本地依赖引用 + 19 个入口 script
├── vendor/                     # 本地化的第三方资源（离线可用，见 vendor/README.md）
│   ├── README.md               #   来源 / 版本 / 许可证 / 重新下载命令
│   ├── tailwind-browser.js     #   Tailwind 浏览器运行时 4.3.3（自包含，无运行时请求）
│   ├── lucide.min.js           #   Lucide 图标 UMD 1.49.0
│   ├── nunito.css              #   Nunito 字体声明（woff2 已 base64 内联，单文件自包含）
│   └── fonts/*.woff2           #   5 个 Nunito 子集源码（保留备份，运行时不再被请求）
└── src/
    ├── styles/                 # 样式（Tailwind 只管布局工具类，这里管自定义组件）
    │   ├── base.css            #   页面与画布基础
    │   ├── hud.css             #   HUD 卡片、按钮、线路牌、toast、提示条
    │   └── modal.css           #   弹窗遮罩、入场动画、升级选项按钮
    └── js/
        ├── main.js             # 入口：按固定顺序初始化各子系统（必须是最后一个加载）
        ├── config.js           # 【调参入口】全局默认常量、配色、形状、权重（地图可覆写，见 maps.js）
        ├── utils.js            # rand / el / clamp
        ├── core/               # 与业务无关的底座
        │   ├── viewport.js     #   canvas、ctx、W/H/DPR、resize
        │   ├── storage.js      #   解锁进度 + 最佳纪录（localStorage，惰性初始化，不可用则退化为内存）
        │   ├── state.js        #   全局状态 G + reset(mapId)：按图初始化、应用地图参数覆写
        │   ├── audio.js        #   WebAudio 程序化音效（无音频文件）
        │   └── loop.js         #   requestAnimationFrame 主循环
        ├── world/              # 游戏世界（只改数据，不碰画布）
        │   ├── river.js        #   多河引擎：横河 y=c(x) / 竖河 x=c(y)，跨河/隧道判定，建站避让
        │   ├── maps.js         #   【城市地图定义】官方 6 城 + 无限模式河流：布局/参数覆写/解锁阈值
        │   ├── floaters.js     #   飘字（建站提示、+N 送达）
        │   ├── station.js      #   车站生成、乘客生成
        │   ├── line.js         #   线路几何 buildPath/pointAt、增删列车、删线
        │   ├── train.js        #   列车推进、到站上下客
        │   └── simulate.js     #   每帧推进：时间、生成、拥挤度、跨天、达标解锁
        ├── render/             # 渲染（只读状态，不改状态）
        │   ├── primitives.js   #   正多边形/形状路径/圆角矩形
        │   └── scene.js        #   render() 总入口 + 各图层绘制（含多河渲染）
        ├── input/
        │   └── pointer.js      #   指针交互：建线、改线、线段插入中间站、吸附、editing 态
        └── ui/                 # DOM 层（HUD / 弹窗 / 控制按钮）
            ├── hud.js          #   顶部数字、底部线路牌、toast、教学提示
            ├── modal.js        #   主菜单 / 城市选择 / 每周升级 / 游戏结束
            └── controls.js     #   暂停 / 倍速 / 静音 / 键盘 / 切后台
```

---

## 3. 分层规则（改动前先看这里）

```
        main.js
           │
   ┌───────┼────────┬─────────┬────────┐
   ▼       ▼        ▼         ▼        ▼
 core    world    render    input      ui
   ▲       ▲        │         │        │
   └───────┴────────┴─────────┴────────┘
        都依赖 core，core 不反向依赖任何人
```

| 规则 | 说明 |
| --- | --- |
| `core/` 不引用上层 | viewport / audio / loop 保持纯净，改渲染不影响它们 |
| `world/` 只改数据 | 唯一例外：`line.js` 会写 `line._path` 供渲染层复用 |
| `render/` 只读状态 | 渲染函数里不要改 `G`，否则会出现「帧内两次 render 结果不同」的难查 bug |
| `ui/` 只操作 DOM | 不碰 canvas；反过来 `render/` 也不碰 DOM（`drawPie` 是唯一例外，它画的是左上角的周进度小 canvas） |
| `input/` 独占 `editing` | `editing` 由 pointer.js 持有，渲染层只读 |

### 两个必须知道的机制

**① 共享全局词法作用域（为什么跨文件能读到最新值）**

所有脚本都是经典 `<script>`，它们**共用同一个全局词法环境**。所以：

```js
// core/state.js
let G = null;                 // 不是 window.G，但其它脚本可以按名字直接读
function reset() { G = { ... }; }   // 重新赋值后，谁读都是新对象

// render/scene.js
function render() { /* 这里直接用 G，永远是最新的 */ }
```

这等价于 ES Module 的 live binding，但**不需要 import**。`viewport.js` 的 `W / H / ctx` 同理（resize 后自动生效）。

⚠️ 由此带来一条铁律：**读 `G` / `W` / `H` / `ctx` 时不要缓存到本地变量**（如 `const g = G`），否则会读到旧值。

**② 循环引用是安全的（但只在函数体内使用）**

模块图里存在环，例如 `state → station → floaters → state`。
因为所有跨文件引用都发生在**函数体内**（而非脚本顶层求值期），加载顺序不影响正确性。

⚠️ 新增代码时请保持这个约定：**不要在脚本顶层读别的文件的 `let/const` 变量**。

---

## 4. 命名与加载顺序

这一节是重构后新增的核心约束，**新增模块前必读**。

### 为什么用经典 script 而不是 ES Module

`file://` 协议下，浏览器给页面分配的原点是 `null`，而外部 ES Module 的加载要走 CORS 校验 → 直接报
`Cross-origin request blocked` / `Access to script at 'file://...' from origin 'null' has been blocked`。这就是之前双击白屏的原因。

而**经典 `<script src>` 不受此限**（`<link rel=stylesheet>` 同样不受限）。
代价是需要自己管理加载顺序和命名，规则如下。

### 加载顺序的三个硬约束

`index.html` 底部的 21 个 `<script>` 标签是**有顺序的**，只依赖三条规则：

1. **被共享的声明要先出现**：`core/viewport.js`（提供 `W / H / DPR / ctx`）排在最前。
2. **`storage.js` → `river.js` → `maps.js` → `state.js` 的相对顺序不能换**：
   `maps.js` 顶层就调用 `river.js` 的 `mkRiverX/Y` 构造地图常量；`state.js` 的 `reset()` 依赖 `MAPS` 与 `setRiverLayout`。
3. **`main.js` 必须最后**：它是唯一在顶层执行初始化逻辑的脚本。

其余模块之间**可以任意顺序**，因为它们的交叉引用都发生在函数体内（见上一节机制②）。
当前顺序按分层排列（core → utils/config → world → input → ui → render → loop → main），便于阅读。

### 命名约束

| 声明形式 | 重名后果 |
| --- | --- |
| `let` / `const` / `class` | **直接 `SyntaxError`，整个脚本不执行** |
| `function` | 不报错，但后面的会**静默覆盖**前面的（更难查） |

所以：**新增顶层标识符前，先在项目里全局搜一遍名字是否已被占用。**
已踩过一次坑：`viewport.js` 与 `pointer.js` 都有 `let canvasEl` → 撞车，后者的已改名为 `pointerCanvas`。

当前共 **123 个顶层标识符**，全部唯一。

### 新增模块的四步

1. 文件放到对应分层目录（`world` / `render` / `ui` / `input` / `core`），**不要**往 `src/js/` 根目录塞。
2. 文件头部照抄现有模板：

```js
/* src/js/<分层>/<文件名>.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';

/* ← 依赖 ../core/state.js （提供 G, reset） */
/* ← 依赖 ../utils.js （提供 el） */
```

3. 在 `index.html` 的 script 区里插到合适位置（**不要放在 `main.js` 之后**），并在上面那行注释里写清依赖。
4. 用 `import` / `export` 吗？**不要。** 一旦出现 `export`，文件就必须以 `type="module"` 加载，双击就废了。

> 想检查有没有踩坑，见第 8 节的一键自检脚本。

---

## 5. 全局状态 `G`

`G` 是整个游戏唯一的数据源，定义在 `core/state.js` 的 `reset()` 里。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `running` | bool | 是否已开始（开场弹窗关闭后置 true） |
| `modal` | bool | 有弹窗遮挡。true 时主循环**不推进世界**，只渲染 |
| `over` | bool | 已结束 |
| `t` / `day` / `dayT` | number | 累计秒 / 天数 / 当天已过秒数 |
| `delivered` | number | 累计送达乘客 |
| `stations[]` | Station[] | 车站（坐标用 `nx/ny` 归一化 0~1 保存，**resize 不跑偏**） |
| `lines[]` | Line[] | 线路 |
| `floaters[]` | Floater[] | 飘字 |
| `unlockedLines` | number | 可开通线路数上限 |
| `spareLocos` / `spareCars` / `totalTunnels` | number | 备用列车 / 备用车厢 / 隧道总数 |
| `capBonus` | number | 车站容量额外加成（「站台扩建」升级累加） |
| `stationTimer` | number | 下一座新站的倒计时 |
| `speed` / `paused` | number/bool | 倍速（1/2）、暂停 |
| `nextId` | number | 自增 id（车站与线路共用） |
| `hintStage` | number | 教学提示进度，只前进不回退 |
| `mapId` / `mapIdx` / `mapName` | string/number | 当前图：`endless`=无限模式；否则为 maps.js 里的城市 id 与下标 |
| `unlockedThisRun` | string/null | 本局达标后新解锁的城市名（结算页横幅用，每局只触发一次） |
| `trainSpeed` / `carrCap` / `maxCarr` | number | 列车速度 / 每节车厢运力 / 单列车车厢上限（地图覆写后的生效值） |
| `spawnFactor` / `stationFactor` | number | 乘客 / 新站生成间隔的地图倍率（默认 1，越小刷得越快） |

**Station**：`{ id, nx, ny, shape, special, passengers[], cap, oc, born, spawnT, warned }`
- `oc` 0~1 拥挤度，转满一圈即关站 → 游戏结束
- `born` 用于 0.4s 出生缩放动画

**Line**：`{ id, color, stations[], loop, trains[], carriages, tunnels, served, _path }`
- `tunnels` = 跨河段数；`served` = 本线服务的形状集合（列车据此决定载谁）
- `_path` = 每帧由 `simulate` 重算并缓存的弧长表，渲染层与删线时复用

**Train**：`{ idx, d, dir, dwell, passengers[], carriages }`
- `d` = 沿线路的弧长位置；`dir` = ±1（非环线折返用）；`dwell` > 0 表示停站中

---

## 6. 关键机制速查

| 机制 | 位置 | 要点 |
| --- | --- | --- |
| 城市地图 | `world/maps.js` | 官方 6 城：每图 = 河流布局 + 参数覆写 + `unlockNext` 达标线；`reset(mapId)` 应用覆写 |
| 多河引擎 | `world/river.js` | 河流数组支持横河 y=c(x) 与竖河 x=c(y)（纽约双河夹出长岛）；跨几条河扣几条隧道 |
| 解锁与存档 | `core/storage.js` | localStorage 存「已解锁城数 + 各图最佳纪录」；惰性初始化 + try/catch，不可用则退化为内存 |
| 达标解锁 | `world/simulate.js` | 城市图单局送达 ≥ unlockNext → 解锁下一城 + toast + 写入存档，每局只触发一次 |
| 坐标归一化 | `world/station.js` | 车站存 `nx/ny`（0~1），绘制时才乘 `W/H`，窗口 resize 后布局不变形 |
| 河流与隧道 | `world/river.js` | 中心线由正弦叠加生成；两站分处异岸即算跨河；库存不足时拒绝建线（红色虚线 + 提示音） |
| 车厢与运力 | `world/line.js` / `render/scene.js` | 单列车运力 `capOf = G.carrCap × (1 + 车厢数)`（默认 6/12/18，墨尔本 9/18/27）；车长随座位列数伸展且两端留边距（默认 30px / 墨尔本 45px），乘客图标半径 3.0、三角形 ×1.35 补偿、车高 18px，座位间距 横 7.5 / 纵 7.2 |
| 线路展开 | `world/line.js` `buildPath` | 站点 → 折线 + 累计弧长表 `cum[]`；`pointAt(path, d)` 取点含朝向 |
| 列车推进 | `world/train.js` `stepTrain` | 按剩余步长**逐段**推进（不是直接加 d），跨过站点触发到站；`guard=8` 防死循环 |
| 上下客 | `world/train.js` `arriveAt` | 先下客（形状匹配）→ 再上客（目的地在 `line.served` 内且未超载） |
| 拥挤度 | `world/simulate.js` | 超载 `oc += dt/38`，缓解 `oc -= dt/14`；`oc>=1` 触发 `gameOver` |
| 难度曲线 | `world/simulate.js` | 新站间隔 `max(8.5, 15-(week-1))`，乘客间隔 `max(2.7, 6.2-(day-1)*0.09)`；第 3 周起 30% 双刷 |
| 形状难度 | `world/maps.js` `simpleShapes` | 伦敦/巴黎/纽约只刷基础三形（圆/三角/方）；柏林/墨尔本/香港与无限模式开放全部 8 种（含 5 种全场唯一特殊站） |
| 升级节奏 | `config.js` `UPGRADE_EVERY` / `UPGRADE_OPTS` + `ui/modal.js` `openUpgrade` | 每 3 天一次（触发日：第 4 / 7 / 10 … 天），每次从可用升级里随机抽 3 个三选一；两个参数都在 config.js，可直接调 |
| 建线交互 | `input/pointer.js` | 命中端点圆钮 → 延长旧线；命中车站 → 开新线；退回上一站=撤销；回到起点且≥3站=成环；按住线段中段拖到目标站 → 插入中间站（安全计算：端点/重复站排除 + 隧道库存校验，非法时预览变红） |
| 音效 | `core/audio.js` | 全部由振荡器合成，无音频文件；浏览器要求首次手势后 `AU.init()` |
| 站台种类 | `core/config.js` | 基础三形（圆 / 三角 / 方）+ 5 种全场唯一的特殊站（星 / 菱 / 五边 / 十字 / 六边）= 8 种（config.js:31 SHAPES_SPECIAL）。特殊站按 12% 概率刷出，越到后期形状越杂、换乘越难。|

---

## 7. 二次开发速查表

| 我想… | 改哪里 |
| --- | --- |
| 调难度（快慢、容量、上限） | `config.js`：`DAY_LEN` / `OC_LIMIT` / `BASE_CAP` / `MAX_TRAINS` / `MAX_STATIONS`（这些是全局默认值） |
| 加一张城市地图 | `world/maps.js` 的 `MAPS` 追加一项：`id/name/en/river/blurb/unlockNext` + `rivers` 布局 + 可选参数覆写，无需改任何其它文件 |
| 调某张图的手感 | `world/maps.js` 对应城市条目：`tunnels` / `locos` / `lines` / `trainSpeed` / `carrCap` / `maxCarr` / `spawnFactor` / `stationFactor` |
| 改解锁进度存储 | `core/storage.js`（换 key 或改存字段都在这里；注意已发布玩家浏览器里有旧档，字段变更要做兼容） |
| 改配色、加线路颜色 | `config.js`：`PALETTE`（数组长度即线路数上限，`UPGRADES[0].ok()` 依赖它） |
| 加一种车站形状 | ① `config.js` 的 `SHAPE_NAMES` + `PASSENGER_WEIGHT`；② `render/primitives.js` 的 `shapePath` 加 case；③ 想让它作为稀有站出现则加进 `SHAPES_SPECIAL` |
| 加一种升级 | `ui/modal.js` 的 `UPGRADES` 数组追加一项（`ok()` 可用性判断 + `apply()` 生效逻辑） |
| 加一个弹窗 | 照 `ui/modal.js` 里 `openWeek` 的写法：拼 innerHTML → `icons()` → 绑 onclick → 结束时 `hideModal()` |
| 改 HUD 布局 / 文案 | `index.html` 的 DOM 骨架（Tailwind 类）+ `ui/hud.js` 的数据填充 |
| 改视觉（线宽、圆角、动画） | `render/scene.js`（绘制顺序、线宽）与 `render/primitives.js`（图元） |
| 改输入手感（吸附半径等） | `input/pointer.js`：命中半径 16/14/17/20，`handlePos` 的 30px 外伸距离 |
| 加新图层（如隧道动画） | 在 `render/scene.js` 的 `render()` 里按 z 序插入一个 `drawXxx()`，函数也放该文件 |

### 代码风格约定

1. 注释用中文，重点解释**为什么**这么算（算法意图），而不是复述代码。
2. 不往 `window` 上挂东西，保持「全局词法作用域」这一套统一机制。
3. 顶层不执行副作用逻辑；需要初始化的（如绑事件）定义 `initXxx()`，由 `main.js` 统一调用。
4. 每个文件都有 `'use strict';`，保留它。

---

## 8. 验证方式

### 已通过的检查（可复现）

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 静态检查 | 无 `type="module"`、无 `http(s)` 外链、21 个脚本文件齐全、`main.js` 最后、river→maps→state 顺序、依赖注释里的标识符真实存在 | 全部 PASS |
| 命名冲突检查 | 扫描 21 个文件的顶层 `let/const/function/class` 声明 | 123 个标识符，无重名 |
| 顶层副作用检查 | 除 `main.js` 外，其余 20 个文件顶层无语句、无函数调用 | PASS |
| 无头执行冒烟（Node `vm`，共享上下文 + 假 localStorage） | 按序执行 21 个脚本：主菜单 → 无限模式建线跑 1800 帧 → 结束/重开/回菜单 → 选图页 6 卡 5 锁 → 锁定卡拒绝 → 伦敦开局 → 达标解锁巴黎（存档写入）→ 墨尔本/纽约/柏林/香港参数覆写 → 双河隧道计数 → 建站避让 → 线段拖拽插入中间站（含线上站拒绝、隧道不足拒绝、插入后隧道重算）→ 车厢乘客图标按 `G.carrCap` 排版 | **85 项断言全部 PASS** |
| 真实浏览器（`file://` 双击场景） | 无头 Chrome 直接打开 `file:///.../index.html`：主菜单截图、选图页截图、注入真实 PointerEvent 在纽约图拖拽建线 | 双竖河渲染正确、跨河扣隧道（5→4）、列车运行、周标签显示「第 1 周 · 纽约」 |

冒烟覆盖的行为：主菜单双入口渲染、初始仅 1 城解锁、无限模式开局、开局 3 座车站、
拖拽三座车站生成 1 条线路并自动分配列车、底部线路牌渲染、天数推进、乘客送达、新站生成、
游戏结束、重开后状态复位、结算页返回主菜单；选图页 6 卡渲染与锁定态、锁定卡拒绝并提示、
伦敦开局默认参数、达标 100 人解锁巴黎（toast + 存档写入 localStorage + 结算页横幅）、
主菜单解锁计数刷新、墨尔本/纽约/柏林/香港的参数覆写生效、纽约双河跨 1/2 条河的隧道计数、
300 次建站全部避开河面。

### 自己再跑一次

无需任何依赖，只要装了 Node：

```bash
# 静态自检：命名冲突 / 加载顺序 / 外链 / 模块语法 / 顶层副作用
node --input-type=module -e "
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srcs = [...html.matchAll(/<script src=\"(\.\/src\/js\/[^\"]+)\"/g)].map(m=>m[1]);
console.log('脚本数:', srcs.length);
console.log('含 type=module:', /<script[^>]*type=\"module\"/.test(html));
const names = new Map();
for (const s of srcs) {
  const t = fs.readFileSync(s,'utf8');
  if (/^[ \t]*(import|export)[\s{]/m.test(t)) console.log('❌ 残留模块语法:', s);
  for (const m of t.matchAll(/^(?:let|const|function|class)\s+([A-Za-z_\$][\w\$]*)/gm)) {
    if (names.has(m[1])) console.log('❌ 重名:', m[1], names.get(m[1]), '↔', s);
    names.set(m[1], s);
  }
}
console.log('顶层标识符:', names.size, names.size ? '（无重名冲突提示即通过）' : '');
console.log('main.js 最后:', srcs[srcs.length-1] === './src/js/main.js');
"
```

手动验证最直接：双击 `index.html` → 点「开始游戏」→ 从一座车站拖到另一座 → 松手出现红色线路和列车。

---

## 9. 已知问题与待办

- [ ] **不存对局进度**：刷新后对局重来（刻意保留的街机感）；解锁进度与最佳纪录已存 localStorage
- [ ] `PALETTE` 用完后「新线路」升级仍可能出现（已被 `ok()` 挡住，但备选池会变窄）
- [ ] 环形线路上列车全部同向行驶，未实现官方的双向环线
- [ ] 无触屏多点缩放 / 无无障碍支持
- [ ] 渲染未做离屏缓存，站点数接近 28 上限时每帧路径重复计算（`buildPath` 可加脏标记优化）
- [ ] 城市河流为单值函数（横河 y=c(x) / 竖河 x=c(y)），暂不支持分叉河或湖泊（如官方开罗的尼罗河汊）
- [x] ~~无存档 / 无关卡选择~~ → 已加官方 6 城地图 + 逐城解锁 + 最佳纪录（localStorage）
- [x] ~~CDN 依赖离线不可用~~ → 已本地化到 `vendor/`，且 `index.html` 零外部请求
- [x] ~~双击 `index.html` 白屏~~ → 已从 ES Module 改为经典 `<script>`，`file://` 直接可用
- [ ] Lucide 用的是 434 KB 全量包，项目只需 19 个图标（`users` `pause` `play` `volume-2` `volume-x` `mountain` `train-front` `layers` `circle-dot` `arrow-right-left` `alarm-clock` `rotate-ccw` `hand` `gift` `infinity` `map` `chevron-right` `lock` `arrow-left`），可按需裁剪省约 420 KB

### 体积构成（浏览器实际加载）

| 部分 | 大小 |
| --- | --- |
| Lucide UMD（全量图标） | 434 KB |
| Tailwind 浏览器运行时 | 275 KB |
| Nunito 字体（5 个子集，base64 内联在 `nunito.css`） | 181 KB |
| 游戏代码（21 个模块） | 69 KB |
| HTML + 3 份 CSS | 8 KB |
| **合计** | **约 967 KB** |

> 最大头是 Lucide。想瘦身可只打包用到的 19 个图标，见 `vendor/README.md`。
> `vendor/fonts/*.woff2`（137 KB）是字体源码备份，运行时不会被请求（`nunito.css` 已内联），可安全删除。

---

## 10. 版权与致谢

玩法灵感来自 Dinosaur Polo Club 的《Mini Metro》，本项目仅为前端技术练习，未使用其任何美术与音频资源。
图标使用 [Lucide](https://lucide.dev/)，字体使用 [Nunito](https://fonts.google.com/specimen/Nunito)，
布局工具类使用 [Tailwind CSS](https://tailwindcss.com/) 浏览器版。
