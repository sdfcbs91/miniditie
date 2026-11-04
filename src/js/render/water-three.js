/* Three.js 水面增强层：标准模式使用 PMREM，增强模式额外启用 CSM 与 N8AO。 */
'use strict';
let waterThreeRenderer = null;
let waterThreeUnavailable = false;
let waterThreeEnhanced = false;

function toggleWaterThreeQuality() {
  if (!window.WaterThreeLib || waterThreeUnavailable) { toast('此设备无法启用增强水效，已使用兼容模式'); return; }
  waterThreeEnhanced = !waterThreeEnhanced;
  el('waterQuality').textContent = waterThreeEnhanced ? '水效✓' : '水效+';
  el('waterQuality').setAttribute('aria-pressed', String(waterThreeEnhanced));
  toast(waterThreeEnhanced ? '增强水效：环境反射、环境遮蔽与阴影' : '标准水效：保留环境反射');
}

// N8AO 1.10 的 Pass.dispose 为空；显式释放它持有的渲染目标与材质。
function disposeWaterThreeAO(ao) {
  if (!ao) return;
  for (const key of ['beautyRenderTarget','writeTargetInternal','readTargetInternal','accumulationRenderTarget',
    'depthDownsampleTarget','transparencyRenderTargetDWFalse','transparencyRenderTargetDWTrue','bluenoise',
    'accumulationQuad','depthDownsampleQuad','depthCopyPass','effectShaderQuad','poissonBlurQuad','effectCompositerQuad']) {
    if (ao[key] && ao[key].dispose) ao[key].dispose();
  }
}

