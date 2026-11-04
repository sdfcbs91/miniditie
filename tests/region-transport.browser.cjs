'use strict';
// Optional browser regression: start scripts/preview.py and set CHROME_PATH/NODE_PATH.
const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
(async()=>{
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    for (const [width,height] of [[1200,800],[390,844]]) {
      const page=await browser.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setViewport({width,height,deviceScaleFactor:1,hasTouch:width<500});
      await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8000/',{waitUntil:'load'});
      await page.evaluate(()=>{G.paused=true;});
      await page.click('#guangfoLegend summary');
      assert.equal(await page.$$eval('#guangfoLegend button[data-district]',bs=>bs.length),44);
      const body=await page.$eval('.guangfo-legend-body',el=>({h:el.clientHeight,scroll:el.scrollHeight}));
      assert(body.scroll>body.h,'地区目录必须可以滚动');
      for (const [city,district] of [['深圳','光明区'],['深圳','盐田区'],['深圳','大鹏新区'],['中山','中山市'],['东莞','东莞市'],['清远','连州市'],['惠州','惠东县'],['珠海','金湾区']]) {
        if (!await page.$eval('#guangfoLegend',el=>el.open)) await page.click('#guangfoLegend summary');
        const button=await page.$(`#guangfoLegend button[data-city="${city}"][data-district="${district}"]`);
        assert(button,city+district); await button.click();
        const state=await page.evaluate((city,district)=>{
          const d=REGION_DISTRICTS.find(d=>d.city===city&&d.name===district), p=earthUnproject(W/2,H/2);
          return {lon:p.lon,lat:p.lat,label:d.label,at:guangfoDistrictAt(...d.label)?.name,closed:!el('guangfoLegend').open};
        },city,district);
        assert(state.closed && state.at===district && Math.abs(state.lon-state.label[0])<1e-8 && Math.abs(state.lat-state.label[1])<1e-8,JSON.stringify(state));
        const built=await page.evaluate((city,district)=>{
          const original=Math.random; let seed=123456789;
          Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
          try { for (let i=0;i<25;i++) { G.stations=[]; const st=spawnStation('circle');
            if (st && guangfoDistrictAt(st.gfLon,st.gfLat)?.city===city && st.district===district) return true; }
            return false;
          } finally { Math.random=original; }
        },city,district);
        assert(built,'无法在地区边界内生成车站：'+city+district);
      }
      await page.click('#earthHome');
      const map=await page.evaluate(()=>{ render();return {count:earthProjectedDistricts.length,zoom:G.camera.zoom,overview:earthOverviewCamera().zoom};});
      assert(map.count===44 && Math.abs(map.zoom-map.overview)<1e-8);
      assert.deepEqual(errors,[]);
      console.log('PASS 目录与导航',width,height);
      await page.close();
    }
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1000,height:700,deviceScaleFactor:1});
    await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8000/',{waitUntil:'load'});
    const pts=await page.evaluate(()=>{
      startGame('london'); G.paused=false; G.totalTunnels=100; G.stationTimer=10000; G.trainSpeed=100;
      const st=(id,nx,shape)=>({id,nx,ny:.5,shape,passengers:[],cap:20,oc:0,born:-10,spawnT:999});
      const a=st(201,.25,'circle'),b=st(202,.7,'square'); a.passengers=[{shape:'square'}];
      G.stations=[a,b]; G.lines=[]; render(); return [a.nx*W,a.ny*H,b.nx*W,b.ny*H];
    });
    await page.mouse.move(pts[0],pts[1]);await page.mouse.down();await page.mouse.move(pts[2],pts[3],{steps:12});await page.mouse.up();
    const boarded=await page.evaluate(()=>({lines:G.lines.length,onboard:G.lines[0]?.trains[0]?.passengers.length,delivered:G.delivered}));
    assert.deepEqual(boarded,{lines:1,onboard:1,delivered:0});
    const arrived=await page.evaluate(()=>{G.paused=false; for(let i=0;i<150;i++)update(.1);G.paused=true;return {count:G.delivered,hud:el('delivered').textContent};});
    assert.equal(arrived.count,1);assert.equal(arrived.hud,'1');
    assert.deepEqual(errors,[]);console.log('PASS 实际拖线、首站上客、运行到站与人数显示');
    await page.close();
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
