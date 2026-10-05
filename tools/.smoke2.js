const puppeteer=require("puppeteer-core");
const {spawn,spawnSync}=require("child_process");
const fs=require("fs"),os=require("os"),P=require("path"),http=require("http");
const PORT=process.env.SMOKE_PORT||"4861",B=`http://127.0.0.1:${PORT}`,USER="maryam.haq@zameen.com";
const w=(ms)=>new Promise(r=>setTimeout(r,ms));
const ping=()=>new Promise(res=>{const r=http.get(B+"/api/health",x=>{x.resume();res(x.statusCode===200);});r.on("error",()=>res(false));r.setTimeout(1000,()=>{r.destroy();res(false);});});
(async()=>{
  if(await ping()){console.error("port busy");process.exit(2);}
  const S=fs.mkdtempSync(P.join(os.tmpdir(),"legalos-s2-"));
  spawnSync("rsync",["-a","--exclude","node_modules","--exclude","config/.sessions.json","--exclude","legalos/",P.join(__dirname,"..")+"/",S+"/"]);
  fs.symlinkSync(P.join(__dirname,"..","node_modules"),P.join(S,"node_modules"));
  const cfgPath=P.join(S,"config","legalos.config.json");
  const cfg=JSON.parse(fs.readFileSync(cfgPath,"utf8")); cfg.access.enforce=false; cfg.access.devBypassEmail=USER;
  fs.writeFileSync(cfgPath,JSON.stringify(cfg,null,2));
  const out=spawnSync("node",["tools/legalos-passwd.js","set",USER],{cwd:S,encoding:"utf8"});
  const PW=((out.stdout||"").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/)||[])[1]||"";
  const srv=spawn("node",["server.js"],{cwd:S,env:{...process.env,PORT,HOST:"127.0.0.1",LEGALOS_DEV:"1",LEGALOS_COOKIE_PATH:"/"},stdio:"ignore"});
  for(let i=0;i<60&&!(await ping());i++) await w(500);
  const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome",headless:"new",args:["--no-sandbox"]});
  const p=await b.newPage(); await p.setViewport({width:1600,height:1000});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e.message).slice(0,180)));
  p.on("console",m=>{if(m.type()==="error"&&!/favicon|401|403|429/.test(m.text()))errs.push(m.text().slice(0,180));});
  await p.goto(B+"/#/login",{waitUntil:"networkidle2"}); await w(1800);
  await p.type('input[name="email"]',USER); await p.type('input[name="password"]',PW);
  await p.click('button[type="submit"]'); await w(4000);
  for(const route of (process.env.SMOKE_ROUTES||"/tracker").split(",")){
    errs.length=0;
    await p.goto(B+"/#"+route,{waitUntil:"networkidle2"});
    try{ await p.waitForSelector(".regcount",{timeout:15000}); }catch(e){}
    await w(1200);
    const info=await p.evaluate(()=>({
      count:(document.querySelector(".regcount")||{}).textContent||"",
      filters:[...document.querySelectorAll(".regbar .fltbtn")].map(b=>b.textContent.trim()),
      cols:[...document.querySelectorAll(".table thead th")].map(t=>t.textContent.trim()),
      rows:document.querySelectorAll(".table tbody tr").length,
      len:document.body.innerText.length,
      text:document.body.innerText.replace(/\s+/g,' ').slice(0,700),
    }));
    console.log(`\n=== ${route} ===`);
    console.log("  count:  ",info.count);
    console.log("  filters:",JSON.stringify(info.filters));
    console.log("  cols:   ",JSON.stringify(info.cols));
    console.log("  rows:   ",info.rows,"len:",info.len);
    console.log("  errors: ",errs.length?errs.slice(0,3):"none");
    if(process.env.SMOKE_TEXT) console.log("  text:   ",info.text);
  }
  await b.close(); srv.kill("SIGKILL"); fs.rmSync(S,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1);});
