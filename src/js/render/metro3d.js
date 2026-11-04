/* 离线 Three.js 线路与跨河隧道剖面；几何只用于显示，不修改建线或行车判定。 */
'use strict';
let metroThreeRenderer = null;
let metroThreeUnavailable = false;

// 返回每条被跨越的河流在当前屏幕路线上的中心与近似两岸。判定仍使用原有交点/库存逻辑。
function metroTunnelSpans(a,b) {
  const ax=a.nx*W, ay=a.ny*H, bx=b.nx*W, by=b.ny*H;
  const dx=bx-ax, dy=by-ay, length=Math.hypot(dx,dy);
  if (length<1e-6) return [];
  const hits=[];
  if (isGuangfoWater()) {
    for (const t of guangfoWaterCrossings(a,b)) {
      const x=ax+dx*t, y=ay+dy*t;
      let best=Infinity, tangent=null;
      for (const path of guangfoProjectedWater()) for (let i=1;i<path.length;i++) {
        const p=path[i-1], q=path[i], rx=q.x-p.x, ry=q.y-p.y, len2=rx*rx+ry*ry;
        if (len2<1e-12) continue;
        const u=Math.max(0,Math.min(1,((x-p.x)*rx+(y-p.y)*ry)/len2));
        const distance=(x-p.x-rx*u)**2+(y-p.y-ry*u)**2;
        if (distance<best) { best=distance; tangent={x:rx/Math.sqrt(len2),y:ry/Math.sqrt(len2)}; }
      }
      const sine=tangent ? Math.abs(dx*tangent.y-dy*tangent.x)/length : 1;
      // 源数据只有中心线；使用显示河宽和交角估算两岸，不是实测隧道入口。
      hits.push({t,half:guangfoWaterWidth()*.5/Math.max(.12,sine)/length});
    }
  } else {
    for (const river of RIVERS) {
      if (riverSideOf(river,ax,ay)*riverSideOf(river,bx,by)!==-1) continue;
      const offset=t => {
        const x=ax+dx*t, y=ay+dy*t;
        return river.axis==='x' ? y-riverCenterAt(river,x) : x-riverCenterAt(river,y);
      };
      let lo=0, hi=1, sign=offset(0);
      for (let i=0;i<40;i++) { const mid=(lo+hi)/2; if (offset(mid)*sign>0) lo=mid; else hi=mid; }
      const t=(lo+hi)/2, x=ax+dx*t, y=ay+dy*t, u=river.axis==='x'?x:y;
      const slope=(riverCenterAt(river,u+1)-riverCenterAt(river,u-1))/2;
      const derivative=river.axis==='x' ? dy-slope*dx : dx-slope*dy;
      hits.push({t,half:riverHalfPx(river)/Math.max(Math.abs(derivative),length*.12)});
    }
  }
  hits.sort((x,y)=>x.t-y.t);
  return hits.map((hit,i) => {
    const lower=i ? (hits[i-1].t+hit.t)/2 : 0;
    const upper=i+1<hits.length ? (hit.t+hits[i+1].t)/2 : 1;
    return {t:hit.t,start:Math.max(lower,hit.t-hit.half),end:Math.min(upper,hit.t+hit.half)};
  });
}

