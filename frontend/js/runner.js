/* Design&Lab — runner: live build & run of framework projects (React/Vite/Next…)
   in the browser via WebContainers (StackBlitz). Chromium-only and requires the
   page to be cross-origin isolated (the backend sends COOP/COEP). Degrades
   gracefully to the existing static preview when unavailable. */
"use strict";

let _wc=null,_wcBooting=null;
const WC_CDN='https://cdn.jsdelivr.net/npm/@webcontainer/api@1.5.1/dist/index.js';

function wcSupported(){
  return typeof window!=='undefined'
    && window.crossOriginIsolated===true
    && /Chrome|Chromium|Edg\//.test(navigator.userAgent)
    && !/Firefox|FxiOS/.test(navigator.userAgent);
}
async function bootWC(){
  if(_wc)return _wc;
  if(_wcBooting)return _wcBooting;
  _wcBooting=(async()=>{const mod=await import(WC_CDN);_wc=await mod.WebContainer.boot();return _wc;})();
  return _wcBooting;
}
function _b64ToBytes(dataUrl){
  const b=String(dataUrl).split(',')[1]||'';
  const bin=atob(b);const u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return u;
}
/* flat {path:content} -> WebContainer FileSystemTree */
function _toTree(files){
  const tree={};
  Object.keys(files).forEach(path=>{
    const parts=path.split('/').filter(Boolean);let node=tree;
    for(let i=0;i<parts.length-1;i++){const seg=parts[i];if(!node[seg])node[seg]={directory:{}};node=node[seg].directory;}
    const name=parts[parts.length-1];if(!name)return;
    const val=files[path];
    const contents=(typeof val==='string'&&val.startsWith('data:'))?_b64ToBytes(val):String(val);
    node[name]={file:{contents:contents}};
  });
  return tree;
}
function _devArgs(start){
  const c=(start&&start.startCmd)||'';
  const m=c.match(/npm run ([\w:-]+)/);
  if(m)return ['run',m[1]];
  if(/npm start/.test(c))return ['start'];
  return ['run','dev'];
}

async function runProjectLive(){
  const proj=current&&current.project;
  if(!proj||!proj.files){toast('Сначала загрузи проект — ZIP-архив или папку');return;}
  if(!wcSupported()){
    addAI('▶️ Живой запуск со сборкой работает через <b>WebContainers</b> — это Node прямо в браузере, только в <b>Chromium</b> (Chrome/Edge) и при cross-origin isolation. Сейчас он недоступен: открой сайт через бэкенд Design&Lab (он уже шлёт нужные заголовки COOP/COEP) в Chrome. Статический предпросмотр остаётся доступен.',true);
    return;
  }
  const th=startThink('Запускаю проект вживую (WebContainers)…');
  try{
    th.line('Загружаю движок WebContainers…','act','⇩');
    const wc=await bootWC();
    th.line('Монтирую файлы проекта ('+Object.keys(proj.files).length+')…','act','▤');
    await wc.mount(_toTree(proj.files));

    showLoading('Устанавливаю зависимости (npm install)…');
    th.line('npm install…','act','⚙');
    const install=await wc.spawn('npm',['install']);
    install.output.pipeTo(new WritableStream({write(){}}));
    const code=await install.exit;
    if(code!==0){th.fail('npm install завершился с кодом '+code);hideLoading();addAI('⚠️ Установка зависимостей не удалась (код '+code+'). Проверь package.json.',true);return;}

    const args=_devArgs(proj.start);
    th.line('Запускаю: npm '+args.join(' ')+'…','act','▶');
    showLoading('Собираю и поднимаю dev-сервер…');
    let ready=false;
    wc.on('server-ready',(port,url)=>{
      if(ready)return;ready=true;
      const f=document.getElementById('pvFrame');f.removeAttribute('srcdoc');f.src=url;
      const u=document.getElementById('pvUrl');if(u)u.textContent=url;
      hideLoading();th.done('Запущено на '+url);
      addAI('✅ Проект собран и <b>запущен вживую</b> (порт '+port+'). Справа — реально работающий dev-сервер, а не статический снимок.');
    });
    wc.on('error',(err)=>{if(!ready){hideLoading();th.fail('WebContainer: '+(err&&err.message||err));}});
    const server=await wc.spawn('npm',args);
    server.output.pipeTo(new WritableStream({write(){}}));
    setTimeout(()=>{if(!ready){hideLoading();th.line('Сборка идёт дольше обычного — жду server-ready…','act','⏳');}},25000);
  }catch(e){
    hideLoading();
    th.fail('Ошибка запуска: '+(e&&e.message||e));
    addAI('⚠️ Не удалось запустить вживую: '+escapeHtml(String(e&&e.message||e))+'. Статический предпросмотр остаётся доступен.',true);
  }
}
