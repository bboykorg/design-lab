/* Design&Lab — main: wiring, drag&drop, router, init. */
function initDivider(){const d=document.getElementById('divider'),ed=document.getElementById('editor');let drag=false;
  d.addEventListener('mousedown',()=>{drag=true;document.body.style.userSelect='none';});
  window.addEventListener('mouseup',()=>{drag=false;document.body.style.userSelect='';});
  window.addEventListener('mousemove',e=>{if(!drag)return;const w=Math.min(Math.max(e.clientX,320),window.innerWidth-360);ed.style.setProperty('--chat-w',w+'px');});}

/* drag & drop onto composer */
function initDrop(){
  const comp=document.querySelector('.composer');
  if(comp){
    ['dragover','dragenter'].forEach(ev=>comp.addEventListener(ev,e=>{e.preventDefault();}));
    comp.addEventListener('drop',e=>{e.preventDefault();const dt=e.dataTransfer;if(!dt)return;
      // directory drop
      const items=dt.items;let dirEntry=null;
      if(items&&items.length&&items[0].webkitGetAsEntry){const en=items[0].webkitGetAsEntry();if(en&&en.isDirectory)dirEntry=en;}
      if(dirEntry){readDirEntry(dirEntry);return;}
      if(dt.files&&dt.files.length)handleFiles(dt.files);
    });
  }
}
function readDirEntry(root){
  const files={};let pending=0,done=false;
  showLoading('Читаю папку…');
  function walk(entry,path){
    if(entry.isFile){pending++;entry.file(f=>{const isBin=/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf)$/i.test(f.name);readFileAs(f,isBin).then(data=>{files[path+entry.name]=data;pending--;maybeDone();});});}
    else if(entry.isDirectory){const rd=entry.createReader();rd.readEntries(ents=>{ents.forEach(en=>walk(en,path+entry.name+'/'===undefined?path:path));const base=path;ents.forEach(en=>walk(en,base+(entry===root?'':entry.name+'/')));});}
  }
  // simpler robust walk
  function walk2(entry,path){
    if(entry.isFile){pending++;entry.file(f=>{const isBin=/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf)$/i.test(f.name);readFileAs(f,isBin).then(data=>{files[path+entry.name]=data;pending--;maybeDone();});},()=>{pending--;maybeDone();});}
    else if(entry.isDirectory){const rd=entry.createReader();const read=()=>rd.readEntries(ents=>{if(!ents.length){maybeDone();return;}ents.forEach(en=>walk2(en,path+entry.name+'/'));read();},()=>{});read();}
  }
  function maybeDone(){if(pending===0){if(done)return;done=true;setTimeout(()=>{if(Object.keys(files).length)mountProject(files,root.name||'project');else{hideLoading();toast('Папка пуста');}},120);}}
  // start from root's children so we don't prefix root name
  const rd=root.createReader();
  const read=()=>rd.readEntries(ents=>{if(!ents.length){maybeDone();return;}ents.forEach(en=>walk2(en,''));read();},()=>{});
  read();
}

/* ===== INIT ===== */
async function pingBackend(){
  try{const r=await fetch(apiUrl('/api/health'),{method:'GET'});return r.ok;}catch(e){return false;}
}
function init(){
  buildGallery();buildModelMenu();initDivider();initDrop();
  const ci=document.getElementById('chatInput');
  ci.addEventListener('input',autoGrow);
  ci.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
  ci.addEventListener('paste',e=>{const items=e.clipboardData&&e.clipboardData.items;if(!items)return;const fs=[];for(let i=0;i<items.length;i++){if(items[i].kind==='file'){const f=items[i].getAsFile();if(f)fs.push(f);}}if(fs.length){e.preventDefault();handleFiles(fs);}});
  document.getElementById('heroPrompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();startFromHero();}});
  document.addEventListener('click',e=>{const c=document.querySelector('.composer');if(c&&!c.contains(e.target)){document.getElementById('modelMenu').classList.remove('on');document.getElementById('modelPill').classList.remove('open');}});
  document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
  if('IntersectionObserver' in window){
    const ro=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');ro.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px'});
    document.querySelectorAll('.reveal').forEach(el=>ro.observe(el));
  }else document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
  const h=location.hash;
  if(/^#editor\/v(\d+)/.test(h))openEditor(parseInt(RegExp.$1,10));
  else if(h==='#editor/new')openScratch();
  refreshAuthUI();
  pingBackend().then(ok=>{if(!ok)setTimeout(()=>toast('Бэкенд не запущен — работает демо-режим. Запусти uvicorn backend.main:app'),1400);});
}
if(typeof document!=='undefined'&&document.getElementById('cards')){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
}