function disposeMetroThreeGroup(group) {
  if (group) group.traverse(item => { if (item.isInstancedMesh) item.dispose(); });
}
function disposeMetroThree(r) {
  if (!r) return;
  try {
    disposeMetroThreeGroup(r.group);
    for (const geometry of Object.values(r.geometries)) geometry.dispose();
    for (const material of Object.values(r.materials)) material.dispose();
    for (const material of r.lineMaterials.values()) material.dispose();
    r.renderer.dispose();
  } catch (error) { console.warn('线路三维资源清理失败',error); }
}
function createMetroThreeRenderer() {
  const bundle=window.WaterThreeLib, canvas=document.getElementById('metroThreeSurface');
  if (!bundle || !canvas) return null;
  let gl;
  try { gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true}); } catch (_) { return null; }
  if (!gl) return null;
  let renderer;
  try {
    const T=bundle.THREE;
    renderer=new T.WebGLRenderer({canvas,context:gl,alpha:true,antialias:true});
    renderer.setClearColor(0x000000,0); renderer.outputColorSpace=T.SRGBColorSpace;
    const scene=new T.Scene(), camera=new T.OrthographicCamera(0,1,1,0,.1,1500);
    camera.position.set(0,0,500); camera.lookAt(0,0,0); camera.updateMatrixWorld();
    scene.add(new T.HemisphereLight(0xffffff,0x839489,1.4));
    const light=new T.DirectionalLight(0xffffff,1.25); light.position.set(-100,250,400); scene.add(light);
    const geometries={box:new T.BoxGeometry(1,1,1),
      cap:new T.CylinderGeometry(1,1,1,12),
      tunnel:new T.CylinderGeometry(7.8,7.8,1,16,1,true,-Math.PI/2,Math.PI),
      arch:new T.TorusGeometry(8.1,1.4,6,16,Math.PI)};
    const materials={base:new T.MeshStandardMaterial({color:0x57625c,roughness:.9}),
      rail:new T.MeshBasicMaterial({color:0xe8f1e8}),
      ties:new T.MeshBasicMaterial({color:0x475650,transparent:true,opacity:.38,depthWrite:false}),
      tunnelBase:new T.MeshStandardMaterial({color:0x657b77,roughness:.87}),
      arch:new T.MeshStandardMaterial({color:0xdce2d7,roughness:.84,side:T.DoubleSide}),
      shell:new T.MeshStandardMaterial({color:0x679295,roughness:.38,transparent:true,opacity:.44,side:T.DoubleSide,depthWrite:false})};
    const out={canvas,gl,renderer,scene,camera,geometries,materials,lineMaterials:new Map(),group:null,key:'',spanCount:0,portalCount:0};
    if (!canvas.metroThreeEventsBound) {
      canvas.metroThreeEventsBound=true;
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault(); canvas.hidden=true;
        const previous=metroThreeRenderer; metroThreeRenderer=null; metroThreeUnavailable=true; disposeMetroThree(previous);});
      canvas.addEventListener('webglcontextrestored',()=>{metroThreeRenderer=null; metroThreeUnavailable=false;});
    }
    return out;
  } catch (error) {
    if (renderer) renderer.dispose(); canvas.hidden=true;
    console.warn('线路三维图层初始化失败，使用 Canvas 降级',error); return null;
  }
}

function metroThreeColor(r,color) {
  if (!r.lineMaterials.has(color)) r.lineMaterials.set(color,new window.WaterThreeLib.THREE.MeshStandardMaterial({color,roughness:.72}));
  return r.lineMaterials.get(color);
}

// 合批同一材质的轨床、轨道和隧道壳，截断屏幕外长线段以限制缩放开销。
function buildMetroThreeGroup(r, lines) {
  const T=window.WaterThreeLib.THREE, group=new T.Group(), projection=new T.Group(); group.add(projection);
  projection.matrix.set(1,0,-.38,.95, 0,1,.8,-2, 0,0,1,0, 0,0,0,1); projection.matrixAutoUpdate=false;
  const batches=new Map(), add=(geometry,material,matrix) => {
    let byMaterial=batches.get(geometry); if (!byMaterial) { byMaterial=new Map(); batches.set(geometry,byMaterial); }
    if (!byMaterial.has(material)) byMaterial.set(material,[]); byMaterial.get(material).push(matrix);
  };
  const matrix=(x,y,z,sx,sy,sz,angle=0) => {
    const m=new T.Matrix4().makeRotationZ(angle); m.scale(new T.Vector3(sx,sy,sz)); m.setPosition(x,H-y,z+layer); return m;
  };
  const archRotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2);
  let spanCount=0, portalCount=0, layer=0;
  for (const [lineIndex,line] of lines.entries()) {
    layer=lineIndex*.04;
    const stations=line.stations, n=stations.length, material=metroThreeColor(r,line.color);
    if (n<2) continue;
    const segments=line.loop && n>2 ? n : n-1;
    for (let i=0;i<segments;i++) {
      const a=stations[i], b=stations[(i+1)%n];
      const ax=a.nx*W, ay=a.ny*H, bx=b.nx*W, by=b.ny*H;
      const dx=bx-ax, dy=by-ay, length=Math.hypot(dx,dy);
      if (length<.001) continue;
      const angle=-Math.atan2(dy,dx), tx=dx/length, ty=dy/length, nx=-ty, ny=tx;
      const visible=waterVisibleRange({x:ax,y:ay},{x:bx,y:by},45);
      if (visible) {
        const l=length*(visible[1]-visible[0]), mx=ax+dx*(visible[0]+visible[1])/2, my=ay+dy*(visible[0]+visible[1])/2;
        add(r.geometries.box,r.materials.base,matrix(mx,my,.65,l,11,1.3,angle));
        add(r.geometries.box,material,matrix(mx,my,1.9,l,8.5,1.2,angle));
        for (const side of [-1,1]) add(r.geometries.box,r.materials.rail,matrix(mx+nx*side*2.65,my+ny*side*2.65,2.58,l,.7,.16,angle));
        const first=Math.ceil(length*visible[0]/18)*18;
        for (let d=first;d<=length*visible[1] && d-first<2400;d+=18) {
          add(r.geometries.box,r.materials.ties,matrix(ax+tx*d,ay+ty*d,2.53,1,7.4,.12,angle));
        }
      }
      if (!visible) continue; // 整段不在视口附近，不构建其河道隧道。
      const spans=metroTunnelSpans(a,b); spanCount+=spans.length;
      for (const span of spans) {
        const p={x:ax+dx*span.start,y:ay+dy*span.start}, q={x:ax+dx*span.end,y:ay+dy*span.end};
        const range=waterVisibleRange(p,q,35);
        if (range) {
          const t=(range[0]+range[1])/2, px=p.x+(q.x-p.x)*t, py=p.y+(q.y-p.y)*t;
          const len=Math.hypot(q.x-p.x,q.y-p.y)*(range[1]-range[0]);
          if (len>.01) {
            add(r.geometries.box,r.materials.tunnelBase,matrix(px,py,1.1,len,15,.7,angle));
            add(r.geometries.tunnel,r.materials.shell,matrix(px,py,1.5,1,len,1,angle-Math.PI/2));
          }
        }
        for (const portal of [p,q]) {
          if (portal.x < -20 || portal.x > W+20 || portal.y < -20 || portal.y > H+20) continue;
          const qz=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle+Math.PI/2).multiply(archRotation);
          const m=new T.Matrix4().compose(new T.Vector3(portal.x,H-portal.y,1+layer),qz,new T.Vector3(1,1,1));
          add(r.geometries.arch,r.materials.arch,m); portalCount++;
        }
      }
    }
    // 圆角端头与折点保持与原二维路线同一锚点。
    for (const station of stations) {
      const x=station.nx*W, y=station.ny*H;
      if (x < -20 || x > W+20 || y < -20 || y > H+20) continue;
      const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2);
      const m=new T.Matrix4().compose(new T.Vector3(x,H-y,1.9+layer),q,new T.Vector3(4.25,1.2,4.25));
      add(r.geometries.cap,material,m);
    }
  }
  for (const [geometry,byMaterial] of batches) for (const [material,matrices] of byMaterial) {
    const mesh=new T.InstancedMesh(geometry,material,matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m)); mesh.instanceMatrix.needsUpdate=true;
    mesh.frustumCulled=false; projection.add(mesh);
  }
  return {group,spanCount,portalCount};
}

