/* Design&Lab — editor: preview, chat (talks to /api/ai), attachments UI, voice, modal, projects. */
/* ============================================================
   EDITOR core
   ============================================================ */
let current={id:null,html:null,scratch:false,project:null}; // project: {files, entry, startCmd}
let busy=false;

function openEditor(n,pending){
  current={id:n,html:null,scratch:false,project:null};
  document.getElementById('tplName').textContent=tplTitle(n);
  document.getElementById('landing').style.display='none';
  document.getElementById('editor').classList.add('on');
  document.getElementById('suggests').style.display='flex';
  document.getElementById('msgs').innerHTML='';
  setMode('preview');
  var _rb0=document.getElementById('runLiveBtn');if(_rb0)_rb0.style.display='none';
  addAI('Это шаблон <b>'+escapeHtml(tplTitle(n))+'</b>. Опиши, что изменить — текст, цвета, шрифты, разделы. Я перепишу его, а справа всё обновится. Хочешь — нажми «Проверить сайт», прогоню аудит.');
  document.getElementById('pvUrl').textContent=tplPageUrl(n);
  setDevice('desktop');
  loadPreviewLive(n);
  fetchSource(n);
  location.hash='editor/v'+n;
  if(pending){document.getElementById('chatInput').value=pending;autoGrow();setTimeout(sendMessage,700);}
}
function openScratch(pending){
  current={id:null,html:starterHtml(),scratch:true,project:null};
  document.getElementById('tplName').textContent='Новый сайт с нуля';
  document.getElementById('landing').style.display='none';
  document.getElementById('editor').classList.add('on');
  document.getElementById('suggests').style.display='none';
  document.getElementById('msgs').innerHTML='';
  setMode('preview');
  var _rb1=document.getElementById('runLiveBtn');if(_rb1)_rb1.style.display='none';
  addAI('Начнём с чистого листа. Опиши подробно: тема, разделы, стиль, цвета — и я соберу сайт с нуля по крафт-планке качества.');
  renderHtml(current.html);
  document.getElementById('pvUrl').textContent='новый сайт';
  setDevice('desktop');
  location.hash='editor/new';
  if(pending){document.getElementById('chatInput').value=pending;autoGrow();setTimeout(sendMessage,500);}
}
function starterHtml(){return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Новый сайт</title><style>*{margin:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0a0b;color:#f2f3f5;text-align:center;padding:24px}h1{font-size:clamp(32px,7vw,64px);font-weight:600;letter-spacing:-.03em;background:linear-gradient(110deg,#a9adba,#fff 40%,#a9adba);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}p{color:rgba(242,243,245,.55);margin-top:16px}</style></head><body><div><h1>Чистый холст</h1><p>Опиши сайт в чате — и он появится здесь.</p></div></body></html>';}
function closeEditor(){document.getElementById('editor').classList.remove('on');document.getElementById('landing').style.display='';document.getElementById('audit').classList.remove('on');location.hash='';}
function loadPreviewLive(n){const f=document.getElementById('pvFrame');showLoading('Загружаю шаблон…');f.removeAttribute('srcdoc');f.src=tplPageUrl(n);f.onload=hideLoading;setTimeout(hideLoading,4000);}
function fetchSource(n){fetch(tplRawUrl(n)).then(r=>r.ok?r.text():Promise.reject(r.status)).then(t=>{current.html=t;syncCode();}).catch(()=>{current.html=null;});}
function showLoading(t){document.getElementById('pvLoadingLbl').textContent=t||'Загружаю…';document.getElementById('pvLoading').classList.add('on');}
function hideLoading(){document.getElementById('pvLoading').classList.remove('on');}
function renderHtml(html){const f=document.getElementById('pvFrame');f.removeAttribute('src');f.srcdoc=html;const lbl=current.scratch?'новый сайт (черновик)':current.project?current.project.entry:(tplTitle(current.id)+' (изменён)');document.getElementById('pvUrl').textContent=lbl;syncCode();}
function reloadPreview(){if(current.html)renderHtml(current.html);else if(current.id)loadPreviewLive(current.id);}
function syncCode(){const cv=document.getElementById('codeView');if(cv)cv.value=current.html||'';}
function setMode(m){document.getElementById('preview').classList.toggle('code',m==='code');document.getElementById('modePreviewBtn').classList.toggle('on',m==='preview');document.getElementById('modeCodeBtn').classList.toggle('on',m==='code');if(m==='code')syncCode();}
function setDevice(d){const st=document.getElementById('pvStage');st.classList.toggle('mobile',d==='mobile');st.classList.toggle('tablet',d==='tablet');document.getElementById('segDesk').classList.toggle('on',d==='desktop');document.getElementById('segTab').classList.toggle('on',d==='tablet');document.getElementById('segMob').classList.toggle('on',d==='mobile');}
function openInNewTab(){if(current.html){const b=new Blob([current.html],{type:'text/html'});window.open(URL.createObjectURL(b),'_blank');}else if(current.id){window.open(tplPageUrl(current.id),'_blank');}}
function downloadCurrent(){const html=current.html;if(!html){toast('Сначала сделай хотя бы одну правку');return;}const b=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='index.html';a.click();toast('Скачано: index.html');}

/* ============================================================
   CHAT
   ============================================================ */
let attachments=[];
function addUser(t,atts){
  const d=document.createElement('div');d.className='msg user';let h='';
  if(atts&&atts.length){h+='<div class="u-atts">'+atts.map(a=>a.kind==='image'?'<img src="'+String(a.data).replace(/"/g,'&quot;')+'" alt="">':'<span class="fchip">&lt;/&gt; '+escapeHtml(a.name)+'</span>').join('')+'</div>';}
  if(t)h+='<div class="txt"></div>';
  d.innerHTML=h;if(t)d.querySelector('.txt').textContent=t;
  document.getElementById('msgs').appendChild(d);scrollMsgs();
}
function addAI(body,isErr){const d=document.createElement('div');d.className='msg ai'+(isErr?' err':'');d.innerHTML='<div class="who"><span class="d"></span>ИИ · '+escapeHtml(MODELS[currentModel].name)+'</div><div class="body">'+body+'</div>';document.getElementById('msgs').appendChild(d);scrollMsgs();return d;}
function addTyping(){const d=document.createElement('div');d.className='msg ai';d.innerHTML='<div class="who"><span class="d"></span>ИИ · '+escapeHtml(MODELS[currentModel].name)+'</div><div class="body"><span class="typing"><i></i><i></i><i></i></span></div>';document.getElementById('msgs').appendChild(d);scrollMsgs();return d;}
function startThink(title){
  const d=document.createElement('div');d.className='msg think';
  d.innerHTML='<div class="think-box"><div class="think-head"><span class="sp2"></span><span class="tt"></span><svg class="chv" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></div><div class="think-log"></div></div>';
  d.querySelector('.tt').textContent=title;
  document.getElementById('msgs').appendChild(d);scrollMsgs();
  const box=d.querySelector('.think-box'),log=d.querySelector('.think-log'),head=d.querySelector('.think-head');let n=0;
  head.addEventListener('click',()=>box.classList.toggle('folded'));
  return {
    line:(txt,cls,ic)=>{const l=document.createElement('div');l.className='tline '+(cls||'');l.innerHTML='<span class="ic">'+(ic||'·')+'</span><span></span>';l.lastChild.textContent=txt;log.appendChild(l);log.scrollTop=log.scrollHeight;n++;scrollMsgs();},
    done:(t)=>{head.classList.add('done');head.querySelector('.sp2').textContent='✓';head.querySelector('.tt').textContent=t||('Готово · '+n+' шагов');setTimeout(()=>box.classList.add('folded'),1300);},
    fail:(t)=>{head.classList.add('done');head.querySelector('.sp2').textContent='⚠';head.querySelector('.tt').textContent=t;}
  };
}
function scrollMsgs(){const m=document.getElementById('msgs');m.scrollTop=m.scrollHeight;}
function quick(t){document.getElementById('chatInput').value=t;autoGrow();sendMessage();}
function autoGrow(){const ta=document.getElementById('chatInput');ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,150)+'px';}

async function sendMessage(){
  if(busy)return;const ta=document.getElementById('chatInput');const text=ta.value.trim();
  if(!text&&!attachments.length)return;
  const atts=attachments.slice();
  ta.value='';autoGrow();document.getElementById('suggests').style.display='none';
  addUser(text,atts);attachments=[];renderAttachStrip();
  busy=true;document.getElementById('sendBtn').disabled=true;

  // intent: audit
  if(/провер|аудит|безопас|уязвим|баг|дыр|тест/i.test(text)&&current.html){
    const th=startThink('Прогоняю аудит…');
    ['Ищу утёкшие ключи и секреты','Проверяю мета-теги и семантику','Смотрю XSS и внешние скрипты','Оцениваю доступность'].forEach((s,i)=>setTimeout(()=>th.line(s,'act','›'),200*(i+1)));
    await sleep(1000);
    const rep=runAudit(current.html);
    th.done('Аудит готов · '+rep.items.length+' проверок');
    openAudit();renderAudit(rep);
    addAI('Аудит завершён: <b>'+rep.score+'/100</b>. '+rep.summary+' Панель открыта справа.');
    busy=false;document.getElementById('sendBtn').disabled=false;return;
  }

  const th=startThink('Думаю над дизайном…');
  const imgs=atts.filter(a=>a.kind==='image');
  const htmlAtt=atts.find(a=>a.kind==='html');
  if(imgs.length)th.line(imgs.length+' скриншот(ов) → распознаю текст через OCR.space (его увидит любая модель)','act','▣');
  if(htmlAtt){th.line('Взял приложенный HTML как основу','act','⎘');current.html=htmlAtt.data;current.scratch=false;}
  th.line('Формирую промпт с крафт-планкой (impeccable)','act','✎');

  try{
    const baseHtml=current.html||(current.id?await tryFetch(current.id):starterHtml());
    let userText=text;
    if(imgs.length)userText+='\n\n[Пользователь приложил '+imgs.length+' изображение(й) как визуальный референс — учти стиль/структуру.]';
    th.line('Стримлю ответ · модель '+MODELS[currentModel].name,'act','⇅');
    let acc='',lastRender=0;
    const data=await aiGenerateStream(current.scratch?'scratch':'edit',baseHtml,userText,currentModel,imgs,delta=>{
      acc+=delta;const now=Date.now();
      if(now-lastRender>350){lastRender=now;const partial=extractHtml(acc);if(partial&&partial.length>120){current.html=partial;renderHtml(partial);}}
    });
    const html=extractHtml((data&&data.html)||acc);
    if(html&&html.length>60){
      current.html=html;current.project=null;renderHtml(html);
      th.done('Готово — применил изменения');
      const rep=runAudit(html);
      addAI('Готово ✓ Применил изменения. Аудит: <b>'+rep.score+'/100</b>'+(rep.high?' — есть '+rep.high+' важных замечаний, открой панель «щит».':' — критичных проблем нет.'));
      setAuditBadge(rep);
    }else{
      th.fail('Пустой ответ модели');
      addAI(escapeHtml((data.say||'').slice(0,500))||'Модель вернула пустой ответ. Попробуй переформулировать.',true);
    }
  }catch(err){
    const reason=String(err&&err.message||err);
    const demo=demoTransform(text,current.html);if(demo){current.html=demo;renderHtml(demo);}
    if(err&&err.offline){
      th.fail('Бэкенд недоступен');
      addAI('🔌 Бэкенд не отвечает. Запусти сервер: <code>uvicorn backend.main:app --reload</code> и открой сайт через него (http://localhost:8000). Пока показал <b>демо-правку</b> локально.',true);
    }else if(err&&err.noKey){
      th.fail('Ключ ИИ не задан на сервере');
      addAI('🔑 На сервере не задан ключ модели. Добавь <code>AI_API_KEY</code> в <code>.env</code> и перезапусти бэкенд. Пока показал демо-правку.',true);
    }else{
      th.fail('Ошибка: '+reason);
      addAI('⚠️ '+escapeHtml(reason)+'<br><br>Показал демо-правку локально.',true);
    }
  }finally{busy=false;document.getElementById('sendBtn').disabled=false;}
}
async function tryFetch(n){try{const r=await fetch(tplRawUrl(n));if(r.ok)return await r.text();}catch(e){}return starterHtml();}

/* ============================================================
   VOICE (optional)
   ============================================================ */
let recog=null,recOn=false;
function toggleVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;const btn=document.getElementById('micBtn');
  if(!SR){toast('Голосовой ввод не поддерживается в этом браузере');return;}
  if(recOn){try{recog.stop();}catch(e){}return;}
  recog=new SR();recog.lang='ru-RU';recog.continuous=true;recog.interimResults=true;
  const ta=document.getElementById('chatInput');const base=ta.value?ta.value.replace(/\s+$/,'')+' ':'';
  recog.onstart=()=>{recOn=true;btn.classList.add('rec');toast('🎙 Говори — нажми ещё раз, чтобы остановить');};
  recog.onresult=e=>{let t='';for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript;ta.value=base+t;autoGrow();};
  recog.onerror=e=>toast('Микрофон: '+(e.error==='not-allowed'?'нет доступа':e.error));
  recog.onend=()=>{recOn=false;btn.classList.remove('rec');};
  try{recog.start();}catch(e){toast('Не удалось запустить микрофон');}
}

/* ============================================================
   MODAL / MISC
   ============================================================ */
function openModal(title,text,btn){document.getElementById('mdTitle').textContent=title;document.getElementById('mdText').textContent=text;document.getElementById('mdBody').innerHTML='';var _b=document.getElementById('mdBtn');_b.style.display='';_b.textContent=btn||'Ок';_b.onclick=closeModal;document.getElementById('modal').classList.add('on');}
function closeModal(){document.getElementById('modal').classList.remove('on');}
function startFromHero(){const p=document.getElementById('heroPrompt').value.trim();scrollTo2('gallery');if(p){window._pending=p;toast('Выбери шаблон — твой запрос сохранён');}}
function startScratchFromHero(){const p=document.getElementById('heroPrompt').value.trim();openScratch(p||null);}

/* ===== AUTH UI (private projects when backend AUTH_ENABLED) ===== */
function openAuth(){
  const body='<label class="k">Логин</label><input class="fld" id="authUser" placeholder="alice" autocomplete="username">'
    +'<label class="k">Пароль</label><input class="fld" id="authPass" type="password" placeholder="••••••" autocomplete="current-password">'
    +'<div style="display:flex;gap:8px;margin-top:4px"><button class="btn-line" style="flex:1" onclick="doAuth(false)">Войти</button><button class="btn-grad" style="flex:1" onclick="doAuth(true)">Регистрация</button></div>';
  document.getElementById('mdTitle').textContent='Вход в Design&Lab';
  document.getElementById('mdText').textContent='Войди, чтобы проекты были приватными и хранились на сервере.';
  document.getElementById('mdBody').innerHTML=body;
  document.getElementById('mdBtn').style.display='none';
  document.getElementById('modal').classList.add('on');
}
async function doAuth(reg){
  const u=(document.getElementById('authUser').value||'').trim();
  const p=document.getElementById('authPass').value||'';
  if(!u||!p){toast('Введи логин и пароль');return;}
  try{const j=reg?await authRegister(u,p):await authLogin(u,p);toast('Привет, '+j.username+'!');closeModal();refreshAuthUI();}
  catch(e){toast(e&&e.offline?'Бэкенд недоступен':(''+(e.message||'Ошибка входа')));}
}
async function logoutUI(){await authLogout();refreshAuthUI();toast('Вышел из аккаунта');}
async function refreshAuthUI(){
  const btn=document.getElementById('authBtn');if(!btn)return;
  const me=getToken()?await authMe():null;
  if(me){btn.textContent=me.username;btn.title='Выйти';btn.onclick=logoutUI;}
  else{btn.textContent='Войти';btn.title='Войти / регистрация';btn.onclick=openAuth;}
}

/* divider drag */

/* ===== PROJECTS (server CRUD) ===== */
async function saveProject(){
  if(!current||!current.html){toast('Нечего сохранять');return;}
  const name=(current.projectName)|| (document.getElementById('tplName').textContent||'Проект');
  try{
    const saved=await projectSave({id:current.projectId||null,name:name,html:current.html,kind:current.scratch?'scratch':(current.id?'template':'project')});
    current.projectId=saved.id;current.projectName=saved.name;
    toast('Проект сохранён: '+saved.name);
  }catch(e){toast(e&&e.offline?'Бэкенд недоступен — проект не сохранён':'Не удалось сохранить проект');}
}
async function openProjects(){
  let list=[];
  try{list=await projectsList();}catch(e){toast(e&&e.offline?'Бэкенд недоступен':'Ошибка загрузки');return;}
  let body;
  if(!list.length)body='<p style="color:var(--faint)">Пока нет сохранённых проектов. Нажми «Сохранить» в редакторе.</p>';
  else body=list.map(p=>'<div style="display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px"><div style="flex:1;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escapeHtml(p.name)+'</div><div style="font-size:11px;color:var(--faint);font-family:var(--mono)">'+escapeHtml(p.kind||'')+' · '+escapeHtml((p.updated||'').slice(0,16).replace('T',' '))+'</div></div><button class="btn-line" onclick="loadProject(\''+p.id+'\')">Открыть</button><button class="icon-btn" style="width:32px;height:32px" title="Удалить" onclick="delProject(\''+p.id+'\')">✕</button></div>').join('');
  document.getElementById('mdTitle').textContent='Мои проекты';
  document.getElementById('mdText').textContent='Сохранённые на сервере схемы. Открой, чтобы продолжить правки.';
  document.getElementById('mdBody').innerHTML=body;
  document.getElementById('mdBtn').style.display='';document.getElementById('mdBtn').textContent='Закрыть';document.getElementById('mdBtn').onclick=closeModal;
  document.getElementById('modal').classList.add('on');
}
async function loadProject(id){
  try{const p=await projectLoad(id);current={id:null,html:p.html,scratch:p.kind==='scratch',project:null,projectId:p.id,projectName:p.name};
    if(!document.getElementById('editor').classList.contains('on')){document.getElementById('landing').style.display='none';document.getElementById('editor').classList.add('on');}
    document.getElementById('tplName').textContent=p.name;document.getElementById('msgs').innerHTML='';document.getElementById('suggests').style.display='none';
    setMode('preview');renderHtml(p.html);document.getElementById('pvUrl').textContent=p.name;setDevice('desktop');
    addAI('Загрузил проект <b>'+escapeHtml(p.name)+'</b>. Продолжай правки в чате.');closeModal();
  }catch(e){toast('Не удалось открыть проект');}
}
async function delProject(id){try{await projectDelete(id);toast('Удалено');openProjects();}catch(e){toast('Не удалось удалить');}}
