const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
(async()=>{
  const launch={headless:true};
  if(process.env.INCIDENT_CHROMIUM_PATH){launch.executablePath=process.env.INCIDENT_CHROMIUM_PATH;launch.args=['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage'];}
  const browser=await chromium.launch(launch);
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let html=fs.readFileSync(path.join(__dirname,'../docs/investigation.html'),'utf8');
  if(process.env.INCIDENT_TEST_FONT){const font=fs.readFileSync(process.env.INCIDENT_TEST_FONT).toString('base64');html='<style>@font-face{font-family:TestKR;src:url(data:font/woff;base64,'+font+')}#eir-report,#eir-report *{font-family:TestKR,system-ui!important}</style>'+html;}
  await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
  for(const width of [1024,390,320]){
    await page.setViewportSize({width,height:1000});
    if(await page.locator('[data-series]').count()!==3)throw Error('shared plot missing series');
    if(await page.locator('[data-event]').count()!==9)throw Error('timeline missing events');
    if(await page.locator('[data-node]').count()!==4)throw Error('candidate graph layout');
    if(!(await page.locator('#eir-summary-limit').innerText()).includes('사람이 작성한 계획'))throw Error('replay/model distinction');
    if(await page.locator('#eir-related a').count()!==2)throw Error('example links');
    await page.locator('#eir-charttime').evaluate(el=>{el.value='480';el.dispatchEvent(new Event('input',{bubbles:true}))});
    if(!(await page.locator('#eir-charttip').innerText()).includes('1,850 QPS'))throw Error('raw DB peak');
    await page.keyboard.press('Escape');
    await page.locator('[data-node="C_warming"]').click();
    if(!(await page.locator('#eir-cause-detail').innerText()).includes('대조'))throw Error('causal limitation');
    const evidenceButton=page.locator('#eir-cause-detail .eir-evidencepicker button').filter({hasText:'E_warming'});
    await evidenceButton.click();
    await page.locator('#eir-cause-detail details summary').click();
    const archive=page.locator('#eir-cause-detail a').filter({hasText:'당시 보존본'});
    if(await archive.getAttribute('href')!=='https://jungrok5.github.io/report/evidence/E_warming.json')throw Error('archive link');
    await page.locator('[data-view="investigation"]').click();
    if(await page.locator('[data-step]').count()!==3)throw Error('investigation rounds');
    await page.locator('[data-step="I_3"]').click();
    if(!(await page.locator('#eir-step-detail').innerText()).includes('통제된 재현은 미실행'))throw Error('missing limits');
    await page.locator('[data-view="actions"]').click();
    if(!(await page.locator('#eir-unknownlist').innerText()).includes('OOM'))throw Error('counterhypotheses');
    await page.locator('[data-view="cause"]').click();
    const bounds=await page.locator('#eir-report').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,body:document.body.scrollWidth,win:innerWidth}));
    if(bounds.scroll>bounds.width+1||bounds.body>bounds.win+1)throw Error('horizontal overflow '+JSON.stringify(bounds));
    if(process.env.INCIDENT_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.INCIDENT_SCREENSHOT_DIR,'engine-'+width+'.png'),fullPage:true});
    console.log('PASS engine width='+width);
  }
  if(errors.length)throw Error(errors.join(';'));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
