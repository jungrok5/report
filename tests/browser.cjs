const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
(async()=>{
  const launch={headless:true};
  if(process.env.INCIDENT_CHROMIUM_PATH){launch.executablePath=process.env.INCIDENT_CHROMIUM_PATH;launch.args=['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage'];}
  const browser=await chromium.launch(launch);
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let html=fs.readFileSync(path.join(__dirname,'../examples/restart-recovery.html'),'utf8');
  if(process.env.INCIDENT_TEST_FONT){const font=fs.readFileSync(process.env.INCIDENT_TEST_FONT).toString('base64');html='<style>@font-face{font-family:TestKR;src:url(data:font/woff2;base64,'+font+')}#eir-report,#eir-report *{font-family:TestKR,system-ui!important}</style>'+html;}
  await page.setContent(html);await page.locator('#eir-title').waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const width of [1024,390,320]){
    await page.setViewportSize({width,height:1000});
    await page.locator('[data-view="cause"]').click();
    await page.locator('[data-event="V4"]').click();
    if(!(await page.locator('#eir-eventdetail').innerText()).includes('재부팅'))throw Error('event selection');
    const line=await page.locator('[data-selected-time]').getAttribute('data-selected-time');
    if(Number(line)!==Date.parse('2026-10-08T21:05:00+09:00'))throw Error('time alignment');
    await page.locator('[data-event="V1"]').click();
    if(!(await page.locator('#eir-eventdetail .eir-values').innerText()).includes('관측 없음'))throw Error('missing metric treated as value');
    await page.locator('[data-node="N4"]').click();
    if(!(await page.locator('#eir-cause-detail').innerText()).includes('동시 실행 수'))throw Error('node selection');
    await page.locator('#eir-cause-detail .eir-evidencepicker button').filter({hasText:'E08'}).click();
    if(!(await page.locator('#eir-cause-detail').innerText()).includes('2740'))throw Error('evidence selection');
    await page.locator('[data-edge="C2"]').click();
    if(!(await page.locator('#eir-cause-detail').innerText()).includes('16,000'))throw Error('edge limitation');
    await page.locator('[data-view="investigation"]').click();
    await page.locator('[data-step="I3"]').click();
    if(!(await page.locator('#eir-step-detail').innerText()).includes('동시 실행 수'))throw Error('investigation');
    await page.locator('[data-view="actions"]').click();
    if(!(await page.locator('#eir-unknownlist').innerText()).includes('보상 누락'))throw Error('unknown questions');
    await page.locator('[data-view="cause"]').click();
    const bounds=await page.locator('#eir-report').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,body:document.body.scrollWidth,win:innerWidth}));
    if(bounds.scroll>bounds.width+1||bounds.body>bounds.win+1)throw Error('horizontal overflow '+JSON.stringify(bounds));
    const d=await page.locator('#eir-data').textContent();
    if(!JSON.parse(d).metrics[2].points.some(p=>p[1]===null))throw Error('null lost');
    if(process.env.INCIDENT_SCREENSHOT_DIR){await page.screenshot({path:path.join(process.env.INCIDENT_SCREENSHOT_DIR,'report-'+width+'.png'),fullPage:true});}
    console.log('PASS width='+width);
  }
  await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:1024,height:1000});
  if(process.env.INCIDENT_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.INCIDENT_SCREENSHOT_DIR,'report-dark.png'),fullPage:true});
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  if(!(await page.locator('#eir-print-evidence details').first().getAttribute('open')===''))throw Error('print evidence not expanded');
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  if(errors.length)throw Error(errors.join(';'));
  console.log('PASS interactions, shared time cursor, missing data, responsive layout, JS runtime and print evidence.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
