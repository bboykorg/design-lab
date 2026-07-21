/* Design&Lab — core: utils, templates, gallery, upload/project engine, audit (framework-free). */

/* ============================================================
   Design&Lab — application logic
   Single-file, no backend. Keys are user-provided (never bundled).
   ============================================================ */
"use strict";
const DL = {}; // public surface for tests

/* ---------- constants ---------- */
const TEMPLATE_COUNT = 98;
const PAGES_BASE = 'https://badvino-ctrl.github.io/IIOL/design/';
const RAW_BASE = 'https://raw.githubusercontent.com/badVIno-ctrl/IIOL/main/design/';
const TPL_VERSION = '20260721';
const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

/* ---------- tiny utils ---------- */
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(m){const t=document.getElementById('toast');if(!t)return;t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),3000);}
function scrollTo2(id){const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth'});}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
DL.escapeHtml = escapeHtml;

/* ============================================================
   HTML extraction / repair (robust to chatty models)
   ============================================================ */
function extractHtml(s){
  if(!s) return '';
  s=String(s);
  const fence=s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if(fence) s=fence[1];
  const i=s.search(/<!DOCTYPE html|<html[\s>]/i);
  if(i>-1) s=s.slice(i);
  // trim trailing prose after </html>
  const end=s.search(/<\/html>/i);
  if(end>-1) s=s.slice(0,end+7);
  return s.trim();
}
DL.extractHtml = extractHtml;

/* ============================================================
   TEMPLATE METADATA
   ============================================================ */
const NAMES={1:"INK",2:"Axisform",3:"NEXUS Arcade",4:"Vektor",5:"Nexus Defense",6:"Novi",7:"BIRKA",8:"Nexura",9:"Vectra",10:"Novi Alt",11:"Suzuki Moto",12:"VELOS",13:"Auralis",14:"Asterix",15:"simple.ai",16:"Cadence",17:"MenoMorph",18:"Velvet",19:"RI Consulting",20:"Aero",21:"SignalOS",22:"VALER",23:"ioty",24:"ATLAS",25:"Nexora",26:"Nexus Mind",27:"NODEX",28:"Luminous",29:"PitchwithAI",30:"Signalis",31:"DesignFlow",32:"HubFit",33:"Fire Hero",34:"Sonic",35:"Runlyx",36:"KORTEX",37:"Jupiter Volta",38:"BuildAI",39:"Cyber Monday",40:"NEXUS Mobile",41:"Drive X Store",42:"Neon Oiran",43:"AURA VR",44:"GENESIS",45:"Exoflora",46:"MERIDIAN",47:"Offgrid",48:"Apex",49:"Aura Intro",50:"FoilWrap Praha",51:"Auralis Global",52:"KÁVA & Co.",53:"SERENE",54:"Soma",55:"Auden FX",56:"AEX Alpine",57:"MONOLITH",58:"Ankush Mehra",59:"Positiv+",60:"Danlpet",61:"TravelAI",62:"Fluxora",63:"Forge",64:"Aura Canvas",65:"Rhythm-Style",66:"RoysCompany",67:"Kabovelo",68:"Sequra",69:"RAFF.STUDIO",70:"Lunar Rhythm",71:"Revolt",72:"Lumière Films",73:"CharisLooks",74:"MarineElite",75:"The Estate",76:"Dinevo",77:"Estetico Café",78:"PLANET FOOD",79:"Prosperity Island",80:"Modak",81:"Velvet Origin",82:"Madge",83:"Sangria Raipur",84:"ØDE Atelier",85:"AETHERIS",86:"Nature's Beauty",87:"CIRON C1",88:"LumaLoop",89:"NOVAFALL: IRIS",90:"NeuroSync",91:"Substance Lab",92:"Bloom",93:"AQUARIA",94:"Музей Египта",95:"AEON",96:"Koisei",97:"CoinCompass",98:"Ла Мартина"};
const TAGS=['лендинг','тёмный','минимализм','продукт','агентство','портфолио','saas','стартап'];
const FEATURES=[
 ['grid','98 премиум-шаблонов','Готовые красивые дизайны — никакого «ИИ-слопа».'],
 ['spark','Редактирование словами','Опиши идею — ИИ перепишет код с крафт-планкой качества.'],
 ['eye','Live-превью','Смотри, как всё меняется на глазах, на любом экране.'],
 ['zip','ZIP и папки','Загрузи архив или целую папку — соберём предпросмотр сам.'],
 ['shield','Аудит безопасности','Встроенные тесты на баги, XSS и утёкшие ключи.'],
 ['down','Экспорт в 1 файл','Скачай готовый index.html или ZIP проекта.']
];
function featIcon(k){const p={
 grid:'<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
 spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
 eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
 zip:'<path d="M4 4h16v16H4z"/><path d="M10 4v3M10 9v3M10 14v3"/>',
 shield:'<path d="M12 2l7 4v6c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
 down:'<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>'};
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">'+(p[k]||p.grid)+'</svg>';}
function tplPageUrl(n){return PAGES_BASE+'v'+n+'.html';}
function tplRawUrl(n){return RAW_BASE+'v'+n+'.html?tv='+TPL_VERSION;}
function tplTitle(n){return NAMES[n]?('v'+n+' · '+NAMES[n]):('Шаблон v'+n);}
function tplDesc(n){return 'Премиум-шаблон лендинга';}
function shot(url,w){return 'https://s.wordpress.com/mshots/v1/'+encodeURIComponent(url)+'?w='+(w||640);}
function tplShotUrl(n,w){return shot(tplPageUrl(n)+'?tv='+TPL_VERSION,w);}
function thumbLoaded(img){
  const tries=+(img.dataset.rt||0);
  if(img.naturalWidth>0&&img.naturalWidth<=420&&tries<5){
    img.dataset.rt=tries+1;
    setTimeout(()=>{img.src=(img.dataset.base||img.src.split('&r=')[0])+'&r='+Date.now();},2400*(tries+1));
    return;
  }
  img.classList.add('loaded');
}

/* ============================================================
   GALLERY
   ============================================================ */
function buildGallery(){
  let html='';
  html+='<div class="card special" onclick="openScratch()"><div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div><div class="st">Создать с нуля</div><div class="ss">Чистый холст — ИИ напишет сайт по твоему описанию</div></div>';
  html+='<div class="card special" onclick="pickFiles()"><div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M10 4v3M10 9v3M10 14v3"/></svg></div><div class="st">Загрузить ZIP / папку</div><div class="ss">Свой архив или папка проекта — развернём в превью</div></div>';
  for(let n=1;n<=TEMPLATE_COUNT;n++){
    const tag=TAGS[n%TAGS.length];
    html+='<div class="card" data-n="'+n+'" data-search="v'+n+' '+tplTitle(n).toLowerCase()+' '+tag+'" onclick="openEditor('+n+')">'
      +'<div class="ph"><div class="num">v'+n+'</div><div class="load"><span class="sp"></span>превью…</div></div>'
      +'<img class="thumb" alt="'+escapeHtml(tplTitle(n))+'" data-src="'+tplShotUrl(n,640)+'" data-base="'+tplShotUrl(n,640)+'" onload="thumbLoaded(this)" onerror="this.remove()">'
      +'<div class="open">Открыть шаблон →</div>'
      +'<div class="meta"><div class="mtx"><span class="t">'+escapeHtml(tplTitle(n))+'</span><span class="d">'+escapeHtml(tplDesc(n))+'</span></div><span class="tag">'+tag+'</span></div></div>';
  }
  document.getElementById('cards').innerHTML=html;
  let fg='';FEATURES.forEach(f=>{fg+='<div class="feat"><div class="fi">'+featIcon(f[0])+'</div><h4>'+f[1]+'</h4><p>'+f[2]+'</p></div>';});
  document.getElementById('featGrid').innerHTML=fg;
  observeCards();
}
let io,imgIo;
function observeCards(){
  io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'80px'});
  imgIo=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){const img=e.target;if(img.dataset.src){img.src=img.dataset.src;img.removeAttribute('data-src');}imgIo.unobserve(img);}});},{rootMargin:'300px'});
  document.querySelectorAll('.card[data-n]').forEach(c=>io.observe(c));
  document.querySelectorAll('img.thumb').forEach(im=>imgIo.observe(im));
}
function filterCards(q){q=(q||'').trim().toLowerCase();document.querySelectorAll('.card[data-n]').forEach(c=>{c.style.display=(!q||c.dataset.search.indexOf(q)>-1)?'':'none';});}