function drawMetroThree() {
  if (!window.WaterThreeLib || metroThreeUnavailable) return false;
  const lines=G.lines.filter(line=>!(editing && editing.line===line && !editing.isInsert));
  if (!lines.length) { if (metroThreeRenderer) metroThreeRenderer.canvas.hidden=true; return true; }
  if (!metroThreeRenderer) {
    metroThreeRenderer=createMetroThreeRenderer();
    if (!metroThreeRenderer) { metroThreeUnavailable=true; return false; }
  }
  const r=metroThreeRenderer;
  try {
    if (r.gl.isContextLost()) { r.canvas.hidden=true; return false; }
    const key=JSON.stringify([W,H,DPR,G.mapId,G.camera && [G.camera.cx,G.camera.cy,G.camera.zoom,G.camera.baseZoom],
      lines.map(line=>[line.color,line.loop,line.stations.map(st=>[st.nx,st.ny,st.gfLon,st.gfLat])])]);
    if (key!==r.key) {
      if (r.width!==W || r.height!==H || r.dpr!==DPR) {
        r.width=W; r.height=H; r.dpr=DPR;
        r.camera.left=0; r.camera.right=W; r.camera.top=H; r.camera.bottom=0;
        r.camera.updateProjectionMatrix(); r.camera.updateMatrixWorld();
        r.renderer.setPixelRatio(Math.min(DPR,1.5)); r.renderer.setSize(W,H,false);
        r.canvas.style.width=W+'px'; r.canvas.style.height=H+'px';
      }
      const built=buildMetroThreeGroup(r,lines);
      if (r.group) { r.scene.remove(r.group); disposeMetroThreeGroup(r.group); }
      r.group=built.group; r.scene.add(r.group); r.spanCount=built.spanCount; r.portalCount=built.portalCount;
      r.renderer.render(r.scene,r.camera); r.key=key;
    }
    if (r.canvas.hidden) r.canvas.hidden=false;
    return true;
  } catch (error) {
    r.canvas.hidden=true; metroThreeRenderer=null; metroThreeUnavailable=true; disposeMetroThree(r);
    console.warn('线路三维图层不可用，使用 Canvas 降级',error); return false;
  }
}
