'use strict';
// 可选真实浏览器回归：先启动 scripts/preview.py；见 README 的运行说明。
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const puppeteer = require('puppeteer-core');
const executablePath = process.env.CHROME_PATH;
if (!executablePath) throw Error('请设置 CHROME_PATH 指向 Chromium/Chrome');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8000/';
(async () => {
  const browser = await puppeteer.launch({executablePath, headless:true,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    for (const mode of ['normal','no-webgl2','no-webgl','file']) {
      const page=await browser.newPage(), errors=[], requests=[];
      await page.setViewport({width:390,height:844,deviceScaleFactor:1});
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type()==='error') errors.push(message.text()); });
      page.on('request', request => requests.push(request.url()));
      if (mode==='no-webgl2' || mode==='no-webgl') await page.evaluateOnNewDocument(disableAll => {
        const getContext=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args) {
          if (type==='webgl2' || (disableAll && (type==='webgl' || type==='experimental-webgl'))) return null;
          return getContext.call(this,type,...args);
        };
      },mode==='no-webgl');
      const address=mode==='file' ? pathToFileURL(path.resolve(__dirname,'../index.html')).href : url;
      await page.goto(address,{waitUntil:'load'});
      if (mode==='file') await page.evaluate(() => startGame('newyork'));
      await wait(1500);
      const state=await page.evaluate(() => ({three:!!waterThreeRenderer,raw:!!water3dRenderer,
        threeVisible:!document.getElementById('waterThreeSurface').hidden,
        rawVisible:!document.getElementById('waterSurface').hidden}));
      if (mode==='no-webgl2') assert(!state.three && state.raw && state.rawVisible && !state.threeVisible);
      else if (mode==='no-webgl') assert(!state.three && !state.raw && !state.threeVisible && !state.rawVisible);
      else assert(state.three && state.threeVisible && !state.rawVisible);
      if (mode==='file') assert(!requests.some(request => /^https?:/i.test(request)), 'file:// 模式不得联网');
      else assert(!requests.some(request => /^https?:/i.test(request) && new URL(request).origin!==new URL(url).origin), '出现外部网络请求');
      if (mode==='normal') {
        await page.click('#waterQuality'); await wait(1500);
        const high=await page.evaluate(() => {
          const r=waterThreeRenderer; r.csm.update(); r.composer.render();
          const gl=r.gl, pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
          gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          let opaque=0, transparent=0;
          for (let i=3;i<pixels.length;i+=4) pixels[i] ? opaque++ : transparent++;
          return {enhanced:waterThreeEnhanced,env:!!r.scene.environment,ao:!!r.ao,
            shadowMaps:r.csm.lights.map(light=>!!light.shadow.map),opaque,transparent,error:gl.getError()};
        });
        assert(high.enhanced && high.env && high.ao && high.shadowMaps.every(Boolean));
        assert(high.opaque>100 && high.transparent>10000 && high.error===0, JSON.stringify(high));
        await page.click('#earthHome'); await wait(700);
        const overview=await page.evaluate(() => ({detailed:waterThreeRenderer.detailed,foam:waterThreeRenderer.foamCount}));
        assert(!overview.detailed && overview.foam===0);
        await page.click('#earthClose'); await wait(700);
        // 两次上下文丢失和恢复，检查回退画布、重新启用的增强画质与 GL 错误。
        for (let i=0;i<2;i++) {
          await page.evaluate(() => { window.testLoseContext=waterThreeRenderer.gl.getExtension('WEBGL_lose_context');
            if (!window.testLoseContext) throw Error('缺少 WEBGL_lose_context'); window.testLoseContext.loseContext(); });
          await wait(800);
          assert(await page.evaluate(() => waterThreeUnavailable && !!water3dRenderer && !water3dRenderer.canvas.hidden));
          await page.evaluate(() => window.testLoseContext.restoreContext()); await wait(1800);
          assert(await page.evaluate(() => !!waterThreeRenderer && !waterThreeUnavailable && !waterThreeRenderer.canvas.hidden &&
            water3dRenderer.canvas.hidden && waterThreeEnhanced && waterThreeRenderer.gl.getError()===0));
        }
      }
      assert.deepEqual(errors,[]);
      console.log('PASS Three.js 水面',mode,JSON.stringify(state));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
