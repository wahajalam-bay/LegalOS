// Visual check of every NEW level of the compliance drill-down, in both themes.
//   node tools/compliance-drill-shots.js [outDir]
const fs=require("fs"),os=require("os"),path=require("path"),http=require("http"),{spawn,spawnSync}=require("child_process");
const puppeteer=require("puppeteer-core");
const ROOT=path.join(__dirname,".."),PORT=process.env.LEGALOS_SHOT_PORT||"4797",BASE="http://127.0.0.1:"+PORT;
const OUT=process.argv[2]||path.join(os.tmpdir(),"legalos-drill-shots");
const w=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 const email="maryam.haq@zameen.com";
 const S=fs.mkdtempSync(path.join(os.tmpdir(),"legalos-ds-"));
 spawnSync("rsync",["-a","--exclude","node_modules","--exclude","config/.sessions.json","--exclude","config/workflow.json","--exclude","config/workflow-docs","--exclude","legalos/",ROOT+"/",S+"/"]);
 fs.symlinkSync(path.join(ROOT,"node_modules"),path.join(S,"node_modules"));
 const cp=path.join(S,"config","legalos.config.json"),cfg=JSON.parse(fs.readFileSync(cp,"utf8"));
 cfg.access.enforce=false; cfg.access.devBypassEmail=email; fs.writeFileSync(cp,JSON.stringify(cfg,null,2));
 const o=spawnSync("node",["tools/legalos-passwd.js","set",email],{cwd:S,encoding:"utf8"});
 const pw=((o.stdout||"").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/)||[])[1]||"";
 const srv=spawn("node",["server.js"],{cwd:S,stdio:"ignore",env:{...process.env,PORT,LEGALOS_DEV:"1",LEGALOS_COOKIE_PATH:"/"}});
 const ping=()=>new Promise(r=>{const q=http.get(BASE+"/api/health",(s)=>{s.resume();r(s.statusCode===200)});q.on("error",()=>r(false));q.setTimeout(1200,()=>{q.destroy();r(false)})});
 for(let i=0;i<60&&!(await ping());i++) await w(400);
 const b=await puppeteer.launch({executablePath:process.env.CHROME||"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"],defaultViewport:{width:1440,height:1100}});
 const p=await b.newPage(); await p.setCacheEnabled(false);
 const errs=[]; p.on("pageerror",e=>errs.push("PAGEERROR: "+e.message));
 await p.goto(BASE+"/#/login",{waitUntil:"networkidle2"}); await w(2000);
 await p.type('input[name="email"]',email); await p.type('input[name="password"]',pw);
 await p.click('button[type="submit"]'); await w(4000);

 const api=(r)=>p.evaluate(async(u)=>{const x=await fetch(u,{credentials:"include"});return x.ok?x.json():null;},r);
 const loans=await api("/api/compliance/loans");
 const loan=(loans.loans||[]).find(l=>(l.driveFiles||[]).length>0);
 const res=await api("/api/compliance/resolutions");
 const entKey=((res.byEntity||[])[0]||{}).key;
 const years=await api("/api/compliance/secp/years");
 const yearId=((years.years||[])[0]||{}).id;
 const docId=(loan.driveFiles||[])[0].id;

 const SHOTS=[
  ["resolutions-entity","/compliance/resolutions/entity/"+encodeURIComponent(entKey)],
  ["resolution-record", null],
  ["secp-year","/compliance/sec-filings/year/"+encodeURIComponent(yearId)],
  ["secp-entity","/compliance/sec-filings/entity/"+encodeURIComponent(entKey)],
  ["document","/compliance/document/"+encodeURIComponent(docId)],
  ["loan-documents","/compliance/loans/"+encodeURIComponent(loan.id)+"?tab=documents"],
  ["not-found","/compliance/nonsense/abc"],
 ];
 const entReg=await api("/api/compliance/resolutions/entity/"+encodeURIComponent(entKey));
 const resId=((entReg.source||[])[0]||(entReg.native||[])[0]||{}).id;
 SHOTS[1][1]="/compliance/resolutions/"+encodeURIComponent(resId);

 // Every new page at a phone width too: a record page that scrolls sideways is
 // unusable on the device people actually read a licence expiry on.
 let overflows = 0;
 await p.setViewport({width:390,height:844});
 for(const [name,route] of SHOTS){
  await p.goto(BASE+"/#/dashboard",{waitUntil:"networkidle2"});
  await p.goto(BASE+"/#"+route,{waitUntil:"networkidle2"});
  await w(2400);
  await p.screenshot({path:path.join(OUT,name+"-mobile.png"),fullPage:true});
  const m=await p.evaluate(()=>({
    over:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
    sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth,
    h1:(document.querySelector("h1")||{}).textContent||""}));
  if(m.over) overflows++;
  console.log(`  ${(name+" @390").padEnd(26)} ${m.over?"*** OVERFLOWS "+m.sw+" vs "+m.cw+" ***":"no horizontal scroll"}  h1="${m.h1.slice(0,30)}"`);
 }
 console.log(overflows?`\n  ${overflows} page(s) scroll sideways on a phone`:"\n  no page scrolls sideways on a phone");
 await p.setViewport({width:1440,height:1100});

 for(const theme of ["light","dark"]){
  for(const [name,route] of SHOTS){
   await p.goto(BASE+"/#/dashboard",{waitUntil:"networkidle2"});
   await p.goto(BASE+"/#"+route,{waitUntil:"networkidle2"});
   await p.evaluate((t)=>document.documentElement.setAttribute("data-theme",t),theme);
   await w(2600);
   await p.screenshot({path:path.join(OUT,name+"-"+theme+".png")});
   if(theme==="light"){
    const info=await p.evaluate(()=>({h1:(document.querySelector("h1")||{}).textContent||"",
      crumbs:[...document.querySelectorAll(".topbar__crumbs .crumbbtn, .topbar__crumbs b")].map(n=>n.innerText.trim()).join(" > "),
      tabs:[...document.querySelectorAll('[role="tab"]')].map(n=>n.innerText.replace(/\s+/g," ").trim()).join(" | "),
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}));
    console.log(`  ${name.padEnd(20)} h1="${info.h1.slice(0,44)}"`);
    console.log(`  ${" ".repeat(20)} crumbs=${info.crumbs.slice(0,80)}`);
    if(info.tabs) console.log(`  ${" ".repeat(20)} tabs=${info.tabs.slice(0,80)}`);
    if(info.overflow) console.log(`  ${" ".repeat(20)} *** HORIZONTAL OVERFLOW ***`);
   }
  }
 }
 console.log("\n"+(errs.length?"PAGE ERRORS:\n  "+[...new Set(errs)].slice(0,8).join("\n  "):"no page errors on any new page, either theme"));
 console.log("screenshots: "+OUT);
 await b.close(); try{srv.kill()}catch(e){}
})().catch(e=>{console.error(e);process.exit(1)});
