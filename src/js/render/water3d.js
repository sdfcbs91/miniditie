/* WebGL 河流：几何岸壁 + 动态水面着色器；主画布及交互仍为 Canvas 2D。 */
'use strict';

let water3dRenderer = null;
let water3dUnavailable = false;

function createWater3dRenderer() {
  try {
    const canvas = document.getElementById('waterSurface');
    if (!canvas) return null;
    const gl = canvas.getContext('webgl', {alpha:true, antialias:true, premultipliedAlpha:true, preserveDrawingBuffer:false});
    if (!gl) return null;
    const vertexSource = `
      attribute vec3 a_position;
      attribute vec3 a_normal;
      attribute vec2 a_flow;
      attribute float a_material;
      uniform vec2 u_size;
      uniform float u_time;
      uniform float u_wave;
      varying vec3 v_normal;
      varying vec2 v_flow;
      varying float v_material;
      float waveField(vec2 p) {
        return 1.15 * sin(p.x * 0.10 - u_time * 1.35 + p.y * 2.1)
             + 0.50 * sin(p.x * 0.20 + p.y * 4.2 + u_time * 0.85)
             + 0.25 * sin(p.x * 0.30 - p.y * 1.7 - u_time * 0.60);
      }
      void main() {
        vec3 position = a_position;
        v_normal = a_normal;
        if (a_material > 0.5 && a_material < 1.5) {
          // 水面顶点高度随三组波动变化；岸线保持零位移以衔接岸坡。
          float fade = 1.0 - smoothstep(0.65, 1.0, abs(a_flow.y));
          position.z += waveField(a_flow) * fade * u_wave;
          // 从波高场有限差分恢复切线空间法线，再变回地图投影空间。
          float dx = (waveField(a_flow + vec2(0.5, 0.0)) - waveField(a_flow - vec2(0.5, 0.0))) * 0.5;
          float dy = (waveField(a_flow + vec2(0.0, 0.02)) - waveField(a_flow - vec2(0.0, 0.02))) / 0.04;
          vec2 tangent = normalize(a_normal.xy);
          vec2 side = vec2(-tangent.y, tangent.x);
          v_normal = normalize(vec3((-tangent * dx - side * dy * 0.12) * fade * u_wave, 1.0));
        }
        // 正交斜投影；原水边中心线 z=0，仍与站点和隧道判定对齐。
        vec2 p = position.xy + vec2(-0.38, -0.80) * position.z;
        gl_Position = vec4(p.x / u_size.x * 2.0 - 1.0, 1.0 - p.y / u_size.y * 2.0, 0.0, 1.0);
        v_flow = a_flow; v_material = a_material;
      }`;
    const fragmentSource = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      varying vec3 v_normal;
      varying vec2 v_flow;
      varying float v_material;
      uniform float u_time;
      uniform float u_wave;
      void main() {
        vec3 light = normalize(vec3(-0.40, -0.48, 0.78));
        if (v_material < 0.5) {
          vec3 normal = normalize(v_normal);
          float diffuse = max(dot(normal, light), 0.0);
          // 岸水交界的便宜局部遮蔽，不是场景级 SSAO。
          float ao = 1.0 - 0.16 * smoothstep(0.30, 1.0, v_flow.y);
          gl_FragColor = vec4(vec3(0.60, 0.68, 0.58) * (0.83 + 0.22 * diffuse) * ao, 1.0);
        } else if (v_material > 1.5) {
          float fleck = 0.5 + 0.5 * sin(v_flow.x * 0.20 - u_time * 1.4);
          gl_FragColor = vec4(0.89, 0.97, 0.92, 0.20 + 0.25 * fleck);
        } else {
          vec3 normal = normalize(v_normal);
          vec3 eye = normalize(vec3(-0.38, -0.80, 1.0));
          float diffuse = max(dot(normal, light), 0.0);
          float fresnel = pow(1.0 - clamp(dot(normal, eye), 0.0, 1.0), 3.0);
          float specular = pow(max(dot(reflect(-light, normal), eye), 0.0), 20.0);
          float a = v_flow.x * 0.10 - u_time * 1.35 + v_flow.y * 2.1;
          float b = v_flow.x * 0.20 + v_flow.y * 4.2 + u_time * 0.85;
          float glint = pow(max(0.0, 0.5 + 0.5 * sin(a + sin(b) * 0.4)), 9.0) * u_wave;
          // 中央深、岸边浅：仅为视觉假设，不代表真实河床高程。
          float shallow = smoothstep(0.12, 1.0, abs(v_flow.y));
          vec3 deepWater = vec3(0.34, 0.63, 0.69), shallowWater = vec3(0.59, 0.81, 0.80);
          vec3 base = mix(deepWater, shallowWater, shallow * 0.8);
          vec3 sky = vec3(0.78, 0.89, 0.91);
          vec3 color = mix(base * (0.86 + 0.22 * diffuse), sky, fresnel * 0.9);
          color += vec3(0.18, 0.20, 0.19) * specular + vec3(0.08, 0.09, 0.08) * glint;
          gl_FragColor = vec4(color, 1.0);
        }
      }`;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertexSource), fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
    const buffer = gl.createBuffer();
    if (!buffer) return null;
    const renderer = {canvas, gl, program, buffer, key:'', bankCount:0, waterCount:0,
      position:gl.getAttribLocation(program,'a_position'), normal:gl.getAttribLocation(program,'a_normal'),
      flow:gl.getAttribLocation(program,'a_flow'), material:gl.getAttribLocation(program,'a_material'),
      size:gl.getUniformLocation(program,'u_size'), time:gl.getUniformLocation(program,'u_time'), wave:gl.getUniformLocation(program,'u_wave')};
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); canvas.hidden = true; water3dRenderer = null; water3dUnavailable = true; });
    canvas.addEventListener('webglcontextrestored', () => { water3dRenderer = null; water3dUnavailable = false; });
    return renderer;
  } catch (_) { return null; }
}

// 按原河流中心线构造带斜坡的 3D 横截面。使用斜接连接，避免急弯产生无限长尖刺。
function buildWater3dMesh(paths, detailed = true) {
  const banks = [], water = [], foam = [];
  const put = (out, p, normal, u, v, material) => out.push(p.x, p.y, p.z, normal.x, normal.y, normal.z, u, v, material);
  const triangle = (out, a, b, c, normal, uvA, uvB, uvC, material) => {
    put(out,a,normal,uvA[0],uvA[1],material); put(out,b,normal,uvB[0],uvB[1],material); put(out,c,normal,uvC[0],uvC[1],material);
  };
  const quad = (out, a, b, c, d, normal, u0, u1, v0, v1, material) => {
    triangle(out,a,b,c,normal,[u0,v0],[u0,v1],[u1,v1],material);
    triangle(out,a,c,d,normal,[u0,v0],[u1,v1],[u1,v0],material);
  };
  const blendPoint=(a,b,t) => ({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t});
  for (const path of paths) {
    const points = [];
    for (const p of path.points) if (!points.length || Math.hypot(p.x-points[points.length-1].x, p.y-points[points.length-1].y) > .001) points.push(p);
    if (points.length < 2) continue;
    const half = path.width / 2, rim = Math.max(2, Math.min(9, path.width * .27));
    const height = Math.max(3, Math.min(12, path.width * .5));
    const normals = [];
    for (let i=1; i<points.length; i++) {
      const dx=points[i].x-points[i-1].x, dy=points[i].y-points[i-1].y, length=Math.hypot(dx,dy);
      normals.push({x:-dy/length, y:dx/length});
    }
    const sides = points.map((p,i) => {
      const a=normals[Math.max(0,i-1)], b=normals[Math.min(normals.length-1,i)];
      let mx=a.x+b.x, my=a.y+b.y, len=Math.hypot(mx,my);
      if (len < 1e-5) { mx=b.x; my=b.y; len=1; }
      mx/=len; my/=len;
      const multiplier=Math.min(2, 1/Math.max(.5, mx*b.x+my*b.y));
      // 宽度 <= 原判定宽度；变化仅是游戏化河宽，不代表实测。
      const t=i/(points.length-1), width=half*(.88+.12*Math.sin(t*Math.PI*4));
      const offset = (distance,z) => ({x:p.x+mx*distance*multiplier, y:p.y+my*distance*multiplier, z});
      // 四个截面锚点：左岸、左水边、右水边、右岸。
      return {left:offset(width,0), right:offset(-width,0), outerL:offset(width+rim,height), outerR:offset(-width-rim,height)};
    });
    let distance=0;
    for (let i=1; i<points.length; i++) {
      const length=Math.hypot(points[i].x-points[i-1].x, points[i].y-points[i-1].y);
      const range=waterVisibleRange(points[i-1], points[i], (half+rim)*2+height+2);
      if (range) {
        const sideAt = t => ({left:blendPoint(sides[i-1].left,sides[i].left,t), right:blendPoint(sides[i-1].right,sides[i].right,t),
          outerL:blendPoint(sides[i-1].outerL,sides[i].outerL,t), outerR:blendPoint(sides[i-1].outerR,sides[i].outerR,t)});
        // 近景细分以承载顶点波浪；全图只保留粗网格，无波浪和泡沫。
        const slices=Math.max(1, Math.ceil(length*(range[1]-range[0])/(detailed ? 20 : 90)));
        const n=normals[i-1], tangent={x:n.y,y:-n.x,z:1};
        for (let j=0; j<slices; j++) {
          const t0=range[0]+(range[1]-range[0])*j/slices, t1=range[0]+(range[1]-range[0])*(j+1)/slices;
          const a=sideAt(t0), b=sideAt(t1);
          const u0=(distance+length*t0) % (20*Math.PI), u1=u0+length*(t1-t0);
          quad(banks,a.outerL,a.left,b.left,b.outerL,{x:-n.x,y:-n.y,z:.45},u0,u1,0,1,0);
          quad(banks,a.right,a.outerR,b.outerR,b.right,{x:n.x,y:n.y,z:.45},u0,u1,1,0,0);
          const across=detailed ? 4 : 1;
          for (let k=0; k<across; k++) {
            const v0=k/across, v1=(k+1)/across;
            quad(water,blendPoint(a.left,a.right,v0),blendPoint(a.left,a.right,v1),blendPoint(b.left,b.right,v1),blendPoint(b.left,b.right,v0),tangent,u0,u1,-1+2*v0,-1+2*v1,1);
          }
          if (detailed) {
            // 两条半透明几何窄带，不依赖泡沫贴图。
            quad(foam,a.left,blendPoint(a.left,a.right,.07),blendPoint(b.left,b.right,.07),b.left,tangent,u0,u1,-1,-.86,2);
            quad(foam,blendPoint(a.left,a.right,.93),a.right,b.right,blendPoint(b.left,b.right,.93),tangent,u0,u1,.86,1,2);
          }
        }
      }
      distance+=length;
    }
  }
  return {vertices:new Float32Array(banks.concat(water,foam)), bankCount:banks.length/9, waterCount:water.length/9, foamCount:foam.length/9};
}

function water3dPaths(detailed = true) {
  if (isGuangfoWater()) return guangfoProjectedWater().map(points => ({width:guangfoWaterWidth(),
    points:detailed ? points : points.filter((_,i) => i % 4 === 0 || i === points.length - 1)}));
  return RIVERS.map(r => {
    const horiz=r.axis === 'x', len=horiz ? W : H, points=[];
    for (let u=-20; u<=len+20; u+=8) {
      const c=riverCenterAt(r,u); points.push(horiz ? {x:u,y:c} : {x:c,y:u});
    }
    return {width:riverHalfPx(r)*2, points};
  });
}

// 投影变化时重建并上传网格，正常动画帧只更新时间 uniform；失败时回退 Canvas。
function drawWaterWebGL() {
  if (drawWaterThree()) {
    if (water3dRenderer) water3dRenderer.canvas.hidden = true;
    return true;
  }
  if (water3dUnavailable) return false;
  if (!water3dRenderer) {
    water3dRenderer = createWater3dRenderer();
    if (!water3dRenderer) { water3dUnavailable = true; return false; }
  }
  const r=water3dRenderer, gl=r.gl;
  try {
    if (gl.isContextLost()) { r.canvas.hidden = true; return false; }
    const key=[G.mapId,W,H,DPR,G.camera && G.camera.cx,G.camera && G.camera.cy,G.camera && G.camera.zoom,G.camera && G.camera.baseZoom].join(',');
    const cameraChanged = r.key !== key;
    if (cameraChanged) {
      const detailed=!isGuangfoWater() || guangfoWaterWidth() >= 10;
      const paths=water3dPaths(detailed);
      const mesh=buildWater3dMesh(paths,detailed);
      const waterDpr=Math.min(DPR,1.5); // 控制移动设备的着色开销，主地图与文本仍使用完整 DPR。
      r.canvas.width=Math.max(1,Math.round(W*waterDpr)); r.canvas.height=Math.max(1,Math.round(H*waterDpr));
      r.canvas.style.width=W+'px'; r.canvas.style.height=H+'px';
      gl.bindBuffer(gl.ARRAY_BUFFER,r.buffer); gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
      r.bankCount=mesh.bankCount; r.waterCount=mesh.waterCount; r.foamCount=mesh.foamCount; r.detailed=detailed; r.key=key;
    }
    // 水面最多每秒重绘 30 次；地图或尺寸变化时立即重绘，暂停时复用上一帧。
    const now=performance.now(), time=G.t || 0;
    if (!cameraChanged && r.lastDraw != null && (time === r.lastTime || now - r.lastDraw < 33)) return true;
    gl.viewport(0,0,r.canvas.width,r.canvas.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.useProgram(r.program); gl.bindBuffer(gl.ARRAY_BUFFER,r.buffer);
    for (const [loc,size,offset] of [[r.position,3,0],[r.normal,3,12],[r.flow,2,24],[r.material,1,32]]) {
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,size,gl.FLOAT,false,36,offset);
    }
    gl.uniform2f(r.size,W,H); gl.uniform1f(r.time,time); gl.uniform1f(r.wave,r.detailed ? 1 : 0);
    // 先岸后水，确保河汊汇合处水面覆盖岸壁，不出现分支接缝。
    gl.drawArrays(gl.TRIANGLES,0,r.bankCount); gl.drawArrays(gl.TRIANGLES,r.bankCount,r.waterCount);
    if (r.foamCount) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES,r.bankCount+r.waterCount,r.foamCount);
    }
    if (r.canvas.hidden) r.canvas.hidden=false;
    r.lastDraw=now; r.lastTime=time;
    return true;
  } catch (_) { r.canvas.hidden=true; water3dUnavailable=true; water3dRenderer=null; return false; }
}
