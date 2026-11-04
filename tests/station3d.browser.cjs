'use strict';
// 可选真实浏览器回归：先启动 scripts/preview.py；见 README 的运行说明。
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
    for (const mode of ['normal','no-webgl2','file']) {
      const page=await browser.newPage(), errors=[];
      await page.setViewport({width:800,height:600,deviceScaleFactor:1});
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
      if (mode==='no-webgl2') await page.evaluateOnNewDocument(()=>{
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};
      });
      await page.goto(mode==='file'?pathToFileURL(path.resolve(__dirname,'../index.html')).href:url,{waitUntil:'load'});
      if(mode==='file') await page.evaluate(()=>startGame('newyork'));
      await wait(1000);
      await page.evaluate(()=>{
        G.t=10; G.paused=true; G.lines=[];
        G.stations=['circle','triangle','square','diamond','pentagon','hexagon','star','cross'].map((shape,i)=>({
          id:i+1,shape,nx:(80+i*90)/W,ny:300/H,passengers:[{shape:'circle'},{shape:'triangle'}],cap:6,oc:i===7?.8:0,born:0}));
        render();
      });
      await wait(400);
      const state=await page.evaluate(()=>{
        const r=stationThreeRenderer;
        return {three:!!r,unavailable:stationThreeUnavailable,visible:!document.getElementById('stationThreeSurface').hidden,
          geometryCount:r?.geometries.size,stationCount:r?.stations.size,error:r?.gl.getError(),
          pointerEvents:getComputedStyle(document.getElementById('stationThreeSurface')).pointerEvents};
      });
      assert.equal(state.pointerEvents,'none');
      if(mode==='no-webgl2') assert(!state.three && state.unavailable && !state.visible);
      else {
        assert(state.three && state.visible && state.geometryCount===8 && state.stationCount===8 && state.error===0);
        const pixels=await page.evaluate(()=>{
          const r=stationThreeRenderer, gl=r.gl; r.renderer.render(r.scene,r.camera);
          const buf=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
          gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,buf);
          return Array.from({length:8},(_,i)=>{
            let n=0,x=80+i*90;
            for(let y=280;y<321;y++) for(let k=x-20;k<x+21;k++) if(buf[((600-y)*800+k)*4+3]) n++;
            return n;
          });
        });
        assert(pixels.every(n=>n>40),`站点图层缺少像素：${pixels}`);
      }
      if(mode==='normal') {
        // 暂停状态下增加、修改、删除线路，站点模型必须立即切换并使用实际线路颜色。
        const services=await page.evaluate(()=>{
          const s=G.stations;
          const a={color:'#dc493a',stations:[s[0],s[1]],trains:[],loop:false};
          const b={color:'#2d8fd5',stations:[s[1],s[2]],trains:[],loop:false};
          G.lines=[a,b]; render();
          const snapshot=id=>({colors:stationThreeRenderer.stations.get(id).serviceColors.slice(),
            transfer:stationThreeRenderer.stations.get(id).transfer});
          const initial=[snapshot(1),snapshot(2),snapshot(3),snapshot(4)];
          b.color='#53a548'; render(); const recolored=snapshot(2);
          G.lines=[a]; render(); const removed=snapshot(2), nowUnconnected=snapshot(3);
          G.lines=[]; render();
          return {initial,recolored,removed,nowUnconnected,error:stationThreeRenderer.gl.getError()};
        });
        assert.deepEqual(services.initial,[{colors:['#dc493a'],transfer:false},
          {colors:['#dc493a','#2d8fd5'],transfer:true},{colors:['#2d8fd5'],transfer:false},{colors:[],transfer:false}]);
        assert.deepEqual(services.recolored,{colors:['#dc493a','#53a548'],transfer:true});
        assert.deepEqual(services.removed,{colors:['#dc493a'],transfer:false});
        assert.deepEqual(services.nowUnconnected,{colors:[],transfer:false});
        assert.equal(services.error,0);
        // 车站顶面锚定命中坐标；游戏交互仍由主画布完成。
        assert(await page.evaluate(()=>G.stations.every(st=>stationAt({x:st.nx*W,y:st.ny*H},17)===st)));
        for(let i=0;i<2;i++) {
          await page.evaluate(()=>{window.testStationLoss=stationThreeRenderer.gl.getExtension('WEBGL_lose_context');
            if(!window.testStationLoss) throw Error('缺少 WEBGL_lose_context'); window.testStationLoss.loseContext();});
          await wait(800);
          assert(await page.evaluate(()=>stationThreeUnavailable && !stationThreeRenderer && document.getElementById('stationThreeSurface').hidden));
          await page.evaluate(()=>window.testStationLoss.restoreContext()); await wait(1200);
          assert(await page.evaluate(()=>!!stationThreeRenderer && !stationThreeUnavailable && stationThreeRenderer.stations.size===8 &&
            !stationThreeRenderer.canvas.hidden && stationThreeRenderer.gl.getError()===0));
        }
        await page.evaluate(()=>{G.stations=G.stations.slice(0,2);render();});
        assert.equal(await page.evaluate(()=>stationThreeRenderer.stations.size),2);
      }
      assert.deepEqual(errors,[]);
      console.log('PASS 立体站点',mode,JSON.stringify(state));
      await page.close();
    }
    // 真实拖线：点击建筑边缘建线、形成换乘、删线后恢复单线，Canvas 降级也可操作。
    for (const mode of ['normal','no-webgl2']) {
      const page=await browser.newPage();
      await page.setViewport({width:800,height:600});
      if(mode==='no-webgl2') await page.evaluateOnNewDocument(()=>{
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};
      });
      await page.goto(url,{waitUntil:'load'});
      await page.evaluate(()=>{
        G.t=5; G.lines=[]; G.totalTunnels=30; G.stationTimer=1000;
        G.stations=['circle','triangle','square'].map((shape,i)=>({id:100+i,nx:(180+200*i)/W,ny:300/H,
          shape,passengers:[],cap:6,oc:0,born:0,spawnT:1000})); render();
      });
      const stations=await page.evaluate(()=>G.stations.map(s=>({x:s.nx*W,y:s.ny*H})));
      await page.mouse.move(stations[0].x+16,stations[0].y+3); await page.mouse.down();
      await page.mouse.move(stations[1].x,stations[1].y,{steps:20}); await page.mouse.up(); await wait(300);
      await page.mouse.move(stations[1].x,stations[1].y); await page.mouse.down();
      await page.mouse.move(stations[2].x,stations[2].y,{steps:20}); await page.mouse.up(); await wait(300);
      const connected=await page.evaluate(()=>({lines:G.lines.length,counts:G.stations.map(s=>stationServiceColors(s).length),
        transfer:stationThreeRenderer?.stations.get(101).transfer}));
      assert.equal(connected.lines,2); assert.deepEqual(connected.counts,[1,2,1]);
      if(mode==='normal') assert(connected.transfer);
      const after=await page.evaluate(()=>{deleteLine(G.lines[1]); render();
        return {count:stationServiceColors(G.stations[1]).length,transfer:stationThreeRenderer?.stations.get(101).transfer};});
      assert.equal(after.count,1); if(mode==='normal') assert.equal(after.transfer,false);
      console.log('PASS 真实拖线与换乘',mode);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
