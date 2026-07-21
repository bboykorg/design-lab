/* Design&Lab — api: backend client (/api/ai, /api/projects, /api/audit), model picker, settings. */
"use strict";

/* ---- model metadata (labels only; keys live on the backend) ---- */
const AV={
  qwen:{bg:'#5747c9',svg:'<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.6l2.7 6.7 6.7 2.7-6.7 2.7-2.7 6.7-2.7-6.7L2.6 12l6.7-2.7z"/></svg>'},
  openai:{bg:'#1f2a26',svg:'<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M12 3.5v17M4.6 7.75l14.8 8.5M4.6 16.25l14.8-8.5"/></svg>'},
  glm:{bg:'#2a3ad1',svg:'<svg viewBox="0 0 24 24"><text x="12" y="16.5" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="Arial">Z</text></svg>'},
  gemini:{bg:'#2e63d9',svg:'<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2c1.1 5.6 4.4 8.9 10 10-5.6 1.1-8.9 4.4-10 10-1.1-5.6-4.4-8.9-10-10 5.6-1.1 8.9-4.4 10-10z"/></svg>'},
  google:{bg:'#23272e',svg:'<svg viewBox="0 0 24 24"><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="Arial">G</text></svg>'},
  mistral:{bg:'#d9530f',svg:'<svg viewBox="0 0 24 24"><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="Arial">M</text></svg>'},
  openrouter:{bg:'#26262b',svg:'<svg viewBox="0 0 24 24"><text x="12" y="15.8" text-anchor="middle" font-size="9.5" font-weight="800" fill="#fff" font-family="Arial">OR</text></svg>'}
};
const MODELS={
  'or-qwen3-coder':{name:'Qwen3 Coder',desc:'480B · код и вёрстка · free',provider:'openrouter',model:'qwen/qwen3-coder:free',brand:'qwen',group:'OpenRouter · бесплатные'},
  'or-deepseek':{name:'DeepSeek R1',desc:'глубокие рассуждения · free',provider:'openrouter',model:'deepseek/deepseek-r1:free',brand:'openrouter',group:'OpenRouter · бесплатные'},
  'or-llama':{name:'Llama 3.3 70B',desc:'универсальная · free',provider:'openrouter',model:'meta-llama/llama-3.3-70b-instruct:free',brand:'openrouter',group:'OpenRouter · бесплатные'},
  'cb-glm':{name:'GLM 4.6',desc:'сверхбыстрая · код',provider:'cerebras',model:'zai-glm-4.6',brand:'glm',group:'Cerebras · быстрые'},
  'cb-gptoss':{name:'GPT-OSS 120B',desc:'OpenAI · рассуждения',provider:'cerebras',model:'gpt-oss-120b',brand:'openai',group:'Cerebras · быстрые'},
  'gemini-flash':{name:'Gemini Flash',desc:'быстрая · зрение',provider:'gemini',model:'gemini-flash-latest',brand:'gemini',group:'Google Gemini'},
  'gemini-pro':{name:'Gemini Pro',desc:'флагман · контекст 1M',provider:'gemini',model:'gemini-pro-latest',brand:'gemini',group:'Google Gemini'},
  'glm-4.6':{name:'GLM-4.6 (API)',desc:'BigModel · контекст 200K',provider:'glm',model:'glm-4.6',brand:'glm',group:'Прямые API'},
  'mistral-large':{name:'Mistral Large',desc:'универсальная',provider:'mistral',model:'mistral-large-latest',brand:'mistral',group:'Прямые API'}
};
const FALLBACK_ORDER=['or-qwen3-coder','cb-glm','gemini-flash','or-llama','glm-4.6','cb-gptoss','gemini-pro','or-deepseek','mistral-large'];
let currentModel=localStorage.getItem('dl_model')||'or-qwen3-coder';
if(!MODELS[currentModel])currentModel='or-qwen3-coder';

/* ---- backend base (same-origin by default; override for local dev) ---- */
function getApiBase(){return localStorage.getItem('dl_api')||'';}
function apiUrl(path){return getApiBase()+path;}