function disposeWaterThree(r) {
  if (!r) return;
  try {
    r.csm.remove(); r.csm.dispose();
    for (const light of r.csm.lights) light.shadow.dispose();
    for (const mesh of [r.bank,r.water,r.foam]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    r.envTarget.dispose();
    if (r.composer) r.composer.dispose();
    disposeWaterThreeAO(r.ao);
    r.renderer.dispose();
  } catch (error) { console.warn('水效资源清理失败',error); }
}

function disableWaterThreeEnhanced(r) {
  waterThreeEnhanced=false; r.quality=false;
  const button=document.getElementById('waterQuality');
  if (button) { button.textContent='水效+'; button.setAttribute('aria-pressed','false'); }
  r.renderer.shadowMap.enabled=false;
  r.bank.material.needsUpdate=true; r.water.material.needsUpdate=true;
  if (r.composer) r.composer.dispose();
  disposeWaterThreeAO(r.ao);
  r.composer=null; r.ao=null;
  toast('增强水效不可用，已恢复标准水效');
}

function createWaterThreeRenderer() {
  const bundle = window.WaterThreeLib;
  if (!bundle) return null;
  const canvas = document.getElementById('waterThreeSurface');
  if (!canvas) return null;
  let gl;
  try { gl=canvas.getContext('webgl2', {alpha:true, antialias:true, premultipliedAlpha:true, preserveDrawingBuffer:false}); }
  catch (_) { return null; }
  if (!gl) return null;
  let renderer;
  try {
    const T=bundle.THREE;
    renderer=new T.WebGLRenderer({canvas, context:gl, alpha:true, antialias:true});
    renderer.setClearColor(0x000000,0); renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.shadowMap.type=T.PCFSoftShadowMap;
    const scene=new T.Scene();
    const camera=new T.OrthographicCamera(0,1,1,0,.1,1500);
    camera.position.set(0,0,500); camera.lookAt(0,0,0); camera.updateMatrixWorld();
    scene.add(new T.HemisphereLight(0xe9f4ed,0x728b74,1.05));

    // 本地程序化天空，生成 PMREM 环境贴图，不下载任何纹理。
    const skyCanvas=document.createElement('canvas'); skyCanvas.width=256; skyCanvas.height=128;
    const sky=skyCanvas.getContext('2d'), gradient=sky.createLinearGradient(0,0,0,128);
    gradient.addColorStop(0,'#91bbce'); gradient.addColorStop(.48,'#e9f2df'); gradient.addColorStop(1,'#749d85');
    sky.fillStyle=gradient; sky.fillRect(0,0,256,128);
    const texture=new T.CanvasTexture(skyCanvas); texture.mapping=T.EquirectangularReflectionMapping; texture.colorSpace=T.SRGBColorSpace;
    const generator=new T.PMREMGenerator(renderer);
    const envTarget=generator.fromEquirectangular(texture); texture.dispose(); generator.dispose();
    scene.environment=envTarget.texture;

    const csm=new bundle.CSM({camera,parent:scene,cascades:2,maxFar:1000,mode:'practical',
      shadowMapSize:512,lightDirection:new T.Vector3(-.4,.7,-1).normalize(),lightIntensity:.65,lightFar:1800,lightMargin:120});
    const bankMaterial=new T.MeshStandardMaterial({color:0x97aa90,roughness:.96,side:T.DoubleSide});
    const uniforms={time:{value:0},wave:{value:1}};
    const waterMaterial=new T.MeshStandardMaterial({color:0x82c1c9,metalness:.24,roughness:.26,envMapIntensity:1.15,side:T.DoubleSide});
    const foamMaterial=new T.MeshBasicMaterial({color:0xecfaf4,transparent:true,opacity:.4,depthWrite:false,side:T.DoubleSide});
    csm.setupMaterial(bankMaterial); csm.setupMaterial(waterMaterial);
    // 保留 CSM 插入的 uniforms，同时为物理水面材质注入位移、法线和深浅颜色。
    const csmWaterCompile=waterMaterial.onBeforeCompile;
    waterMaterial.onBeforeCompile=(shader, rendererForCompile) => {
      csmWaterCompile(shader,rendererForCompile);
      shader.uniforms.uWaterTime=uniforms.time; shader.uniforms.uWaterWave=uniforms.wave;
      shader.vertexShader=shader.vertexShader.replace('#include <common>', `#include <common>
        attribute vec2 aWaterFlow;
        attribute vec2 aWaterTangent;
        uniform float uWaterTime;
        uniform float uWaterWave;
        varying vec2 vWaterFlow;
        float waterWave(vec2 p) {
          return 1.15*sin(p.x*.10-uWaterTime*1.35+p.y*2.1)
               + .50*sin(p.x*.20+p.y*4.2+uWaterTime*.85)
               + .25*sin(p.x*.30-p.y*1.7-uWaterTime*.60);
        }`);
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float waveFade=1.0-smoothstep(.65,1.0,abs(aWaterFlow.y));
        float gradX=(waterWave(aWaterFlow+vec2(.5,0.0))-waterWave(aWaterFlow-vec2(.5,0.0)))*.5;
        float gradY=(waterWave(aWaterFlow+vec2(0.0,.02))-waterWave(aWaterFlow-vec2(0.0,.02)))/.04;
        vec2 tangent=normalize(aWaterTangent);
        vec2 side=vec2(-tangent.y,tangent.x);
        objectNormal=normalize(vec3((-tangent*gradX-side*gradY*.12)*waveFade*uWaterWave,1.0));`);
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float elevation=waterWave(aWaterFlow)*waveFade*uWaterWave;
        transformed+=vec3(-.38,.80,1.0)*elevation;
        vWaterFlow=aWaterFlow;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vWaterFlow;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float shallow=smoothstep(.12,1.0,abs(vWaterFlow.y));
        diffuseColor.rgb *= mix(vec3(.57,.80,.88),vec3(.90,1.0,.92),shallow*.8);`);
    };
    const bank=new T.Mesh(new T.BufferGeometry(),bankMaterial), water=new T.Mesh(new T.BufferGeometry(),waterMaterial), foam=new T.Mesh(new T.BufferGeometry(),foamMaterial);
    bank.frustumCulled=water.frustumCulled=foam.frustumCulled=false;
    bank.castShadow=true; bank.receiveShadow=true; water.receiveShadow=true;
    bank.renderOrder=0; water.renderOrder=1; foam.renderOrder=2;
    scene.add(bank,water,foam);
    const out={canvas,gl,renderer,scene,camera,csm,envTarget,bank,water,foam,uniforms,key:'',lastDraw:null,
      composer:null,ao:null,quality:null,detailed:false,bankCount:0,waterCount:0,foamCount:0};
    if (!canvas.waterThreeEventsBound) {
      canvas.waterThreeEventsBound=true;
      canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault(); canvas.hidden=true;
        const previous=waterThreeRenderer; waterThreeRenderer=null; waterThreeUnavailable=true;
        disposeWaterThree(previous);
      });
      canvas.addEventListener('webglcontextrestored', () => { waterThreeRenderer=null; waterThreeUnavailable=false; });
    }
    return out;
  } catch (error) {
    if (renderer) renderer.dispose();
    canvas.hidden=true;
    console.warn('Three.js 水面初始化失败，使用兼容渲染',error);
    return null;
  }
}

function waterThreeGeometry(mesh, start, count, height, isWater, T) {
  const positions=new Float32Array(count*3), normals=new Float32Array(count*3);
  const flow=new Float32Array(count*2), tangent=new Float32Array(count*2);
  for (let i=0;i<count;i++) {
    const n=(start+i)*9, k=i*3, uv=i*2;
    const x=mesh.vertices[n], y=mesh.vertices[n+1], z=mesh.vertices[n+2];
    positions[k]=x-.38*z; positions[k+1]=height-y+.80*z; positions[k+2]=z;
    normals[k]=isWater ? 0 : mesh.vertices[n+3]; normals[k+1]=isWater ? 0 : -mesh.vertices[n+4]; normals[k+2]=isWater ? 1 : mesh.vertices[n+5];
    flow[uv]=mesh.vertices[n+6]; flow[uv+1]=mesh.vertices[n+7];
    tangent[uv]=mesh.vertices[n+3]; tangent[uv+1]=-mesh.vertices[n+4];
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.BufferAttribute(normals,3));
  geometry.setAttribute('aWaterFlow',new T.BufferAttribute(flow,2));
  geometry.setAttribute('aWaterTangent',new T.BufferAttribute(tangent,2));
  return geometry;
}

