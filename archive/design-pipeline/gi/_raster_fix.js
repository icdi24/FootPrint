const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const BASE='D:/PersonalHub/projects/tcamp/小组项目';
const SVG_DIR=path.join(BASE,'_test_fix_svg');
const OUT_DIR=path.join(BASE,'_test_fix_png');
const SIZE=512;
if(!fs.existsSync(OUT_DIR))fs.mkdirSync(OUT_DIR,{recursive:true});
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><body></body>');});
(async()=>{
  await new Promise(r=>server.listen(0,r));
  const browser=await chromium.launch({channel:'msedge'});
  const page=await browser.newPage({viewport:{width:SIZE,height:SIZE}});
  const files=fs.readdirSync(SVG_DIR).filter(f=>f.endsWith('.svg'));
  for(const f of files){
    let svg=fs.readFileSync(path.join(SVG_DIR,f),'utf8');
    svg=svg.replace(/width="[^"]*"/,`width="${SIZE}"`).replace(/height="[^"]*"/,`height="${SIZE}"`);
    svg=svg.replace(/fill="currentColor"/g,'fill="#000000"');
    if(!/fill=/.test(svg))svg=svg.replace('<svg','<svg fill="#000000"');
    const html=`<!doctype html><html><head><style>html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;background:transparent}svg{display:block;width:${SIZE}px;height:${SIZE}px}</style></head><body>${svg}</body></html>`;
    try{
      await page.setContent(html,{waitUntil:'load'});
      const el=await page.$('svg');
      if(el)await el.screenshot({path:path.join(OUT_DIR,f.replace('.svg','.png')),omitBackground:true});
    }catch(e){}
  }
  await browser.close();server.close();
})();
