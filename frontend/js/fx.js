/* Design&Lab — fx: ambient visual layer (custom cursor, stars, scroll bar,
   parallax, card tilt, magnetic buttons). Pure decoration, no app logic.
   All effects respect prefers-reduced-motion and pointer capabilities. */
"use strict";

/* ===== custom cursor (dot + ring + glow, trails, click ripple) ===== */
(function(){
  if(!window.matchMedia||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
  const dot=document.getElementById('cursorDot'),ring=document.getElementById('cursorRing'),glow=document.getElementById('cursorGlow');
  if(!dot||!ring||!glow)return;
  document.documentElement.classList.add('cursor-on');
  let mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my,gx=mx,gy=my,last=0;
  addEventListener('mousemove',e=>{
    mx=e.clientX;my=e.clientY;
    if(dot.style.opacity==='0'){dot.style.opacity='';ring.style.opacity='';glow.style.opacity='';}
    dot.style.transform='translate('+mx+'px,'+my+'px)';
    const now=Date.now();
    if(now-last>26){last=now;const t=document.createElement('div');t.className='cursor-trail';t.style.transform='translate('+mx+'px,'+my+'px)';document.body.appendChild(t);setTimeout(()=>t.remove(),650);}
  },{passive:true});
  (function loop(){rx+=(mx-rx)*.18;ry+=(my-ry)*.18;gx+=(mx-gx)*.09;gy+=(my-gy)*.09;ring.style.transform='translate('+rx+'px,'+ry+'px)';glow.style.transform='translate('+gx+'px,'+gy+'px)';requestAnimationFrame(loop);})();
  const sel='a,button,input,textarea,.card,.model-pill,.mopt,.seg button,.nav-links button,.divider,.tool-btn,[role=button]';
  addEventListener('mouseover',e=>{if(e.target.closest&&e.target.closest(sel))document.body.classList.add('cursor-hover');},{passive:true});
  addEventListener('mouseout',e=>{if(e.target.closest&&e.target.closest(sel)){const to=e.relatedTarget;if(!(to&&to.closest&&to.closest(sel)))document.body.classList.remove('cursor-hover');}},{passive:true});
  addEventListener('mousedown',e=>{document.body.classList.add('cursor-down');const r=document.createElement('div');r.className='click-ripple';r.style.left=e.clientX+'px';r.style.top=e.clientY+'px';document.body.appendChild(r);setTimeout(()=>r.remove(),650);},{passive:true});
  addEventListener('mouseup',()=>document.body.classList.remove('cursor-down'),{passive:true});
  addEventListener('mouseleave',()=>{dot.style.opacity=0;ring.style.opacity=0;glow.style.opacity=0;});
  addEventListener('mouseenter',()=>{dot.style.opacity=1;ring.style.opacity=1;glow.style.opacity=1;});
  /* keep the dot alive over the preview iframe by bridging its mouse events */
  function bridgeFrame(f){
    try{
      const doc=f.contentDocument;
      if(!doc||doc.__dlCursorBridge)return;
      doc.__dlCursorBridge=true;
      let st=null;
      try{st=doc.createElement('style');st.textContent='*{cursor:none!important}';(doc.head||doc.documentElement).appendChild(st);}catch(err){}
      let ownCur=false,ownAt=0;
      function hasOwnCursor(){const now=Date.now();if(now-ownAt<1000)return ownCur;ownAt=now;try{ownCur=!!doc.querySelector('#cursorDot,#cursorRing,#cursor-dot,#customCursor,.custom-cursor,.cursor-follower');}catch(e){ownCur=false;}try{if(st)st.disabled=ownCur;}catch(e){}return ownCur;}
      function fwd(type,e){try{const r=f.getBoundingClientRect();const sx=f.clientWidth?r.width/f.clientWidth:1,sy=f.clientHeight?r.height/f.clientHeight:1;dispatchEvent(new MouseEvent(type,{clientX:r.left+e.clientX*sx,clientY:r.top+e.clientY*sy}));}catch(err){}}
      doc.addEventListener('mousemove',e=>{if(hasOwnCursor()){dot.style.opacity=0;ring.style.opacity=0;glow.style.opacity=0;return;}dot.style.opacity=1;ring.style.opacity=1;glow.style.opacity=1;fwd('mousemove',e);},{passive:true});
      doc.addEventListener('mousedown',e=>{if(!hasOwnCursor())fwd('mousedown',e);},{passive:true});
      doc.addEventListener('mouseup',e=>{if(!hasOwnCursor())fwd('mouseup',e);},{passive:true});
    }catch(err){}
  }
  setInterval(()=>{const fs=document.querySelectorAll('iframe');for(let i=0;i<fs.length;i++)bridgeFrame(fs[i]);},700);
})();

/* ===== twinkling stars in the background field ===== */
(function(){
  const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;
  const wrap=document.getElementById('stars');
  if(!wrap||reduce)return;
  const frag=document.createDocumentFragment();
  for(let i=0;i<38;i++){
    const s=document.createElement('div');s.className='st';
    const sz=(Math.random()*2.4+1).toFixed(2);
    s.style.width=sz+'px';s.style.height=sz+'px';
    s.style.left=(Math.random()*100).toFixed(2)+'%';
    s.style.top=(Math.random()*100).toFixed(2)+'%';
    s.style.animationDuration=(Math.random()*4+3).toFixed(2)+'s,'+(Math.random()*6+7).toFixed(2)+'s';
    s.style.animationDelay=(Math.random()*6).toFixed(2)+'s,'+(Math.random()*6).toFixed(2)+'s';
    frag.appendChild(s);
  }
  wrap.appendChild(frag);
})();

/* ===== scroll progress bar + mouse parallax + card tilt + magnetic CTAs ===== */
(function(){
  const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;
  const fine=window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches;
  const bar=document.createElement('div');bar.id='scrollBar';document.body.appendChild(bar);
  function upBar(){const h=document.documentElement;const max=(h.scrollHeight-h.clientHeight)||1;bar.style.width=Math.min(100,(h.scrollTop/max)*100)+'%';}
  addEventListener('scroll',upBar,{passive:true});upBar();
  if(!fine||reduce)return;
  const fx=document.querySelector('.bg-fx');
  if(fx)addEventListener('mousemove',e=>{const x=(e.clientX/innerWidth)*2-1,y=(e.clientY/innerHeight)*2-1;fx.style.setProperty('--mx',x.toFixed(3));fx.style.setProperty('--my',y.toFixed(3));},{passive:true});
  /* 3D tilt on gallery cards */
  document.addEventListener('mousemove',e=>{const c=e.target.closest&&e.target.closest('.card[data-n]');if(!c)return;const r=c.getBoundingClientRect();const px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;c.style.transform='perspective(950px) rotateX('+(-py*5).toFixed(2)+'deg) rotateY('+(px*7).toFixed(2)+'deg) translateY(-4px)';},true);
  document.addEventListener('mouseout',e=>{const c=e.target.closest&&e.target.closest('.card[data-n]');if(!c)return;const to=e.relatedTarget;if(to&&c.contains(to))return;c.style.transform='';},true);
  /* magnetic pull on primary buttons */
  const mag='.btn-solid,.btn-grad,.btn-line,.plan .pick';
  document.addEventListener('mousemove',e=>{const b=e.target.closest&&e.target.closest(mag);if(!b)return;const r=b.getBoundingClientRect();const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);b.style.transform='translate('+(dx*.12).toFixed(1)+'px,'+(dy*.2).toFixed(1)+'px)';},true);
  document.addEventListener('mouseout',e=>{const b=e.target.closest&&e.target.closest(mag);if(!b)return;const to=e.relatedTarget;if(to&&b.contains(to))return;b.style.transform='';},true);
})();