/* ---- auth: token in localStorage, sent as Bearer when present ---- */
function getToken(){return localStorage.getItem('dl_token')||'';}
function setToken(t){if(t)localStorage.setItem('dl_token',t);else localStorage.removeItem('dl_token');}
function authHeaders(extra){const h=Object.assign({},extra||{});const t=getToken();if(t)h['Authorization']='Bearer '+t;return h;}
async function _authReq(path,u,p){
  let res;
  try{res=await fetch(apiUrl(path),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});}
  catch(e){const er=new Error('OFFLINE');er.offline=true;throw er;}
  if(!res.ok){let d='';try{d=(await res.json()).detail||'';}catch(_){}throw new Error(d||('HTTP '+res.status));}
  const j=await res.json();setToken(j.token);return j;
}
function authRegister(u,p){return _authReq('/api/auth/register',u,p);}
function authLogin(u,p){return _authReq('/api/auth/login',u,p);}
async function authMe(){let res;try{res=await fetch(apiUrl('/api/auth/me'),{headers:authHeaders()});}catch(e){return null;}return res.ok?await res.json():null;}
async function authLogout(){try{await fetch(apiUrl('/api/auth/logout'),{method:'POST',headers:authHeaders()});}catch(e){}setToken('');}

/* ---- AI: POST /api/ai {mode, html, message, model, images?} -> {html, model, say} ---- */
async function aiGenerate(mode,html,message,model,images){
  const body={mode:mode,html:html||'',message:message,model:model};
  if(images&&images.length)body.images=images.map(a=>a&&a.data?a.data:a).slice(0,4);
  let res;
  try{res=await fetch(apiUrl('/api/ai'),{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body)});}
  catch(e){const er=new Error('OFFLINE');er.offline=true;throw er;}
  if(res.status===503){const e=new Error('NO_KEY');e.noKey=true;throw e;}
  if(!res.ok){let d='';try{d=(await res.json()).detail||'';}catch(_){}throw new Error('HTTP '+res.status+(d?': '+d:''));}
  return await res.json();
}

/* ---- SSE parse (one "data:" event block) — pure, unit-tested ---- */
function parseSSE(block){
  const line=String(block).split('\n').find(l=>l.slice(0,5)==='data:');
  if(!line)return null;
  const data=line.slice(5).trim();
  if(!data||data==='[DONE]')return null;
  try{return JSON.parse(data);}catch(_){return null;}
}
if(typeof DL!=='undefined')DL.parseSSE=parseSSE;

/* ---- streaming AI: POST /api/ai/stream -> SSE; onDelta(text) fires live ---- */
async function aiGenerateStream(mode,html,message,model,images,onDelta){
  const body={mode:mode,html:html||'',message:message,model:model};
  if(images&&images.length)body.images=images.map(a=>a&&a.data?a.data:a).slice(0,4);
  let res;
  try{res=await fetch(apiUrl('/api/ai/stream'),{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body)});}
  catch(e){const er=new Error('OFFLINE');er.offline=true;throw er;}
  if(res.status===503){const e=new Error('NO_KEY');e.noKey=true;throw e;}
  if(!res.ok){let d='';try{d=(await res.json()).detail||'';}catch(_){}throw new Error('HTTP '+res.status+(d?': '+d:''));}
  if(!res.body||!res.body.getReader)return await aiGenerate(mode,html,message,model,images); // no streaming → non-stream fallback
  const reader=res.body.getReader(),dec=new TextDecoder();let buf='',final=null;
  while(true){
    const {value,done}=await reader.read();
    if(done)break;
    buf+=dec.decode(value,{stream:true});
    let i;
    while((i=buf.indexOf('\n\n'))>=0){
      const block=buf.slice(0,i);buf=buf.slice(i+2);
      const obj=parseSSE(block);if(!obj)continue;
      if(obj.error)throw new Error(obj.error);
      if(obj.delta&&onDelta)onDelta(obj.delta);
      if(obj.done)final=obj;
    }
  }
  return final||{html:'',say:'',model:model};
}

/* ---- Projects CRUD ---- */
async function _json(method,path,body){
  let res;
  try{res=await fetch(apiUrl(path),{method:method,headers:authHeaders(body?{'Content-Type':'application/json'}:undefined),body:body?JSON.stringify(body):undefined});}
  catch(e){const er=new Error('OFFLINE');er.offline=true;throw er;}
  if(!res.ok){let d='';try{d=(await res.json()).detail||'';}catch(_){}throw new Error('HTTP '+res.status+(d?': '+d:''));}
  return res.status===204?null:await res.json();
}
function projectsList(){return _json('GET','/api/projects');}
function projectSave(p){return _json('POST','/api/projects',p);}
function projectLoad(id){return _json('GET','/api/projects/'+encodeURIComponent(id));}
function projectDelete(id){return _json('DELETE','/api/projects/'+encodeURIComponent(id));}

/* ---- optional server-side audit (falls back to local runAudit) ---- */
async function serverAudit(html){
  try{const res=await fetch(apiUrl('/api/audit'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:html})});
    if(res.ok)return await res.json();}catch(e){}
  return runAudit(html);
}

