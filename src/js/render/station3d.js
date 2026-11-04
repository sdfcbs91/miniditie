/* 地铁出入口 Three.js 图层；车站造型由实际服务线路决定，指针交互留在主画布。 */
'use strict';
let stationThreeRenderer = null;
let stationThreeUnavailable = false;

// 与 shapePath 使用相同的轮廓，转为 Three.js 的向上 Y 轴。
function stationThreeOutline(shape) {
  const points=[];
  const polygon=(n,rotation,alternating) => {
    for (let i=0;i<n;i++) {
      const angle=rotation+i*Math.PI*2/n, radius=12*(alternating && i%2 ? .48 : 1);
      points.push([Math.cos(angle)*radius,-Math.sin(angle)*radius]);
    }
  };
  switch (shape) {
    case 'circle': polygon(40,0,false); break;
    case 'triangle': polygon(3,-Math.PI/2,false); break;
    case 'square': points.push([-10.2,10.2],[10.2,10.2],[10.2,-10.2],[-10.2,-10.2]); break;
    case 'diamond': polygon(4,-Math.PI/2,false); break;
    case 'pentagon': polygon(5,-Math.PI/2,false); break;
    case 'hexagon': polygon(6,0,false); break;
    case 'star': polygon(10,-Math.PI/2,true); break;
    case 'cross': {
      const a=12*.38;
      for (const [x,y] of [[-a,-12],[a,-12],[a,-a],[12,-a],[12,a],[a,a],
        [a,12],[-a,12],[-a,a],[-12,a],[-12,-a],[-a,-a]]) points.push([x,-y]);
      break;
    }
  }
  return points;
}

function disposeStationThree(r) {
  if (!r) return;
  try {
    for (const object of r.stations.values()) disposeStationThreeModel(object);
    for (const geometry of r.geometries.values()) { geometry.body.dispose(); geometry.face.dispose(); }
    r.boxGeometry.dispose();
    for (const material of Object.values(r.materials)) material.dispose();
    for (const material of r.lineMaterials.values()) material.dispose();
    r.renderer.dispose();
  } catch (error) { console.warn('站点三维资源清理失败',error); }
}

function createStationThreeRenderer() {
  const bundle=window.WaterThreeLib, canvas=document.getElementById('stationThreeSurface');
  if (!bundle || !canvas) return null;
  let gl;
  try { gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true}); }
  catch (_) { return null; }
  if (!gl) return null;
  let renderer;
  try {
    const T=bundle.THREE;
    renderer=new T.WebGLRenderer({canvas,context:gl,alpha:true,antialias:true});
    renderer.setClearColor(0x000000,0); renderer.outputColorSpace=T.SRGBColorSpace;
    const scene=new T.Scene(), camera=new T.OrthographicCamera(0,1,1,0,.1,1500);
    camera.position.set(0,0,500); camera.lookAt(0,0,0); camera.updateMatrixWorld();
    scene.add(new T.HemisphereLight(0xffffff,0x8b9687,1.15));
    const light=new T.DirectionalLight(0xffffff,1.15); light.position.set(-100,200,400); scene.add(light);
    const materials={
      concrete:new T.MeshStandardMaterial({color:0xb0b9b0,roughness:.94}),
      glass:new T.MeshStandardMaterial({color:0x528082,roughness:.32,metalness:.12}),
      roof:new T.MeshStandardMaterial({color:0xe9e9dd,roughness:.76}),
      metal:new T.MeshStandardMaterial({color:0x53625e,roughness:.8}),
      stairs:new T.MeshStandardMaterial({color:0xd2d6cc,roughness:1}),
      edge:new T.MeshBasicMaterial({color:0x232f2c}),
      face:new T.MeshBasicMaterial({color:0xfaf8f0}),
      crowded:new T.MeshBasicMaterial({color:0xf6d2c9}),
      neutral:new T.MeshBasicMaterial({color:0x84918c})
    };
    const out={canvas,gl,renderer,scene,camera,materials,boxGeometry:new T.BoxGeometry(1,1,1),
      lineMaterials:new Map(),geometries:new Map(),stations:new Map(),key:''};
    if (!canvas.stationThreeEventsBound) {
      canvas.stationThreeEventsBound=true;
      canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault(); canvas.hidden=true;
        const previous=stationThreeRenderer; stationThreeRenderer=null; stationThreeUnavailable=true;
        disposeStationThree(previous);
      });
      canvas.addEventListener('webglcontextrestored', () => { stationThreeRenderer=null; stationThreeUnavailable=false; });
    }
    return out;
  } catch (error) {
    if (renderer) renderer.dispose();
    canvas.hidden=true; console.warn('车站三维图层初始化失败，使用 Canvas 降级',error); return null;
  }
}

