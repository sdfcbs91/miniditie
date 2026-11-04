'use strict';
// 可选：先启动 scripts/preview.py，设置 CHROME_PATH 并提供 puppeteer-core。
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const puppeteer=require('puppeteer-core');
const executablePath=process.env.CHROME_PATH;
if (!executablePath) throw Error('请设置 CHROME_PATH 指向 Chromium/Chrome');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const url=process.env.PREVIEW_URL || 'http://127.0.0.1:8000/';
(async()=>{
  const browser=await puppeteer.launch({executablePath,headless:true,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    for (const mode of ['normal','no-webgl2','no-webgl','file']) {
      const page=await browser.newPage(), errors=[], requests=[];
      await page.setViewport({width:800,height:600,deviceScaleFactor:1});
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error' || (message.type()==='warn' && message.text().includes('线路三维'))) errors.push(message.text());});
      page.on('request',request=>requests.push(request.url()));
      if(mode==='no-webgl2' || mode==='no-webgl') await page.evaluateOnNewDocument(disableAll=>{
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2' || (disableAll && (type==='webgl' || type==='experimental-webgl')) ? null : original.call(this,type,...args);};
      },mode==='no-webgl');
      await page.goto(mode==='file'?pathToFileURL(path.resolve(__dirname,'../index.html')).href:url,{waitUntil:'load'});
      await page.evaluate(()=>{
        startGame('newyork'); G.paused=true; G.t=10;
        const station=(id,nx,ny,shape)=>({id,nx,ny,shape,passengers:[],cap:6,oc:0,born:0,spawnT:999});
        const a=station(101,.05,.5,'circle'), b=station(102,.9,.5,'square');
        G.stations=[a,b]; G.lines=[{id:200,color:'#dc493a',stations:[a,b],loop:false,trains:[],carriages:0}]; render();
      });
      await wait(500);
      const state=await page.evaluate(()=>({count:segCrossCount(G.stations[0],G.stations[1]),
        spans:metroTunnelSpans(G.stations[0],G.stations[1]),three:!!metroThreeRenderer,
        unavailable:metroThreeUnavailable,visible:!document.getElementById('metroThreeSurface').hidden,
        pointerEvents:getComputedStyle(document.getElementById('metroThreeSurface')).pointerEvents,
        meshSpans:metroThreeRenderer?.spanCount,portals:metroThreeRenderer?.portalCount,error:metroThreeRenderer?.gl.getError()}));
      assert.equal(state.count,2); assert.equal(state.spans.length,2);
      assert(state.spans.every(s=>s.start<s.t && s.t<s.end)); assert.equal(state.pointerEvents,'none');
      if(mode==='no-webgl2' || mode==='no-webgl') assert(!state.three && state.unavailable && !state.visible);
      else {
        assert(state.three && state.visible && state.meshSpans===2 && state.portals===4 && state.error===0,JSON.stringify(state));
        const pixels=await page.evaluate(()=>{
          const r=metroThreeRenderer,gl=r.gl; r.renderer.render(r.scene,r.camera);
          const out=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
          gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,out);
          let nonzero=0,zero=0; for(let i=3;i<out.length;i+=4) out[i] ? nonzero++ : zero++;
          return {nonzero,zero,error:gl.getError()};
        });
        assert(pixels.nonzero>1000 && pixels.zero>10000 && pixels.error===0,JSON.stringify(pixels));
      }
      if(mode==='file') assert(!requests.some(request=>/^https?:/i.test(request)),'file:// 不应联网');
      if(mode==='normal') {
        const stateChange=await page.evaluate(()=>{
          const line=G.lines[0], c={id:103,nx:.9,ny:.75,shape:'triangle',passengers:[],cap:6,oc:0,born:0};
          G.stations.push(c); line.stations.push(c); line.loop=true; render();
          const loop={count:crossingsOf(line.stations,true),spans:metroThreeRenderer.spanCount};
          editing={line,isInsert:false}; drawMetroThree(); const hidden=metroThreeRenderer.canvas.hidden;
          editing={line,isInsert:true,insertIdx:1,cursor:{x:0,y:0},hover:null,invalid:false}; drawMetroThree();
          const insertionVisible=!metroThreeRenderer.canvas.hidden;
          editing=null; G.lines=[]; render(); const emptyHidden=metroThreeRenderer.canvas.hidden;
          G.lines=[line]; line.stations.pop(); line.loop=false; render();
          return {loop,hidden,insertionVisible,emptyHidden,restored:!metroThreeRenderer.canvas.hidden,err:metroThreeRenderer.gl.getError()};
        });
        assert.equal(stateChange.loop.count,4); assert.equal(stateChange.loop.spans,4);
        assert(stateChange.hidden && stateChange.insertionVisible && stateChange.emptyHidden && stateChange.restored && stateChange.err===0);
        const beforeTrain=await page.evaluate(()=>{const line=G.lines[0]; updateMeta(line); addTrain(line);
          G.paused=false; G.running=true; G.modal=false; G.stationTimer=999; return {d:line.trains[0].d,key:metroThreeRenderer.key};});
        await wait(900);
        const afterTrain=await page.evaluate(()=>{const line=G.lines[0], result={d:line.trains[0].d,key:metroThreeRenderer.key};
          G.paused=true; line.trains=[]; return result;});
        assert(afterTrain.d>beforeTrain.d && afterTrain.key===beforeTrain.key, '列车应沿原路线运行，不应每帧重建线路');
        for(let i=0;i<2;i++) {
          await page.evaluate(()=>{window.testMetroLoss=metroThreeRenderer.gl.getExtension('WEBGL_lose_context');
            if(!window.testMetroLoss) throw Error('缺少 WEBGL_lose_context'); window.testMetroLoss.loseContext();});
          await wait(800);
          assert(await page.evaluate(()=>metroThreeUnavailable && !metroThreeRenderer && document.getElementById('metroThreeSurface').hidden));
          await page.evaluate(()=>window.testMetroLoss.restoreContext()); await wait(1200);
          assert(await page.evaluate(()=>!!metroThreeRenderer && !metroThreeUnavailable && !metroThreeRenderer.canvas.hidden &&
            metroThreeRenderer.spanCount===2 && metroThreeRenderer.portalCount===4 && metroThreeRenderer.gl.getError()===0));
        }
      }
      assert.deepEqual(errors,[]);
      console.log('PASS 立体线路与隧道',mode,JSON.stringify(state));
      await page.close();
    }
    // 广佛真实中心线的交点：缩放仍在原河道，独立水效后期不会清除线路图层。
    const page=await browser.newPage(), errors=[];
    await page.setViewport({width:1000,height:700,deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error' || (message.type()==='warn' && message.text().includes('线路三维'))) errors.push(message.text());});
    await page.goto(url,{waitUntil:'load'});
    const geo=await page.evaluate(()=>{
      G.paused=true; G.t=10; let choice;
      for(const path of guangfoProjectedWater()) {
        for(let i=1;i<path.length;i++) {
          const p=path[i-1],q=path[i],x=(p.x+q.x)/2,y=(p.y+q.y)/2,len=Math.hypot(q.x-p.x,q.y-p.y);
          if(x>250 && x<W-250 && y>200 && y<H-200 && len>2) {choice={x,y,nx:-(q.y-p.y)/len,ny:(q.x-p.x)/len};break;}
        }
        if(choice) break;
      }
      if(!choice) throw Error('无法找到视口中的广佛河流');
      const station=(d,id,shape)=>{const x=choice.x+choice.nx*d,y=choice.y+choice.ny*d,g=earthUnproject(x,y);
        return {id,shape,nx:x/W,ny:y/H,gfLon:g.lon,gfLat:g.lat,passengers:[],cap:6,oc:0,born:0};};
      const a=station(-140,101,'circle'),b=station(140,102,'square');
      G.stations=[a,b]; G.lines=[{id:200,color:'#dc493a',stations:[a,b],loop:false,trains:[],carriages:0}]; render();
      const before={hits:segCrossCount(a,b),spans:metroThreeRenderer.spanCount,key:metroThreeRenderer.key};
      earthZoomAt(G.camera.zoom+1,choice.x,choice.y); render();
      const after={hits:segCrossCount(a,b),spans:metroThreeRenderer.spanCount,key:metroThreeRenderer.key,error:metroThreeRenderer.gl.getError()};
      earthZoomAt(19,choice.x,choice.y); render();
      const extreme={hits:segCrossCount(a,b),spans:metroThreeRenderer.spanCount,error:metroThreeRenderer.gl.getError()};
      return {before,after,extreme};
    });
    assert(geo.before.hits>0 && geo.before.spans===geo.before.hits);
    assert(geo.after.hits===geo.before.hits && geo.after.spans===geo.after.hits && geo.after.key!==geo.before.key && geo.after.error===0);
    assert(geo.extreme.hits===geo.before.hits && geo.extreme.spans>0 && geo.extreme.error===0);
    await page.click('#waterQuality'); await wait(1000);
    assert(await page.evaluate(()=>waterThreeEnhanced && !!metroThreeRenderer && !metroThreeRenderer.canvas.hidden && metroThreeRenderer.gl.getError()===0));
    assert.deepEqual(errors,[]); console.log('PASS 广佛河流交点、缩放和增强水效'); await page.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