function drawWaterThree() {
  if (!window.WaterThreeLib || waterThreeUnavailable) return false;
  if (!waterThreeRenderer) {
    waterThreeRenderer=createWaterThreeRenderer();
    if (!waterThreeRenderer) { waterThreeUnavailable=true; return false; }
  }
  const r=waterThreeRenderer, T=window.WaterThreeLib.THREE;
  try {
    if (r.gl.isContextLost()) { r.canvas.hidden=true; return false; }
    const key=[G.mapId,W,H,DPR,G.camera && G.camera.cx,G.camera && G.camera.cy,G.camera && G.camera.zoom,G.camera && G.camera.baseZoom].join(',');
    const changed=key!==r.key, qualityChanged=r.quality!==waterThreeEnhanced;
    if (changed) {
      const detailed=!isGuangfoWater() || guangfoWaterWidth()>=10;
      const mesh=buildWater3dMesh(water3dPaths(detailed),detailed);
      const old=[r.bank.geometry,r.water.geometry,r.foam.geometry];
      r.bank.geometry=waterThreeGeometry(mesh,0,mesh.bankCount,H,false,T);
      r.water.geometry=waterThreeGeometry(mesh,mesh.bankCount,mesh.waterCount,H,true,T);
      r.foam.geometry=waterThreeGeometry(mesh,mesh.bankCount+mesh.waterCount,mesh.foamCount,H,true,T);
      for (const geometry of old) geometry.dispose();
      r.bankCount=mesh.bankCount; r.waterCount=mesh.waterCount; r.foamCount=mesh.foamCount; r.detailed=detailed;
      r.camera.left=0; r.camera.right=W; r.camera.top=H; r.camera.bottom=0; r.camera.updateProjectionMatrix(); r.camera.updateMatrixWorld();
      r.csm.updateFrustums();
      r.renderer.setPixelRatio(Math.min(DPR,1.5)); r.renderer.setSize(W,H,false);
      r.canvas.style.width=W+'px'; r.canvas.style.height=H+'px';
      if (r.composer) { r.composer.setPixelRatio(Math.min(DPR,1.5)); r.composer.setSize(W,H); }
      r.key=key;
    }
    if (qualityChanged) {
      if (waterThreeEnhanced && !r.composer) {
        try {
          const bundle=window.WaterThreeLib;
          r.composer=new bundle.EffectComposer(r.renderer);
          r.ao=new bundle.N8AOPass(r.scene,r.camera,W,H);
          r.ao.setQualityMode('Performance'); r.ao.configuration.halfRes=true;
          r.ao.configuration.screenSpaceRadius=true; r.ao.configuration.aoRadius=24;
          r.ao.configuration.distanceFalloff=.3; r.ao.configuration.intensity=2;
          r.ao.configuration.transparencyAware=true;
          r.composer.addPass(r.ao); r.composer.setPixelRatio(Math.min(DPR,1.5)); r.composer.setSize(W,H);
        } catch (error) { console.warn('增强水效初始化失败',error); disableWaterThreeEnhanced(r); }
      }
      r.renderer.shadowMap.enabled=waterThreeEnhanced; r.bank.material.needsUpdate=true; r.water.material.needsUpdate=true;
      r.quality=waterThreeEnhanced;
    }
    const now=performance.now(), time=G.t || 0;
    if (!changed && !qualityChanged && r.lastDraw != null && (time===r.lastTime || now-r.lastDraw<33)) return true;
    r.uniforms.time.value=time; r.uniforms.wave.value=r.detailed ? 1 : 0;
    if (waterThreeEnhanced) {
      try { r.csm.update(); r.composer.render(); }
      catch (error) { console.warn('增强水效渲染失败',error); disableWaterThreeEnhanced(r); r.renderer.render(r.scene,r.camera); }
    } else r.renderer.render(r.scene,r.camera);
    if (r.canvas.hidden) r.canvas.hidden=false;
    r.lastDraw=now; r.lastTime=time;
    return true;
  } catch (error) {
    r.canvas.hidden=true; waterThreeRenderer=null; waterThreeUnavailable=true; disposeWaterThree(r);
    console.warn('Three.js 水面不可用，切换兼容渲染',error);
    return false;
  }
}