function stationThreeGeometry(r, shape) {
  if (r.geometries.has(shape)) return r.geometries.get(shape);
  const T=window.WaterThreeLib.THREE, points=stationThreeOutline(shape);
  if (!points.length) return null;
  const path=new T.Shape();
  path.moveTo(points[0][0],points[0][1]);
  for (let i=1;i<points.length;i++) path.lineTo(points[i][0],points[i][1]);
  path.closePath();
  // 保留游戏的八种目的地图标，放在入口雨棚的顶面标牌上。
  const body=new T.ShapeGeometry(path); body.scale(.60,.60,1);
  const face=new T.ShapeGeometry(path); face.scale(.41,.41,1);
  const geometry={body,face}; r.geometries.set(shape,geometry); return geometry;
}

// 每条实际服务线路只计一次，编辑中的预览不提前改变车站等级。
function stationServiceColors(st) {
  return G.lines.filter(line => line.stations.includes(st)).map(line => line.color);
}

function stationThreeLineMaterial(r, color) {
  if (!r.lineMaterials.has(color)) r.lineMaterials.set(color,new window.WaterThreeLib.THREE.MeshBasicMaterial({color}));
  return r.lineMaterials.get(color);
}

function disposeStationThreeModel(object) {
  // 几何和材质全局共享，只释放实例的矩阵缓冲。
  object.group.traverse(child => { if (child.isInstancedMesh) child.dispose(); });
}

// 玻璃入口、檐篷、立柱、台阶及线路色条都是真实的 3D 网格；换乘站有两组入口。
function createStationThreeModel(r, st, colors) {
  const T=window.WaterThreeLib.THREE, geometry=stationThreeGeometry(r,st.shape);
  if (!geometry) throw Error('未知车站形状: '+st.shape);
  const transfer=colors.length>=2, width=transfer ? 40 : 32;
  const group=new T.Group(), projection=new T.Group(); group.add(projection);
  // 顶部的站点标识对准原始坐标，保证线路终点与指针锚点不变。
  projection.matrix.set(1,0,-.4,3.12, 0,1,1,-7.8, 0,0,1,0, 0,0,0,1);
  projection.matrixAutoUpdate=false;
  const batches=new Map();
  function box(x,y,z,w,d,h,material) {
    if (!batches.has(material)) batches.set(material,[]);
    batches.get(material).push(new T.Matrix4().makeScale(w,d,h).setPosition(x,y,z+h/2));
  }
  // 基座、玻璃候车廊、四根支柱及浅色雨棚。
  box(0,0,0,width+2,20,1.2,r.materials.concrete);
  box(0,0,1.2,width-5,12,5.1,r.materials.glass);
  for (const x of [-width/2+3,width/2-3]) for (const y of [-5,5]) box(x,y,1.2,1.3,1.3,5.8,r.materials.metal);
  box(0,0,6.3,width,15,1.1,r.materials.roof);
  // 正面入口的踏步：单线站一个入口，换乘站两组独立入口。
  for (const x of transfer ? [-10,10] : [0]) {
    const stepWidth=transfer ? 11 : 14;
    box(x,-8.4,1.2,stepWidth,4,1,r.materials.metal);
    for (let i=0;i<3;i++) box(x,-10-i*2.3,1.3-i*.24,stepWidth-1,1.1,.32,r.materials.stairs);
  }
  // 按线路顺序排列颜色，保留全部已连接线路；未接线时使用中性色。
  const signs=colors.length ? colors : [null], stripWidth=width-6;
  signs.forEach((color,i) => box(-stripWidth/2+(i+.5)*stripWidth/signs.length,5.8,7.42,
    Math.max(.45,stripWidth/signs.length-.4),1.8,.18,color ? stationThreeLineMaterial(r,color) : r.materials.neutral));
  // 同材质的柱、踏步与结构合批，缩放和平移地图时降低绘制调用。
  for (const [material,matrices] of batches) {
    const batch=new T.InstancedMesh(r.boxGeometry,material,matrices.length);
    matrices.forEach((matrix,i) => batch.setMatrixAt(i,matrix));
    batch.instanceMatrix.needsUpdate=true; projection.add(batch);
  }
  // 原有形状作为醒目的站点识别标志，不改变候车乘客的目的地规则。
  const mark=new T.Mesh(geometry.body,r.materials.edge), face=new T.Mesh(geometry.face,r.materials.face);
  mark.position.z=7.72; face.position.z=7.78; projection.add(mark,face);
  return {group,face,shape:st.shape,signature:st.shape+'|'+colors.join('|'),transfer,serviceColors:colors.slice()};
}