/* ============================================================
   ATTACHMENTS: files (html/img), ZIP, folder
   ============================================================ */
function pickFiles(){openEditorIfClosed();document.getElementById('fileInput').click();}
function pickFolder(){openEditorIfClosed();document.getElementById('folderInput').click();}
function openEditorIfClosed(){if(!document.getElementById('editor').classList.contains('on'))openScratch();}
function onFilesPicked(inp){handleFiles(inp.files);inp.value='';}
function onFolderPicked(inp){handleProjectFiles(Array.from(inp.files));inp.value='';}
function handleFiles(list){
  Array.from(list).forEach(f=>{
    const isZip=/\.zip$/i.test(f.name)||f.type==='application/zip'||f.type==='application/x-zip-compressed';
    if(isZip){loadZip(f);return;}
    const isHtml=/\.html?$/i.test(f.name)||f.type==='text/html';
    const isImg=(f.type||'').indexOf('image/')===0;
    const isText=/\.(css|js|json|txt|md)$/i.test(f.name);
    if(!isHtml&&!isImg&&!isText){toast('Можно: HTML, фото, ZIP-архив или папку проекта');return;}
    const r=new FileReader();
    r.onload=()=>{attachments.push({kind:isHtml?'html':isImg?'image':'text',name:f.name,data:r.result});renderAttachStrip();if(isHtml)toast('HTML прикреплён — напиши, что с ним сделать');};
    if(isImg)r.readAsDataURL(f);else r.readAsText(f);
  });
}
function renderAttachStrip(){
  const s=document.getElementById('attachStrip');if(!s)return;
  if(!attachments.length){s.className='attach-strip';s.innerHTML='';return;}
  s.className='attach-strip on';
  s.innerHTML=attachments.map((a,i)=>{
    const tile=a.kind==='image'?'<div class="tile" style="background-image:url('+String(a.data).replace(/"/g,'&quot;')+')"><button class="ocrbtn" onclick="previewOcr('+i+')" title="Посмотреть, что увидит модель (OCR)">OCR</button></div>'
      :'<div class="tile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-5-5H8z"/><path d="M14 3v5h5"/></svg></div>';
    return '<div class="att">'+tile+'<div class="nm" title="'+escapeHtml(a.name)+'">'+escapeHtml(a.name)+'</div><button class="rm" onclick="removeAttach('+i+')">✕</button></div>';
  }).join('');
}
function removeAttach(i){attachments.splice(i,1);renderAttachStrip();}
/* show exactly what any model will "read" from a screenshot via OCR.space */
async function previewOcr(i){
  const a=attachments[i];if(!a||a.kind!=='image'){toast('OCR доступен только для изображений');return;}
  toast('Распознаю через OCR.space…');
  try{
    const r=await ocrExtract([a]);
    const txt=((r&&r.text)||'').trim();
    openModal('Что модель видит на скрине','OCR.space распознал текст на «'+a.name+'». Именно он передаётся любой выбранной модели вместе с твоим запросом.','Понятно');
    const body=document.getElementById('mdBody');
    if(body)body.innerHTML='<pre style="white-space:pre-wrap;font-family:var(--mono);font-size:12.5px;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px;max-height:340px;overflow:auto;margin:0">'+(txt?escapeHtml(txt):'<span style="color:var(--faint)">Текст на изображении не распознан.</span>')+'</pre>';
  }catch(e){
    toast(e&&e.offline?'Бэкенд недоступен':e&&e.ocrOff?'OCR отключён на сервере (OCR_ENABLED=0)':'OCR: '+(e&&e.message||'ошибка'));
  }
}

/* ---- ZIP ---- */
let _jszip=null;
function ensureJSZip(){
  if(window.JSZip)return Promise.resolve(window.JSZip);
  if(_jszip)return _jszip;
  _jszip=new Promise((res,rej)=>{const s=document.createElement('script');s.src=JSZIP_CDN;s.onload=()=>res(window.JSZip);s.onerror=()=>rej(new Error('JSZip не загрузился'));document.head.appendChild(s);});
  return _jszip;
}
async function loadZip(file){
  openEditorIfClosed();showLoading('Распаковываю архив…');
  try{
    const JSZip=await ensureJSZip();
    const zip=await JSZip.loadAsync(file);
    const files={};
    const entries=Object.keys(zip.files).filter(p=>!zip.files[p].dir);
    for(const p of entries){
      const norm=p.replace(/^[^/]*\/(?=.*\/|[^/]+$)/, s=>s); // keep as-is
      const isBin=/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf)$/i.test(p);
      files[p]=isBin?('data:'+mimeOf(p)+';base64,'+(await zip.files[p].async('base64'))):(await zip.files[p].async('string'));
    }
    mountProject(files,file.name.replace(/\.zip$/i,''));
  }catch(e){hideLoading();toast('Не удалось открыть ZIP: '+e.message);addAI('⚠️ Не смог распаковать архив: '+escapeHtml(e.message),true);}
}
/* ---- folder ---- */
async function handleProjectFiles(fileArr){
  if(!fileArr.length)return;openEditorIfClosed();showLoading('Читаю папку проекта…');
  const files={};let root='';
  const rel=fileArr[0].webkitRelativePath||fileArr[0].name;root=rel.split('/')[0];
  for(const f of fileArr){
    const path=(f.webkitRelativePath||f.name).replace(root+'/','');
    const isBin=/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf)$/i.test(f.name);
    files[path]=await readFileAs(f,isBin);
  }
  mountProject(files,root||'project');
}
function readFileAs(f,bin){return new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>res('');if(bin)r.readAsDataURL(f);else r.readAsText(f);});}
function mimeOf(p){const e=(p.split('.').pop()||'').toLowerCase();return {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',pdf:'application/pdf'}[e]||'application/octet-stream';}

/* ---- entry + start-command detection (req #4 & #5) ---- */
function detectEntry(files){
  const paths=Object.keys(files);
  const htmls=paths.filter(p=>/\.html?$/i.test(p));
  if(!htmls.length)return null;
  // prefer index.html at shallowest depth, then public/dist/build/src, then any
  const score=p=>{
    let s=p.split('/').length*10;                 // shallower is better
    const base=p.split('/').pop().toLowerCase();
    if(base==='index.html')s-=100;
    if(/^(public|dist|build|out)\//i.test(p))s-=30;
    if(/^src\//i.test(p))s-=5;
    return s;
  };
  return htmls.slice().sort((a,b)=>score(a)-score(b))[0];
}
function detectStartCommand(files){
  // returns {kind:'static'|'build', framework, startCmd, buildCmd, note}
  const pkgPath=Object.keys(files).find(p=>/(^|\/)package\.json$/i.test(p));
  if(!pkgPath){
    return {kind:'static',framework:null,startCmd:null,note:'Статический сайт — запускаю предпросмотр напрямую.'};
  }
  let pkg={};try{pkg=JSON.parse(files[pkgPath]);}catch(e){}
  const deps=Object.assign({},pkg.dependencies,pkg.devDependencies);
  const has=n=>Object.keys(deps).some(d=>d===n||d.indexOf(n)===0);
  let framework=null;
  if(has('next'))framework='Next.js';
  else if(has('nuxt'))framework='Nuxt';
  else if(has('@angular/core'))framework='Angular';
  else if(has('vite'))framework='Vite';
  else if(has('react-scripts'))framework='Create React App';
  else if(has('svelte')||has('@sveltejs/kit'))framework='Svelte';
  else if(has('vue'))framework='Vue';
  else if(has('astro'))framework='Astro';
  const scripts=pkg.scripts||{};
  const startCmd=scripts.dev?'npm run dev':scripts.start?'npm start':scripts.serve?'npm run serve':null;
  const buildCmd=scripts.build?'npm run build':null;
  // If a prebuilt static output exists, we can still preview it.
  const prebuilt=Object.keys(files).find(p=>/(^|\/)(dist|build|out|public)\/index\.html$/i.test(p));
  if(prebuilt)return {kind:'static',framework,startCmd,buildCmd,note:'Нашёл готовую сборку ('+prebuilt+') — показываю её.',prebuilt};
  return {kind:'build',framework:framework||'Node-проект',startCmd:startCmd||'npm install && npm run dev',buildCmd,note:'Это проект со сборкой — для живого запуска нужен Node/сервер.'};
}
DL.detectEntry=detectEntry;
DL.detectStartCommand=detectStartCommand;

/* inline a static project's assets into one self-contained HTML for the iframe */
function resolvePath(base,rel){
  if(/^(https?:)?\/\//i.test(rel)||/^data:/i.test(rel)||rel.startsWith('#')||rel.startsWith('mailto:'))return null;
  const baseDir=base.indexOf('/')>-1?base.slice(0,base.lastIndexOf('/')+1):'';
  let path=rel.split('#')[0].split('?')[0];
  if(path.startsWith('/'))path=path.slice(1);
  else path=baseDir+path;
  const parts=[];path.split('/').forEach(seg=>{if(seg==='..')parts.pop();else if(seg!=='.'&&seg!=='')parts.push(seg);});
  return parts.join('/');
}
function findFile(files,path){
  if(files[path]!=null)return path;
  const lower=path.toLowerCase();
  const hit=Object.keys(files).find(p=>p.toLowerCase()===lower);
  if(hit)return hit;
  const tail=Object.keys(files).find(p=>p.toLowerCase().endsWith('/'+lower));
  return tail||null;
}
function inlineProject(files,entry){
  let html=files[entry]||'';
  // inline <link rel=stylesheet href=local.css>
  html=html.replace(/<link\b[^>]*>/gi,tag=>{
    if(!/stylesheet/i.test(tag))return tag;
    const m=tag.match(/href\s*=\s*["']([^"']+)["']/i);if(!m)return tag;
    const rp=resolvePath(entry,m[1]);if(!rp)return tag;const fp=findFile(files,rp);if(!fp)return tag;
    return '<style>\n'+inlineCss(files,fp)+'\n</style>';
  });
  // inline <script src=local.js>
  html=html.replace(/<script\b([^>]*)>\s*<\/script>/gi,(tag,attrs)=>{
    const m=attrs.match(/src\s*=\s*["']([^"']+)["']/i);if(!m)return tag;
    const rp=resolvePath(entry,m[1]);if(!rp)return tag;const fp=findFile(files,rp);if(!fp)return tag;
    return '<scr'+'ipt>\n'+String(files[fp]).replace(/<\/script>/gi,'<\\/script>')+'\n<\/scr'+'ipt>';
  });
  // rewrite img/src, source, video, a[href] local assets to data URLs
  html=html.replace(/(src|href|poster)\s*=\s*["']([^"']+)["']/gi,(full,attr,val)=>{
    const rp=resolvePath(entry,val);if(!rp)return full;const fp=findFile(files,rp);if(!fp)return full;
    const data=files[fp];
    if(typeof data==='string'&&data.startsWith('data:'))return attr+'="'+data+'"';
    if(/\.html?$/i.test(fp))return full; // don't inline html links
    return full;
  });
  return html;
}
function inlineCss(files,cssPath){
  let css=String(files[cssPath]||'');
  css=css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi,(full,val)=>{
    const rp=resolvePath(cssPath,val);if(!rp)return full;const fp=findFile(files,rp);if(!fp)return full;
    const data=files[fp];if(typeof data==='string'&&data.startsWith('data:'))return 'url("'+data+'")';
    return full;
  });
  return css;
}
function mountProject(files,name){
  const entry=detectEntry(files);
  const start=detectStartCommand(files);
  current={id:null,html:null,scratch:false,project:{files,entry,name,start}};
  document.getElementById('tplName').textContent=name;
  document.getElementById('suggests').style.display='none';
  document.getElementById('pvUrl').textContent=name+(entry?'/'+entry:'');
  const runBtn=document.getElementById('runLiveBtn');
  if(runBtn)runBtn.style.display=(start.kind==='build')?'':'none';
  const fileCount=Object.keys(files).length;
  let entryToUse=entry;
  if(start.prebuilt)entryToUse=start.prebuilt;
  if(entryToUse){
    const inlined=inlineProject(files,entryToUse);
    current.html=inlined;renderHtml(inlined);hideLoading();
    let msg='Загрузил проект <b>'+escapeHtml(name)+'</b> ('+fileCount+' файлов). Точка входа: <b>'+escapeHtml(entryToUse)+'</b>.';
    if(start.framework)msg+=' Обнаружен: <b>'+escapeHtml(start.framework)+'</b>.';
    if(start.kind==='build')msg+='<br><br>⚙️ Это проект со сборкой. Стартовая команда: <code>'+escapeHtml(start.startCmd)+'</code>. Показал статический предпросмотр. Для настоящей сборки нажми <b>▶ «Запустить вживую»</b> вверху — соберу и подниму dev-сервер прямо в браузере (Chromium, WebContainers).';
    else msg+=' Собрал предпросмотр — правь его в чате или проверь аудитом.';
    addAI(msg);
    const rep=runAudit(current.html);setAuditBadge(rep);
  }else if(start.kind==='build'){
    hideLoading();current.html=buildInfoHtml(name,start,files);renderHtml(current.html);
    addAI('Загрузил <b>'+escapeHtml(name)+'</b> ('+fileCount+' файлов) — HTML-точки входа нет, это проект со сборкой (<b>'+escapeHtml(start.framework)+'</b>).<br><br>Стартовая команда: <code>'+escapeHtml(start.startCmd)+'</code>. Нажми <b>▶ «Запустить вживую»</b> вверху — соберу и подниму его прямо в браузере через WebContainers (Chromium).');
  }else{
    hideLoading();toast('В архиве нет HTML-файла для предпросмотра');
    addAI('В <b>'+escapeHtml(name)+'</b> не нашёл ни одного HTML-файла для предпросмотра. Добавь index.html или скажи, что собрать.',true);
  }
  location.hash='editor/project';
}
function buildInfoHtml(name,start,files){
  const tree=Object.keys(files).slice(0,40).map(p=>'• '+p).join('<br>');
  return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(name)+'</title><style>*{margin:0;box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0a0b;color:#f2f3f5;padding:40px;line-height:1.6}h1{font-size:28px;margin-bottom:8px}.b{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:8px;padding:10px 14px;font-family:monospace;margin:10px 0}.m{color:#9497a2}.t{margin-top:24px;font-family:monospace;font-size:12px;color:#9497a2;background:#101012;border:1px solid #222;border-radius:10px;padding:16px}</style></head><body><h1>'+escapeHtml(name)+'</h1><p class="m">Обнаружен фреймворк: <b>'+escapeHtml(start.framework)+'</b></p><p style="margin-top:16px">Стартовая команда:</p><div class="b">'+escapeHtml(start.startCmd)+'</div>'+(start.buildCmd?'<p>Сборка:</p><div class="b">'+escapeHtml(start.buildCmd)+'</div>':'')+'<p class="m" style="margin-top:16px">Для живого запуска нужен Node-сервер (WebContainer/бэкенд). Статический предпросмотр доступен для собранных проектов (dist/build/public).</p><div class="t">'+tree+'</div></body></html>';
}

/* ============================================================
   AUDIT ENGINE (req #6) — static security/quality checks
   Pure function → testable in Node.
   ============================================================ */
function runAudit(html){
  html=String(html||'');
  const items=[];
  const add=(sev,title,desc,fix)=>items.push({sev,title,desc,fix:fix||''});
  const has=re=>re.test(html);

  // --- security ---
  const keyPatterns=[
    [/sk-or-v1-[A-Za-z0-9]{20,}/,'OpenRouter'],
    [/sk-[A-Za-z0-9]{20,}/,'OpenAI-подобный'],
    [/csk-[A-Za-z0-9]{20,}/,'Cerebras'],
    [/AIza[0-9A-Za-z_\-]{30,}/,'Google API'],
    [/AKIA[0-9A-Z]{16}/,'AWS'],
    [/gh[pousr]_[A-Za-z0-9]{20,}/,'GitHub token'],
    [/xox[baprs]-[A-Za-z0-9-]{10,}/,'Slack token']
  ];
  let leaked=[];
  keyPatterns.forEach(([re,label])=>{if(re.test(html))leaked.push(label);});
  if(leaked.length)add('high','Утёкшие ключи/секреты в коде','Найдены похожие на секреты строки ('+leaked.join(', ')+'). В клиентском коде их видит любой посетитель.','Убери ключи из HTML/JS. Держи их на бэкенде или во вводе пользователя (localStorage). Скомпрометированные ключи немедленно отзови.');
  else add('ok','Секретов в коде не найдено','Явных API-ключей и токенов в разметке нет.');

  // inline event handlers → potential XSS surface if content is dynamic
  const inlineOn=(html.match(/\son[a-z]+\s*=\s*["']/gi)||[]).length;
  if(inlineOn>8)add('low','Много inline-обработчиков (on...=)','Найдено '+inlineOn+' inline-обработчиков. При вставке пользовательских данных это повышает риск XSS.','Выноси обработчики в addEventListener; не вставляй непроверенный ввод в innerHTML.');

  if(has(/\.innerHTML\s*=/) && has(/location|value|search|params|input/i))
    add('med','innerHTML с потенциально пользовательскими данными','Есть присваивание innerHTML рядом с источниками ввода — риск XSS.','Используй textContent или экранируй HTML перед вставкой.');

  if(has(/target\s*=\s*["']_blank["']/) && !has(/rel\s*=\s*["'][^"']*noopener/))
    add('med','target="_blank" без rel="noopener"','Внешние ссылки в новой вкладке без noopener — уязвимость tabnabbing.','Добавь rel="noopener noreferrer" ко всем target="_blank".');

  const httpAssets=(html.match(/(src|href)\s*=\s*["']http:\/\//gi)||[]).length;
  if(httpAssets)add('med','Смешанный контент (http://)','Найдено '+httpAssets+' ресурсов по http:// — на https-сайте они заблокируются.','Переведи все ссылки на https://.');

  const extScripts=(html.match(/<script[^>]+src\s*=\s*["']https?:\/\//gi)||[]).length;
  const withSri=(html.match(/<script[^>]+integrity=/gi)||[]).length;
  if(extScripts>0 && withSri<extScripts)add('low','Внешние скрипты без integrity (SRI)','Из '+extScripts+' внешних скриптов только '+withSri+' с проверкой целостности.','Добавь integrity + crossorigin к CDN-скриптам, где возможно.');

  if(!has(/<meta[^>]+http-equiv=["']Content-Security-Policy/i))
    add('low','Нет Content-Security-Policy','CSP снижает риск XSS и инъекций.','Добавь <meta http-equiv="Content-Security-Policy" content="...">, если хостинг не ставит заголовок.');

  // --- correctness / bugs ---
  if(!has(/<!DOCTYPE html>/i))add('med','Нет <!DOCTYPE html>','Без доктайпа браузер включает quirks-режим — вёрстка может ломаться.','Добавь <!DOCTYPE html> первой строкой.');
  if(!has(/<meta[^>]+name=["']viewport["']/i))add('high','Нет meta viewport','Сайт не адаптируется под мобильные.','Добавь <meta name="viewport" content="width=device-width, initial-scale=1">.');
  if(!has(/<html[^>]+lang=/i))add('low','Нет lang у <html>','Важно для доступности и SEO.','Укажи <html lang="ru"> (или нужный язык).');
  if(!has(/<title>[^<]*\S[^<]*<\/title>/i))add('med','Пустой или отсутствует <title>','Заголовок вкладки/SEO не задан.','Добавь осмысленный <title>.');
  const h1=(html.match(/<h1[\s>]/gi)||[]).length;
  if(h1===0)add('low','Нет <h1>','Одна главная заголовочная строка нужна для структуры и SEO.','Добавь ровно один <h1>.');
  else if(h1>1)add('low','Несколько <h1> ('+h1+')','Обычно на странице должен быть один <h1>.','Оставь один <h1>, остальное — h2/h3.');

  const imgs=(html.match(/<img\b[^>]*>/gi)||[]);
  const noAlt=imgs.filter(t=>!/\balt\s*=/.test(t)).length;
  if(noAlt)add('low','Картинки без alt ('+noAlt+')','Без alt изображения недоступны для скринридеров.','Добавь alt каждому <img> (пустой alt="" для декоративных).');

  if(!has(/prefers-reduced-motion/i) && has(/@keyframes|animation:/i))
    add('low','Анимации без prefers-reduced-motion','Пользователям с чувствительностью к движению может быть некомфортно.','Оберни/отключи анимации в @media (prefers-reduced-motion: reduce).');

  if(has(/console\.log\(/))add('low','Остались console.log','Отладочные логи в проде — мелочь, но лучше убрать.','Удали console.log перед публикацией.');

  // score
  const weight={high:22,med:9,low:3,ok:0};
  let penalty=0;items.forEach(i=>penalty+=weight[i.sev]||0);
  const score=Math.max(0,Math.min(100,100-penalty));
  const high=items.filter(i=>i.sev==='high').length;
  const med=items.filter(i=>i.sev==='med').length;
  const low=items.filter(i=>i.sev==='low').length;
  let summary=high?('Есть '+high+' критич. и '+med+' средних замечаний.'):med?('Есть '+med+' средних и '+low+' мелких замечаний.'):low?('Мелкие улучшения: '+low+'.'):'Отлично — проблем не найдено.';
  // sort: high, med, low, ok
  const rank={high:0,med:1,low:2,ok:3};
  items.sort((a,b)=>rank[a.sev]-rank[b.sev]);
  return {score,items,high,med,low,summary};
}
DL.runAudit=runAudit;

function toggleAudit(){const a=document.getElementById('audit');if(a.classList.contains('on'))a.classList.remove('on');else{a.classList.add('on');if(current.html)renderAudit(runAudit(current.html));}}
function openAudit(){document.getElementById('audit').classList.add('on');}
function runAuditUI(){if(!current.html){toast('Сначала открой шаблон или загрузи проект');return;}renderAudit(runAudit(current.html));}
function setAuditBadge(rep){const b=document.getElementById('auditBtn');if(!b)return;b.style.color=rep.high?'var(--danger)':rep.med?'var(--warn)':'var(--patina)';b.title='Аудит: '+rep.score+'/100';}
function renderAudit(rep){
  document.getElementById('auditVal').textContent=rep.score;
  document.getElementById('auditVal').style.color=rep.score>=85?'var(--patina)':rep.score>=60?'var(--warn)':'var(--danger)';
  document.getElementById('auditSum').textContent=rep.summary;
  const sevName={high:'Критично',med:'Средне',low:'Мелко',ok:'Ок'};
  document.getElementById('auditBody').innerHTML=rep.items.map(i=>
    '<div class="audit-item"><div class="ai-top"><span class="sev '+i.sev+'">'+sevName[i.sev]+'</span><span class="ai-title">'+escapeHtml(i.title)+'</span></div>'
    +'<div class="ai-desc">'+escapeHtml(i.desc)+'</div>'+(i.fix?'<div class="ai-fix">→ '+escapeHtml(i.fix)+'</div>':'')+'</div>'
  ).join('');
  setAuditBadge(rep);
}

/* expose for node tests */
if(typeof module!=='undefined'&&module.exports)module.exports=DL;