/* ---- model picker ---- */
/* ============================================================
   MODEL PICKER
   ============================================================ */
function buildModelMenu(){
  const groups={},order=[];
  Object.keys(MODELS).forEach(k=>{const g=MODELS[k].group||'Другие';if(!groups[g]){groups[g]=[];order.push(g);}groups[g].push(k);});
  let h='';
  order.forEach(g=>{
    h+='<div class="mh">'+g+'</div>';
    groups[g].forEach(k=>{const m=MODELS[k];const av=AV[m.brand]||AV.openrouter;
      h+='<div class="mopt'+(k===currentModel?' sel':'')+'" onclick="pickModel(\''+k+'\')">'
        +'<div class="mi" style="background:'+av.bg+'">'+av.svg+'</div><div class="minfo"><div class="mn">'+m.name+'</div><div class="md2">'+m.desc+'</div></div>'
        +'<svg class="tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>';
    });
  });
  h+='<div class="mfoot"><div class="lbl">Нет своих ключей? Открой «Ключи ИИ» вверху, чтобы вставить свои.</div><button class="btn-line" style="width:100%" onclick="openSettings()">Настроить ключи и прокси</button></div>';
  document.getElementById('modelMenu').innerHTML=h;
  document.getElementById('mpLabel').textContent=MODELS[currentModel].name;
  const pav=document.getElementById('mpAv');
  if(pav){const av2=AV[MODELS[currentModel].brand]||AV.openrouter;pav.style.background=av2.bg;pav.innerHTML=av2.svg;}
}
function toggleModelMenu(e){if(e)e.stopPropagation();const mm=document.getElementById('modelMenu');const open=mm.classList.toggle('on');document.getElementById('modelPill').classList.toggle('open',open);}
function pickModel(k){currentModel=k;localStorage.setItem('dl_model',k);buildModelMenu();document.getElementById('modelMenu').classList.remove('on');document.getElementById('modelPill').classList.remove('open');toast('Модель: '+MODELS[k].name);}

/* ---- offline demo transform (no backend) ---- */
function demoTransform(req,html){
  if(!html)return null;const r=req.toLowerCase();let out=html;
  const hueMap=[['красн',0],['оранж',30],['жёлт',60],['желт',60],['зелен',120],['голуб',190],['син',220],['фиолет',270],['розов',320]];
  let deg=null;for(const h of hueMap){if(r.indexOf(h[0])>-1){deg=h[1];break;}}
  let css='';
  if(deg!==null)css+='html{filter:hue-rotate('+deg+'deg) saturate(1.15)!important}';
  if(r.indexOf('тёмн')>-1||r.indexOf('темн')>-1)css+='body{background:#0a0a0b!important;color:#f2f3f5!important}';
  if(r.indexOf('светл')>-1)css+='body{background:#f4f2ee!important;color:#141414!important}';
  const q=req.match(/[«"']([^»"']{2,80})[»"']/);
  if(q)out=out.replace(/(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i,'$1'+q[1].replace(/\$/g,'$$$$')+'$3');
  if(css){if(/<\/head>/i.test(out))out=out.replace(/<\/head>/i,'<style>'+css+'</style></head>');else out='<style>'+css+'</style>'+out;}
  return out;
}

/* ---- settings modal (backend URL + default model) ---- */
function openSettings(){
  const base=getApiBase();
  let body='<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Ключи ИИ теперь живут на <b>сервере</b> (в <code>.env</code>), а не в коде сайта. Здесь можно указать адрес бэкенда, если фронтенд открыт отдельно.</p>';
  body+='<label class="k">Адрес бэкенда (пусто = тот же домен)</label><input class="fld" id="setApi" placeholder="http://localhost:8000" value="'+escapeHtml(base)+'">';
  document.getElementById('mdTitle').textContent='Настройки';
  document.getElementById('mdText').textContent='Design&Lab обращается к бэкенду за генерацией и хранением проектов.';
  document.getElementById('mdBody').innerHTML=body;
  document.getElementById('mdBtn').style.display='';document.getElementById('mdBtn').textContent='Сохранить';document.getElementById('mdBtn').onclick=saveSettings;
  document.getElementById('modal').classList.add('on');
}
function saveSettings(){
  const v=(document.getElementById('setApi').value||'').trim().replace(/\/+$/,'');
  if(v)localStorage.setItem('dl_api',v);else localStorage.removeItem('dl_api');
  closeModal();toast('Настройки сохранены');
}