// 所有站点共用几何和材质；仅在位置、出生动画或拥挤状态变化时重绘。
function drawStationsThree() {
  if (!window.WaterThreeLib || stationThreeUnavailable) return false;
  if (!stationThreeRenderer) {
    stationThreeRenderer=createStationThreeRenderer();
    if (!stationThreeRenderer) { stationThreeUnavailable=true; return false; }
  }
  const r=stationThreeRenderer, T=window.WaterThreeLib.THREE;
  try {
    if (r.gl.isContextLost()) { r.canvas.hidden=true; return false; }
    const key=[W,H,DPR,...G.stations.flatMap(st => [st.id,st.shape,st.nx,st.ny,
      Math.max(0,Math.min(1,(G.t-st.born)/.4)),st.oc>.5,stationServiceColors(st).join('|')])].join(',');
    if (key!==r.key) {
      if (r.width!==W || r.height!==H || r.dpr!==DPR) {
        r.width=W; r.height=H; r.dpr=DPR;
        r.camera.left=0; r.camera.right=W; r.camera.top=H; r.camera.bottom=0;
        r.camera.updateProjectionMatrix(); r.camera.updateMatrixWorld();
        r.renderer.setPixelRatio(DPR); r.renderer.setSize(W,H,false);
        r.canvas.style.width=W+'px'; r.canvas.style.height=H+'px';
      }
      const seen=new Set();
      G.stations.forEach((st,index) => {
        seen.add(st.id);
        const colors=stationServiceColors(st), signature=st.shape+'|'+colors.join('|');
        let object=r.stations.get(st.id);
        if (object && object.signature!==signature) { r.scene.remove(object.group); disposeStationThreeModel(object); r.stations.delete(st.id); object=null; }
        if (!object) {
          object=createStationThreeModel(r,st,colors);
          r.scene.add(object.group); r.stations.set(st.id,object);
        }
        const pop=Math.max(0,Math.min(1,(G.t-st.born)/.4)), scale=1-Math.pow(1-pop,3);
        object.group.visible=scale>0;
        object.group.position.set(st.nx*W,H-st.ny*H,index*.01);
        object.group.scale.set(scale,scale,scale);
        object.group.traverse(child => { if (child.isMesh) child.renderOrder=index; });
        object.face.material=st.oc>.5 ? r.materials.crowded : r.materials.face;
      });
      for (const [id,object] of r.stations) if (!seen.has(id)) { r.scene.remove(object.group); disposeStationThreeModel(object); r.stations.delete(id); }
      r.renderer.render(r.scene,r.camera); r.key=key;
    }
    if (r.canvas.hidden) r.canvas.hidden=false;
    return true;
  } catch (error) {
    r.canvas.hidden=true; stationThreeRenderer=null; stationThreeUnavailable=true; disposeStationThree(r);
    console.warn('车站三维图层不可用，使用 Canvas 降级',error); return false;
  }
}
