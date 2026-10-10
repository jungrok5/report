const fs = require("fs"), path = require("path");
const {chromium} = require("playwright");
const root = path.resolve(__dirname, "../site-dist"), out = path.join(root, "review-previews");
function luminance(rgb) { return rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x/255).map(x => x<=.04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0); }
function contrast(a,b) { const x=[luminance(a),luminance(b)].sort((a,b)=>a-b); return (x[1]+.05)/(x[0]+.05); }
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true}), page=await browser.newPage(), errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("https://jungrok5.github.io/report/**",async route=>{
    const relative=decodeURIComponent(new URL(route.request().url()).pathname.slice("/report/".length))||"index.html", file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)) return route.abort();
    const type={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json"}[path.extname(file)]||"application/octet-stream";
    await route.fulfill({body:fs.readFileSync(file),contentType:type});
  });
  await page.goto("https://jungrok5.github.io/report/"); await page.locator("h1").waitFor(); await page.evaluate(()=>document.fonts.ready);
  for(const scheme of ["light","dark"]) for(const width of [375,768,1024,1440]) {
    await page.emulateMedia({colorScheme:scheme}); await page.setViewportSize({width,height:1500});
    const state=await page.evaluate(()=>{
      const band=document.querySelector(".conclusion"), computed=getComputedStyle(band);
      return {overflow:document.documentElement.scrollWidth>innerWidth+1, bg:computed.backgroundColor,
        text:[band,...band.querySelectorAll("p,a,button,.badge")].map(e=>getComputedStyle(e).color)};
    });
    if(state.overflow) throw Error("Horizontal overflow "+scheme+" "+width);
    if(state.text.some(color=>contrast(color,state.bg)<4.5)) throw Error("Cause text contrast "+scheme+" "+width);
    await page.screenshot({path:path.join(out,scheme+"-"+width+".png")});
    console.log("PASS design "+scheme+" "+width+" layout and cause contrast");
  }
  await page.emulateMedia({media:"print",colorScheme:"dark"});
  const print=await page.locator(".conclusion").evaluate(e=>({bg:getComputedStyle(e).backgroundColor,fg:getComputedStyle(e).color}));
  if(contrast(print.bg,print.fg)<4.5) throw Error("Print cause contrast");
  if(errors.length) throw Error(errors.join("; "));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
