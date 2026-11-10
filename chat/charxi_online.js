/* charxi_online.js - page logic for charxi_online.html (split out of the inline <script> block). */
"use strict";
/* ================= storage ================= */
const LS={apiKey:"gochat_apiKey",model:"gochat_model",fs:"gochat_fontSize",roles:"gochat_roles",chats:"gochat_chats",roleId:"gochat_activeRoleId",mode:"gochat_mode",think:"gochat_think",length:"gochat_length",voice:"gochat_voice",voiceSpeed:"gochat_voiceSpeed",personas:"gochat_personas",activePersonaId:"gochat_activePersonaId",sidebarTab:"gochat_sidebarTab",storyUi:"gochat_storyUi",storySel:"gochat_storySelection"};
const $=id=>document.getElementById(id);
const loadJSON=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
const saveJSON=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.warn("save failed (quota?)",e)}};
const getRoles=()=>loadJSON(LS.roles,[]);
const saveRoles=r=>saveJSON(LS.roles,r);
const getChats=()=>loadJSON(LS.chats,{});
const saveChats=c=>saveJSON(LS.chats,c);
const getPersonas=()=>loadJSON(LS.personas,[]);
const savePersonas=p=>saveJSON(LS.personas,p);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const OR="https://openrouter.ai/api/v1";
let state={apiKey:"",model:"",roles:[],chats:{},activeRoleId:null,mode:"chat",busy:false,models:[],filtered:[],think:false,length:null,voice:false,voiceSpeed:1.0,personas:[],activePersonaId:null,sidebarTab:"roles",storyUi:{},storySelection:null};
const currentRole=()=>state.roles.find(r=>r.id===state.activeRoleId)||null;
const currentHistory=()=>state.activeRoleId?(state.chats[state.activeRoleId]||[]):[];
const currentPersona=()=>state.mode==="story"?null:(state.personas.find(p=>p.id===state.activePersonaId)||null);
function applyFontSize(px){document.documentElement.style.setProperty("--fs",px+"px");localStorage.setItem(LS.fs,String(px));$("fsVal").textContent=px+"px";$("fontSize").value=px;}
function sidebarTitleFor(){return state.mode==="story"?"📖 Story":"🧑‍🎭 Chat";}
function sidebarSubtitleFor(){return state.mode==="story"?"Tap a story to expand it, then a character or story element. Chats resume where you left off.":"Tap a role to chat. Chats resume where you left off.";}
function personasAvailable(){return state.mode!=="story";}
function setSidebarTab(tab){
  if(tab==="personas"&&!personasAvailable())tab="roles";
  state.sidebarTab=tab;localStorage.setItem(LS.sidebarTab,tab);const isRoles=tab==="roles";
  const showPersonasTab=personasAvailable();
  if($("tabPersonas"))$("tabPersonas").classList.toggle("hidden",!showPersonasTab);
  $("tabRoles").classList.toggle("active",isRoles);$("tabRoles").setAttribute("aria-selected",isRoles);$("tabPersonas").classList.toggle("active",!isRoles);$("tabPersonas").setAttribute("aria-selected",!isRoles);$("rolesPanel").classList.toggle("hidden",!isRoles);$("personasPanel").classList.toggle("hidden",isRoles);$("tabRoles").textContent=sidebarTitleFor();$("sidebarTitle").textContent=isRoles?sidebarTitleFor():"👥 Personas";$("sidebarSubtitle").textContent=isRoles?sidebarSubtitleFor():"Tap a persona to select it. The active persona is applied to all chats.";if(isRoles)renderRoles();else renderPersonas();
}
/* ================= views ================= */
function showSetup(){$("setupView").classList.remove("hidden");$("chatView").classList.add("hidden");}
function showChat(){$("setupView").classList.add("hidden");$("chatView").classList.remove("hidden");}
function primeSetup(){$("apiKey").value=state.apiKey||"";$("modelSelect").value=state.model||"";$("thinkToggle").checked=!!state.think;$("voiceToggle").checked=!!state.voice;applyFontSize(parseInt(localStorage.getItem(LS.fs)||"16",10)||16);}
/* ================= models (setup) ================= */
function setSetupMsg(t,cls){const m=$("setupMsg");m.textContent=t;m.className=cls||"";}
async function loadModels(){
  const key=$("apiKey").value.trim();
  if(!key){setSetupMsg("⚠️ Type your OpenRouter API key first (top field).","err");return;}
  const btn=$("loadModels");btn.disabled=true;btn.textContent="Loading…";setSetupMsg("Loading models from OpenRouter…");
  try{
    const r=await fetch(OR+"/models",{headers:{Authorization:"Bearer "+key}});
    if(!r.ok)throw new Error("HTTP "+r.status+(r.status===401?" — bad key":""));
    const j=await r.json();state.models=(j.data||[]).map(m=>m.id).sort();
    if(!state.models.length)throw new Error("No models returned.");
    applyFilter();setSetupMsg("✅ "+state.models.length+" models loaded. Use the filter, then click a model.","ok");
  }catch(e){setSetupMsg("❌ Couldn't load models: "+e.message,"err");}
  btn.disabled=false;btn.textContent="Load Models";
}
function applyFilter(){
  const q=$("modelFilter").value.trim().toLowerCase();
  state.filtered=q?state.models.filter(id=>id.toLowerCase().includes(q)):state.models.slice();
  const box=$("modelList");const sel=$("modelSelect");
  sel.innerHTML='<option value="">Select a model…</option>'+(state.model?`<option value="${esc(state.model)}">${esc(state.model)}</option>`:"");
  state.filtered.forEach(id=>{const o=document.createElement("option");o.value=id;o.textContent=id;sel.appendChild(o);});
  if(state.model){sel.value=state.model;}
  box.innerHTML=state.filtered.length?state.filtered.slice(0,400).map(id=>`<button type="button" data-m="${esc(id)}" class="${id===sel.value?"sel":""}">${esc(id)}</button>`).join(""):'<div class="empty">No models match your filter.</div>';
  box.querySelectorAll("button[data-m]").forEach(b=>b.onclick=()=>{pickModel(b.dataset.m);});
}
function pickModel(id){
  if(!id)return;
  state.model=id;const sel=$("modelSelect");
  if(!sel.querySelector(`option[value="${CSS.escape(id)}"]`)){const o=document.createElement("option");o.value=id;o.textContent=id;sel.appendChild(o);}
  sel.value=id;
  $("modelList").querySelectorAll("button").forEach(x=>x.classList.toggle("sel",x.dataset.m===id));
  setSetupMsg("✅ Model: "+id);
}
function validateModel(){
  const id=$("modelSelect").value.trim();
  if(!id)return {ok:false,msg:"⚠️ Pick a model — click Load Models, filter, then choose one (or type a model id below)."};
  if(state.models.length&&!state.models.includes(id))return {ok:false,msg:"❌ '"+id+"' isn't in the list of models OpenRouter returned — check the spelling (e.g. google/gemma-3-4b-it)."};
  return {ok:true,msg:""};
}
/* ================= gist → role ================= */
function gistIdFromUrl(url){const m=String(url||"").trim().match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]{20,})/i);if(m)return m[1];const m2=String(url||"").trim().match(/^[a-f0-9]{20,}$/i);return m2?m2[0]:null;}
function parseName(filename){const base=filename.replace(/\.(txt|md)$/i,"").replace(/^(GOCHATAPPROLETAG_|GOCHATAPPSTORYTAG_|character_|storyelement_)/i,"").trim();return humanizeSlug(base)||"Role";}
function humanizeSlug(s){return String(s||"").replace(/[_-]+/g," ").trim().replace(/\b\w/g,c=>c.toUpperCase());}
function getStoryUi(){if(!state.storyUi||typeof state.storyUi!=="object"||Array.isArray(state.storyUi))state.storyUi={};return state.storyUi;}
function saveStoryUi(){saveJSON(LS.storyUi,getStoryUi());}
function isStoryExpanded(id){return !!(getStoryUi()[id]&&getStoryUi()[id].expanded);}
function setStoryExpanded(id,on){getStoryUi()[id]=Object.assign({},getStoryUi()[id]||{},{expanded:!!on});saveStoryUi();}
function toggleStoryExpanded(id,force){const next=typeof force==="boolean"?force:!isStoryExpanded(id);setStoryExpanded(id,next);return next;}
function saveStorySelection(sel){state.storySelection=sel||null;saveJSON(LS.storySel,state.storySelection);}
function storyStatusFor(storyId){const ui=getStoryUi()[storyId]||{};return {storyId,expanded:!!ui.expanded,activeChildId:state.storySelection&&state.storySelection.storyId===storyId?state.storySelection.childId:null,lastChildId:ui.lastChildId||null};}
function isStoryRoleVisibleInMode(r){return state.mode==="story"?!(!isStoryRole(r)):!!(!isStoryRole(r));}
function isStoryRole(r){return !!(r&&r.isStory);}
function storyCharacters(r){return Array.isArray(r.characters)?r.characters:[];}
function storyElements(r){return Array.isArray(r.storyElements)?r.storyElements:[];}
function sysStoryPrompt(r,child){const desc=r.description?("Story description:\n"+r.description):"";const blocks=[];if(child&&child.prompt)blocks.push((child.kind==="storyelement"?"Story element":"Character")+" — "+(child.name||"")+"\n"+child.prompt);if(r.prompt)blocks.push("Story backstory:\n"+String(r.prompt));if(desc)blocks.push(desc);return{r,child,prompt:blocks.join("\n\n")};}
function currentStoryChild(){const sel=state.storySelection;if(!sel)return null;const r=state.roles.find(x=>x.id===sel.storyId);if(!r||!isStoryRole(r))return null;const list=sel.kind==="storyelement"?storyElements(r):storyCharacters(r);const found=list.find(c=>c.id===sel.childId)||null;return found?{role:r,child:{id:found.id,kind:sel.kind,name:found.name,prompt:found.prompt,thumbUrl:found.thumbUrl||""}}:null;}
function activeChatId(){const cur=currentStoryChild();return cur?cur.role.id+"::"+cur.child.id:state.activeRoleId;}
function activeChatHistory(){const id=activeChatId();return id?(state.chats[id]||[]):[];}
function extractThumb(md){if(!md)return"";const m=md.match(/src\s*=\s*["']([^"']+)["']/i);if(m)return m[1];const u=md.match(/https?:\/\/[^\s)"'\]]+/);return u?u[0]:"";}
function extractName(prompt){
  let m=prompt.match(/^\s*(?:Name|Character(?:\s*Name)?|Full\s*Name)\s*:\s*(.+)$/im);if(m)return m[1].trim().replace(/^\*\*|\*\*$/g,"");
  m=prompt.match(/\*\*(?:Name|Character(?:\s*Name)?)\*\*\s*:\s*(.+)/i);if(m)return m[1].trim().replace(/^\*\*|\*\*$/g,"");
  m=prompt.match(/^\s*\*\*Name:\*\*\s*(.+)$/m);if(m)return m[1].trim();
  return null;
}
async function textOfFile(f){return f.content||await(await fetch(f.raw_url)).text();}
function fileThumbUrl(files){const thumbFile=files.find(f=>/^thumb\.md$/i.test(f.filename));if(!thumbFile)return "";return extractThumb(thumbFile.content||"");}
async function fetchRoleFromGist(url){
  const id=gistIdFromUrl(url);if(!id)throw new Error("Not a valid Gist URL.");
  const j=await(await fetch("https://api.github.com/gists/"+id)).json();
  if(j.message&&!j.files)throw new Error(j.message);
  const files=Object.values(j.files||{});
  const storyTag=files.find(f=>/^GOCHATAPPSTORYTAG_.+\.md$/i.test(f.filename));
  if(storyTag){
    const storyContent=String(await textOfFile(storyTag)||"").trim();
    let backstory="";
    if(storyContent&&!/^story$/i.test(storyContent)){
      const m=storyContent.match(/^backstory\b\s*:?\s*(.*)$/is);
      if(!m)throw new Error("GOCHATAPPSTORYTAG file must contain just 'story' or start with 'backstory'.");
      const rest=m[1].trim();
      backstory=/^if any$/i.test(rest)?"":rest;
    }
    const baseName=parseName(storyTag.filename);
    const childSlug=s=>humanizeSlug(s).toLowerCase().replace(/[^a-z0-9]+/g,"_");
    const thumbBySlug={};
    for(const f of files){const m=f.filename.match(/^(.+)_thumb\.md$/i);if(m)thumbBySlug[childSlug(m[1])]=await textOfFile(f);}
    const pickThumb=slug=>{const md=thumbBySlug[slug];return md?extractThumb(md):"";};
    const characters=[];
    for(const f of files.filter(x=>/^character_.+\.txt$/i.test(x.filename))){
      const slug=f.filename.replace(/^character_/i,"").replace(/\.txt$/i,"");
      const content=await textOfFile(f);
      characters.push({id:"char_"+childSlug(slug),name:humanizeSlug(slug)||parseName(f.filename),prompt:String(content||"").trim(),thumbUrl:pickThumb(childSlug(slug)),file:f.filename,enabled:true});
    }
    const storyElements=[];
    for(const f of files.filter(x=>/^storyelement_.+\.txt$/i.test(x.filename))){
      const slug=f.filename.replace(/^storyelement_/i,"").replace(/\.txt$/i,"");
      const content=await textOfFile(f);
      storyElements.push({id:"storyelement_"+childSlug(slug),name:humanizeSlug(slug)||parseName(f.filename),prompt:String(content||"").trim(),thumbUrl:pickThumb(childSlug(slug)),file:f.filename,enabled:true});
    }
    const thumbFile=files.find(f=>/^thumb\.md$/i.test(f.filename));
    let thumb="";if(thumbFile){const md=await textOfFile(thumbFile);thumb=extractThumb(md);}
    return{id:"gist_"+id,sourceGist:id,gistUrl:"https://gist.github.com/"+id,name:baseName,prompt:backstory,description:String(j.description||"").trim(),promptFile:storyTag.filename,thumbUrl:thumb,createdAt:Date.now(),isStory:true,characters,storyElements};
  }
  const roleFile=files.find(f=>/^GOCHATAPPROLETAG_.+\.txt$/i.test(f.filename))||files.find(f=>/\.txt$/i.test(f.filename));
  if(!roleFile)throw new Error("No GOCHATAPPROLETAG_*.txt or GOCHATAPPSTORYTAG_*.md file in this Gist.");
  const prompt=roleFile.content||await(await fetch(roleFile.raw_url)).text();
  const thumbFile=files.find(f=>/^thumb\.md$/i.test(f.filename));
  let thumb="";if(thumbFile){const md=thumbFile.content||await(await fetch(thumbFile.raw_url)).text();thumb=extractThumb(md);}
  return{id:"gist_"+id,sourceGist:id,gistUrl:"https://gist.github.com/"+id,name:extractName(prompt)||parseName(roleFile.filename),prompt,promptFile:roleFile.filename,thumbUrl:thumb,createdAt:Date.now(),isStory:false};
}
async function addRole(url,msgEl){
  const setMsg=t=>{if(msgEl!=null)msgEl.textContent=t;};
  try{
    const role=await fetchRoleFromGist(url);
    state.roles=state.roles.filter(r=>r.id!==role.id);state.roles.push(role);saveRoles(state.roles);
    setMsg("");return role;
  }catch(e){setMsg(e.message);return null;}
}
function boot(){  state.apiKey=localStorage.getItem(LS.apiKey)||"";
  state.model=localStorage.getItem(LS.model)||"";
  state.roles=getRoles();state.chats=getChats();
  state.personas=getPersonas();
  state.activeRoleId=localStorage.getItem(LS.roleId)||null;
  state.activePersonaId=localStorage.getItem(LS.activePersonaId)||null;
  state.sidebarTab=localStorage.getItem(LS.sidebarTab)||'roles';
  state.storyUi=loadJSON(LS.storyUi,{});state.storySelection=loadJSON(LS.storySel,null);
  state.mode=localStorage.getItem(LS.mode)||"chat";
  if(localStorage.getItem(LS.think)===null)localStorage.setItem(LS.think,"0"); // thinking is OFF by default
  state.think=localStorage.getItem(LS.think)==="1";
  {const t=$("thinkToggle");if(t)t.checked=state.think;}
  if(localStorage.getItem(LS.voice)===null)localStorage.setItem(LS.voice,"0"); // voice is OFF by default
  state.voice=localStorage.getItem(LS.voice)==="1";
  {const v=$("voiceToggle");if(v)v.checked=state.voice;}
  // voiceSpeed: step 1-10, step 1=1.0, step 5=1.5, step 9+=2.0 (clamped)
  const vs=parseInt(localStorage.getItem(LS.voiceSpeed),10);
  state.voiceSpeed=isNaN(vs)||vs<1?1:vs>10?10:vs;
  applyFontSize(parseInt(localStorage.getItem(LS.fs)||"16",10)||16);
  if(!state.apiKey||!state.model){primeSetup();showSetup();if(!state.roles.length)$("setupMsg").textContent="First run — add your key above to get started.";return;}
  showChat();setSidebarTab(state.sidebarTab);if(!currentRole()&&state.roles.length)selectRole(state.roles[0].id);else renderChat();
  syncVoiceUI();
}
/* ================= markdown → html (lightweight, no deps) ================= */
function md2html(md){
  if(!md)return "";
  let html=md
    // code blocks (```lang\n...\n```)
    .replace(/```(\w*)\n([\s\S]*?)```/g,(_,lang,code)=>`<pre><code class="lang-${lang||""}">${escapeHtml(code.trim())}</code></pre>`)
    // inline code (`...`)
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    // bold (**...** or __...__)
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/__([^_]+)__/g,'<strong>$1</strong>')
    // italic (*...*, _..._) - careful not to match bold
    .replace(/\*([^*]+)\*/g,'<em>$1</em>')
    .replace(/_([^_]+)_/g,'<em>$1</em>')
    // strikethrough (~~...~~)
    .replace(/~~([^~]+)~~/g,'<del>$1</del>')
    // links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
    // headers (# ## ###)
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    // blockquotes (> ...)
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    // horizontal rule (---)
    .replace(/^---$/gm,'<hr>')
    // line breaks - double newline = paragraph, single = <br>
    .replace(/\n{2,}/g,'</p><p>')
    .replace(/\n/g,'<br>');
  // wrap in <p> if not already block-level
  if(!/^<(pre|blockquote|h[1-6]|hr|ul|ol)/.test(html.trim())) html='<p>'+html+'</p>';
  // fix adjacent block elements
  html=html.replace(/<\/p>\s*<(pre|blockquote|h[1-6]|hr)/g,'<$1').replace(/<\/(pre|blockquote|h[1-6]|hr)>\s*<p>/g,'</$1>');
  return html;
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
/* ================= chat render ================= */
function scrollBottom(){$("messages").scrollTop=$("messages").scrollHeight;}
function bubble(role,text,cls){
  const d=document.createElement("div");d.className="msg "+(cls||role);
  if(role==="assistant"){d.innerHTML=md2html(text);}else{d.appendChild(document.createTextNode(text));}
  return d;
}
function selectRole(id){state.activeRoleId=id;localStorage.setItem(LS.roleId,id);saveStorySelection(null);renderRoles();renderChat();}
function renderChat(){
  const box=$("messages");box.innerHTML="";
  const r=currentRole();
  const storyCur=currentStoryChild();
  const displayName=storyCur?storyCur.child.name+" · "+r.name:(r?r.name:"No role selected");
  const displayThumb=storyCur?(storyCur.child.thumbUrl||r.thumbUrl):(r?r.thumbUrl:"");
  const p=currentPersona();
  $("hdrName").textContent=displayName||"No role selected";
  $("hdrImg").style.display=displayThumb?"block":"none";if(displayThumb)$("hdrImg").src=displayThumb;
  const personaBadge=p?" · 👤 "+p.name:"";
  $("hdrModel").textContent=(state.model||"")+(r?" · "+state.mode+(state.think?" · think":(state.length?" · ~"+state.length+"w":"")):"")+personaBadge;
  $("modeBtn").textContent=state.mode==="story"?"📖 Story":"💬 Chat";
  if(!r){
    const e=document.createElement("div");e.className="emptyState";
    e.innerHTML="👋 Welcome to Character XI<br><span class='small'>Pick a role on the left, or add one — paste a Gist URL in the sidebar.</span>";
    box.appendChild(e);return;
  }
  const hist=activeChatHistory();
  if(!hist.length){
    const e=document.createElement("div");e.className="emptyState";
    const emptyTitle=storyCur?storyCur.child.name+" · "+r.name:r.name;
    const emptyThumb=storyCur?(storyCur.child.thumbUrl||r.thumbUrl):(r.thumbUrl||"");
    e.innerHTML=(emptyThumb?`<img src="${esc(emptyThumb)}" alt="">`:"")+"<br><b>"+esc(emptyTitle)+"</b><br><span class='small'>Say hello to start. In <b>"+state.mode+"</b> mode"+(state.mode==="story"?" only your latest message is sent (no history).":" the full conversation is sent each time.")+"</span>";
    box.appendChild(e);return;
  }
  hist.forEach(m=>box.appendChild(bubble(m.role,m.content)));
  scrollBottom();
  syncVoiceUI();
}
function renderRoles(){
  const isStory=state.mode==="story";
  const roleBox=$("roleList"),storyBox=$("storyList");
  if(roleBox)roleBox.classList.toggle("hidden",isStory);
  if(storyBox)storyBox.classList.toggle("hidden",!isStory);
  const titleEl=$("sidebarTitle"),subEl=$("sidebarSubtitle"),tabEl=$("tabRoles");
  if(tabEl)tabEl.textContent=sidebarTitleFor();
  if(titleEl&&state.sidebarTab==="roles")titleEl.textContent=sidebarTitleFor();
  if(subEl&&state.sidebarTab==="roles")subEl.textContent=sidebarSubtitleFor();
  if(isStory){renderStories();return;}
  if(!roleBox)return;
  roleBox.innerHTML="";
  const visible=state.roles.filter(r=>!isStoryRole(r));
  if(!visible.length){roleBox.innerHTML='<div class="emptyStateSide">No chats yet.<br>Paste a Gist URL below to add a role.</div>';return;}
  visible.forEach(r=>{
    const h=state.chats[r.id]||[];const last=h[h.length-1];
    const b=document.createElement("button");b.className="roleItem"+(r.id===state.activeRoleId?" active":"");
    b.innerHTML=(r.thumbUrl?`<img src="${esc(r.thumbUrl)}" alt="" loading="lazy">`:`<div class="avaFallback">${esc((r.name||"?")[0].toUpperCase())}</div>`)
      +`<div class="meta"><div class="rname">${esc(r.name)}</div><div class="rprev">${esc(last?last.content:"No messages yet")}</div></div>`
      +`<span class="badge">${h.length?h.length+" msg":""}</span>`
      +`<button class="delBtn" aria-label="Delete ${esc(r.name)}" title="Delete">⋯</button>`;
    b.onclick=()=>{selectRole(r.id);closeSidebar();};
    b.oncontextmenu=(e)=>{showCtxMenu(e,{id:r.id,type:"role",name:r.name});};
    b.querySelector(".delBtn").onclick=(e)=>{e.stopPropagation();showCtxMenu(e,{id:r.id,type:"role",name:r.name});};
    roleBox.appendChild(b);
  });
}
function renderStories(){
  const box=$("storyList");if(!box)return;box.innerHTML="";
  const stories=state.roles.filter(r=>isStoryRole(r));
  if(!stories.length){box.innerHTML='<div class="emptyStateSide">No stories yet.<br>Paste a story Gist URL below to add one.</div>';return;}
  stories.forEach(r=>{
    const expanded=isStoryExpanded(r.id);
    const status=storyStatusFor(r.id);
    const group=document.createElement("div");group.className="storyGroup"+(expanded?" expanded":"");group.dataset.storyId=r.id;
    const head=document.createElement("button");head.className="storyItem"+(state.activeRoleId===r.id||(state.storySelection&&state.storySelection.storyId===r.id)?" active":"");head.dataset.storyId=r.id;
    head.innerHTML=(r.thumbUrl?`<img src="${esc(r.thumbUrl)}" alt="" loading="lazy">`:`<div class="avaFallback">${esc((r.name||"?")[0].toUpperCase())}</div>`)
      +`<div class="meta"><div class="rname">${esc(r.name)}</div></div><span class="storyChevron">▶</span>`
      +`<button class="delBtn" aria-label="Delete ${esc(r.name)}" title="Delete">⋯</button>`;
    head.setAttribute("aria-expanded",expanded?"true":"false");
    head.onclick=()=>{toggleStoryExpanded(r.id);renderStories();};
    head.oncontextmenu=(e)=>{showCtxMenu(e,{id:r.id,type:"story",name:r.name});};
    head.querySelector(".delBtn").onclick=(e)=>{e.stopPropagation();showCtxMenu(e,{id:r.id,type:"story",name:r.name});};
    group.appendChild(head);
    const children=document.createElement("div");children.className="storyChildren";
    const addChild=(child,kind,icon)=>{
      const enabled = child.enabled !== false; // default true
      const key=r.id+"::"+child.id;
      const h=state.chats[key]||[];const last=h[h.length-1];
      const isActive=!!(state.storySelection&&state.storySelection.storyId===r.id&&state.storySelection.childId===child.id);
      const b=document.createElement("button");b.className="storyChild"+(isActive?" active":"")+(enabled?"":" disabled");b.dataset.childId=child.id;b.dataset.kind=kind;
      if(!enabled) b.disabled = true;
      b.innerHTML=(child.thumbUrl?`<img src="${esc(child.thumbUrl)}" alt="" loading="lazy">`: (kind==="storyelement"?`<div class="childIcon">🧵</div>`:`<div class="avaFallback">${esc((child.name||"?")[0].toUpperCase())}</div>`))
        +`<div class="meta"><div class="cname">${esc(child.name||kind)}${enabled?"":" 🚫"}</div><div class="cprev">${esc(last?last.content:(child.prompt||"No prompt"))}</div></div>`
        +`<span class="badge">${h.length?h.length+" msg":""}</span>`
        +`<button class="delBtn" aria-label="Delete ${esc(child.name)}" title="Delete">⋯</button>`;
      b.onclick=()=>{if(enabled){selectStoryChild(r.id,child.id,kind);closeSidebar();}};
      b.oncontextmenu=(e)=>{showCtxMenu(e,{id:child.id,type:"storyChild",name:child.name,storyId:r.id,childKind:kind});};
      b.querySelector(".delBtn").onclick=(e)=>{e.stopPropagation();showCtxMenu(e,{id:child.id,type:"storyChild",name:child.name,storyId:r.id,childKind:kind});};
      children.appendChild(b);
    };
    // Show ALL children (including disabled) so users can right-click to re-enable
    storyCharacters(r).forEach(c=>addChild(c,"character"));
    storyElements(r).forEach(e=>addChild(e,"storyelement"));
    if(!storyCharacters(r).length&&!storyElements(r).length){const empty=document.createElement("div");empty.className="emptyStateSide";empty.textContent="No characters or story elements in this story yet.";children.appendChild(empty);}
    group.appendChild(children);
    box.appendChild(group);
  });
}
function selectStoryChild(storyId,childId,kind){
  const r=state.roles.find(x=>x.id===storyId);if(!r)return;
  const list = kind==="storyelement" ? storyElements(r) : storyCharacters(r);
  const child = list.find(c=>c.id===childId);
  if(!child || child.enabled===false){sys("This character/element is disabled.","err");return;}
  state.activeRoleId=storyId;localStorage.setItem(LS.roleId,storyId);
  saveStorySelection({storyId,childId,kind});
  getStoryUi()[storyId]=Object.assign({},getStoryUi()[storyId]||{},{lastChildId:childId,lastKind:kind});saveStoryUi();
  renderRoles();renderChat();
  const childName=(kind==="storyelement"?storyElements(r):storyCharacters(r)).find(c=>c.id===childId)||{};
  sys("📖 "+(r.name||"Story")+" — "+(childName.name||childId)+(kind==="storyelement"?" (story element)":" (character)")+". Chats resume where you left off.");
}
function toggleStory(storyId){toggleStoryExpanded(storyId);renderStories();}
function renderPersonas(){
  const box=$("personaList");box.innerHTML="";
  if(!state.personas.length){box.innerHTML='<div class="emptyState" style="margin-top:30px"><span class="small">No personas yet.<br>Tap <b>+ New Persona</b> to create one.</span></div>';return;}
  state.personas.forEach(p=>{
    const b=document.createElement("button");b.className="roleItem"+(p.id===state.activePersonaId?" active":"");
    const initial=p.name?p.name[0].toUpperCase():"?";
    b.innerHTML=(p.imageDataUrl?`<img src="${esc(p.imageDataUrl)}" alt="" loading="lazy">`:`<div class="avaFallback">${esc(initial)}</div>`)
      +`<div class="meta"><div class="rname">${esc(p.name||"Unnamed")}</div><div class="rprev">${esc(p.imageDesc||"No description")}</div></div>`
      +`<span class="badge">${p.id===state.activePersonaId?"● Active":""}</span>`
      +`<button class="delBtn" aria-label="Delete ${esc(p.name)}" title="Delete">⋯</button>`;
    b.onclick=()=>{selectPersona(p.id);closeSidebar();};
    b.oncontextmenu=(e)=>{showCtxMenu(e,{id:p.id,type:"persona",name:p.name});};
    b.querySelector(".delBtn").onclick=(e)=>{e.stopPropagation();showCtxMenu(e,{id:p.id,type:"persona",name:p.name});};
    box.appendChild(b);
  });
}
function selectPersona(id){if(!personasAvailable()){sys("Personas don't apply in story mode — switch to Chat to use one.");return false;}state.activePersonaId=id;localStorage.setItem(LS.activePersonaId,id);renderPersonas();renderChat();sys("Persona: "+(state.personas.find(p=>p.id===id)||{name:"?"}).name+" is now active.");return true;}
function addMsg(role,content){const key=activeChatId();if(!key)return null;const arr=state.chats[key]||[];arr.push({role,content,ts:Date.now()});state.chats[key]=arr;saveChats(state.chats);return arr[arr.length-1];}
function sys(text,cls){$("messages").appendChild(bubble("sys",text,cls||""));scrollBottom();}
function setBusy(v){state.busy=v;$("sendBtn").disabled=v;$("sendBtn").textContent=v?"…":"Send ➤";$("input").disabled=v;}
/* ================= .commands ================= */
function setMode(m){state.mode=m;localStorage.setItem(LS.mode,m);if(!personasAvailable()&&state.sidebarTab==="personas")state.sidebarTab="roles";setSidebarTab(state.sidebarTab);renderRoles();renderChat();sys("Mode: "+(m==="story"?"📖 Story — only your latest message is sent. Personas don't apply in stories.":"💬 Chat — full history is sent."));}
function setThink(v){state.think=v;localStorage.setItem(LS.think,v?"1":"0");const t=$("thinkToggle");if(t)t.checked=v;sys(v?"🧠 Think ON — model may reason before replying (slower).":"🧠 Think OFF — direct replies (preferred, faster).");}
function setLength(v){state.length=v;if(v==null){localStorage.removeItem(LS.length);sys("📏 Reply length: auto (no limit).");}else{localStorage.setItem(LS.length,String(v));sys("📏 Reply length: ~"+v+" words.");}}
function stepToRate(step){return Math.min(2,1+(step-1)*0.125);}
function syncVoiceUI(){
  const on=!!state.voice;
  const b=$("voiceHdrBtn"),s=$("voiceSpeed"),t=$("voiceToggle");
  if(b){b.textContent=on?"🔊":"🔇";b.setAttribute("aria-pressed",on?"true":"false");b.title=on?"Voice on — tap to mute":"Voice off — tap to enable";}
  if(s){s.value=state.voiceSpeed;s.disabled=!on;}
  if(t)t.checked=on;
}
function setVoiceSpeed(step){
  const n=parseInt(step,10);
  if(isNaN(n)||n<1||n>10){sys("Usage: .voice speed [1-10] — 1=normal, 5=1.5x, 9+=2x (max). Current: "+state.voiceSpeed);return;}
  state.voiceSpeed=n;localStorage.setItem(LS.voiceSpeed,String(n));
  const rate=stepToRate(n);
  sys("🔊 Voice speed: "+n+"/10 ("+rate.toFixed(2)+"x)");
  syncVoiceUI();
}
/* ---- plain-text chat backup ---- */
function downloadBlob(blob,filename){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
function chatBackup(){
  const r=currentRole();if(!r){sys("No role selected — nothing to back up.","err");return false;}
  const hist=activeChatHistory();if(!hist.length){sys("No messages to back up.","err");return false;}
  const d=new Date();const stamp=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+"_"+String(d.getHours()).padStart(2,"0")+String(d.getMinutes()).padStart(2,"0")+String(d.getSeconds()).padStart(2,"0");
  const gistUrl=r.gistUrl||r.sourceGist||"";
  const filename="chat_"+(gistUrl||"unknown").replace(/[^a-zA-Z0-9]/g,"_")+"_"+stamp+".txt";
  const transcript="gist_url:["+gistUrl+"]\n\n"+hist.map(m=>(m.role==="user"?"user":"assistant")+" -----------\n"+m.content).join("\n\n")+"\n";
  downloadBlob(new Blob([transcript],{type:"text/plain;charset=utf-8"}),filename);
  sys("📝 Backup downloaded: "+filename+" ("+hist.length+" messages).");
  return true;
}

/* ---- backup exporters for delete ---- */
function makeStamp(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+"_"+String(d.getHours()).padStart(2,"0")+String(d.getMinutes()).padStart(2,"0")+String(d.getSeconds()).padStart(2,"0");
}
function sanitize(s){return String(s||"unknown").replace(/[^a-zA-Z0-9]/g,"_");}
function downloadTxt(text, filename){
  downloadBlob(new Blob([text],{type:"text/plain;charset=utf-8"}), filename);
}

function exportRoleBackup(role, withBackup){
  const hist = state.chats[role.id] || [];
  const gistUrl = role.gistUrl || role.sourceGist || "";
  const stamp = makeStamp();
  const filename = "role_"+sanitize(role.name)+"_"+stamp+".txt";
  let out = "type: role\nname: "+role.name+"\ngist_url: ["+gistUrl+"]\nexported: "+new Date().toISOString()+"\n\n";
  out += "=== PROMPT ===\n"+(role.prompt||"")+"\n\n";
  if(hist.length){
    out += "=== CHAT HISTORY ("+hist.length+" messages) ===\n";
    out += hist.map(m=>(m.role==="user"?"user":"assistant")+" -----------\n"+m.content).join("\n\n");
  }else{
    out += "=== CHAT HISTORY (empty) ===\n";
  }
  if(withBackup) downloadTxt(out, filename);
  return {text:out, filename:filename, messageCount:hist.length};
}

function exportStoryBackup(story, withBackup){
  const stamp = makeStamp();
  const filename = "story_"+sanitize(story.name)+"_"+stamp+".txt";
  let out = "type: story\nname: "+story.name+"\ngist_url: ["+(story.gistUrl||story.sourceGist||"")+"]\nexported: "+new Date().toISOString()+"\n\n";
  out += "=== BACKSTORY ===\n"+(story.prompt||"")+"\n\n";
  if(story.description) out += "=== DESCRIPTION ===\n"+story.description+"\n\n";
  if(story.characters && story.characters.length){
    out += "=== CHARACTERS ===\n";
    story.characters.forEach(c=>{
      out += "\n--- "+c.name+" ---\n"+(c.prompt||"")+"\n";
      const chatKey = story.id+"::"+c.id;
      const hist = state.chats[chatKey] || [];
      const assistantOnly = hist.filter(m=>m.role==="assistant");
      if(assistantOnly.length){
        out += "\n[Assistant messages ("+assistantOnly.length+")]\n";
        out += assistantOnly.map(m=>m.content).join("\n---\n");
      }
    });
  }
  if(story.storyElements && story.storyElements.length){
    out += "\n=== STORY ELEMENTS ===\n";
    story.storyElements.forEach(e=>{
      out += "\n--- "+e.name+" ---\n"+(e.prompt||"")+"\n";
      const chatKey = story.id+"::"+e.id;
      const hist = state.chats[chatKey] || [];
      const assistantOnly = hist.filter(m=>m.role==="assistant");
      if(assistantOnly.length){
        out += "\n[Assistant messages ("+assistantOnly.length+")]\n";
        out += assistantOnly.map(m=>m.content).join("\n---\n");
      }
    });
  }
  if(withBackup) downloadTxt(out, filename);
  return {text:out, filename:filename};
}

function exportPersonaBackup(persona, withBackup){
  const stamp = makeStamp();
  const filename = "persona_"+sanitize(persona.name)+"_"+stamp+".txt";
  let out = "type: persona\nname: "+persona.name+"\nexported: "+new Date().toISOString()+"\n\n";
  out += "=== DESCRIPTION ===\n"+(persona.prompt||"")+"\n\n";
  if(persona.imageDesc) out += "=== IMAGE PROMPT ===\n"+persona.imageDesc+"\n";
  if(withBackup) downloadTxt(out, filename);
  return {text:out, filename:filename};
}

/* ---- delete functions ---- */
function deleteRole(roleId, withBackup){
  const idx = state.roles.findIndex(r=>r.id===roleId);
  if(idx===-1){sys("Role not found.","err");return false;}
  const role = state.roles[idx];
  const result = exportRoleBackup(role, withBackup);
  state.roles.splice(idx,1);
  saveRoles(state.roles);
  delete state.chats[roleId];
  saveChats(state.chats);
  if(state.activeRoleId===roleId){
    state.activeRoleId=null;
    localStorage.removeItem(LS.roleId);
  }
  const ui=getStoryUi();
  if(ui[roleId]){delete ui[roleId];saveStoryUi();}
  if(state.storySelection && state.storySelection.storyId===roleId){
    saveStorySelection(null);
  }
  renderRoles();
  renderChat();
  sys("🗑 Deleted role: "+role.name+(withBackup?" (backup saved: "+result.filename+")":" (no backup)"));
  return true;
}

function deleteStory(storyId, withBackup){
  const idx = state.roles.findIndex(r=>r.id===storyId && isStoryRole(r));
  if(idx===-1){sys("Story not found.","err");return false;}
  const story = state.roles[idx];
  const result = exportStoryBackup(story, withBackup);
  state.roles.splice(idx,1);
  saveRoles(state.roles);
  Object.keys(state.chats).forEach(k=>{
    if(k===storyId || k.startsWith(storyId+"::")) delete state.chats[k];
  });
  saveChats(state.chats);
  if(state.activeRoleId===storyId){
    state.activeRoleId=null;
    localStorage.removeItem(LS.roleId);
  }
  const ui=getStoryUi();
  if(ui[storyId]){delete ui[storyId];saveStoryUi();}
  if(state.storySelection && state.storySelection.storyId===storyId){
    saveStorySelection(null);
  }
  renderRoles();
  renderChat();
  sys("🗑 Deleted story: "+story.name+(withBackup?" (backup saved: "+result.filename+")":" (no backup)"));
  return true;
}

function deletePersona(personaId, withBackup){
  const idx = state.personas.findIndex(p=>p.id===personaId);
  if(idx===-1){sys("Persona not found.","err");return false;}
  const persona = state.personas[idx];
  const result = exportPersonaBackup(persona, withBackup);
  state.personas.splice(idx,1);
  savePersonas(state.personas);
  if(state.activePersonaId===personaId){
    state.activePersonaId=null;
    localStorage.removeItem(LS.activePersonaId);
  }
  renderPersonas();
  renderChat();
  sys("🗑 Deleted persona: "+persona.name+(withBackup?" (backup saved: "+result.filename+")":" (no backup)"));
  return true;
}

function deleteActiveRoleOrStory(withBackup){
  const r=currentRole();
  if(!r){sys("No role or story selected.","err");return false;}
  if(isStoryRole(r)) return deleteStory(r.id, withBackup);
  return deleteRole(r.id, withBackup);
}

/* ---- context menu for delete ---- */
let ctxMenuTarget = null; // {id, type: 'role'|'story'|'storyChild'|'persona', storyId?, childKind?}
function showCtxMenu(e, target){
  e.preventDefault();
  e.stopPropagation();
  ctxMenuTarget = target;
  const menu = $("ctxMenu");
  const isPersona = target.type === "persona";
  const isStoryChild = target.type === "storyChild";
  const name = target.name || "this item";
  
  // For story children, check enabled state
  let childEnabled = true;
  if(isStoryChild && target.storyId && target.childKind){
    const story = state.roles.find(r=>r.id===target.storyId);
    if(story){
      const list = target.childKind==="storyelement" ? story.storyElements : story.characters;
      const child = list.find(c=>c.id===target.id);
      if(child) childEnabled = child.enabled !== false; // default true
    }
  }
  
  let html = `
    <button role="menuitem" data-action="backup">${isPersona ? "👤" : isStoryChild ? "🧵" : "🗑"} Download .txt & delete ${esc(name)}</button>
    <hr>
    <button role="menuitem" class="danger" data-action="nobackup">🗑 Delete ${esc(name)} without backup</button>
  `;
  
  // Add toggle for story children
  if(isStoryChild){
    html += `<hr>
    <button role="menuitem" data-action="toggle">${childEnabled ? "🚫 Disable" : "✅ Enable"} ${esc(name)}</button>`;
  }
  
  html += `<hr>
    <button role="menuitem" data-action="cancel">✕ Cancel</button>`;
  
  menu.innerHTML = html;
  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";
  menu.classList.remove("hidden");
  menu.querySelectorAll("button").forEach(btn=>{
    btn.onclick = () => {
      const action = btn.dataset.action;
      hideCtxMenu();
      if(action==="backup") handleCtxDelete(target, true);
      else if(action==="nobackup") handleCtxDelete(target, false);
      else if(action==="toggle") handleCtxToggle(target);
    };
  });
}
function hideCtxMenu(){
  $("ctxMenu").classList.add("hidden");
  ctxMenuTarget = null;
}
document.addEventListener("click", hideCtxMenu);
document.addEventListener("keydown", e=>{if(e.key==="Escape")hideCtxMenu();});
$("sidebar").addEventListener("scroll", hideCtxMenu);

function handleCtxDelete(target, withBackup){
  if(target.type==="role") return deleteRole(target.id, withBackup);
  if(target.type==="story") return deleteStory(target.id, withBackup);
  if(target.type==="storyChild"){
    // For story children, we only delete that child's chat, not the whole story
    const chatKey = target.storyId + "::" + target.id;
    if(state.chats[chatKey]){
      const result = exportStoryBackup(state.roles.find(r=>r.id===target.storyId), withBackup);
      delete state.chats[chatKey];
      saveChats(state.chats);
      if(state.storySelection && state.storySelection.storyId===target.storyId && state.storySelection.childId===target.id){
        saveStorySelection(null);
      }
      renderRoles();renderChat();
      sys("🗑 Deleted chat for "+target.name+(withBackup?" (backup saved: "+result.filename+")":" (no backup)"));
      return true;
    }
    sys("No chat to delete.","err");return false;
  }
  if(target.type==="persona") return deletePersona(target.id, withBackup);
  sys("Unknown target.","err");return false;
}

function handleCtxToggle(target){
  if(target.type!=="storyChild" || !target.storyId || !target.childKind){
    sys("Cannot toggle: invalid target.","err");return false;
  }
  const story = state.roles.find(r=>r.id===target.storyId);
  if(!story){
    sys("Story not found.","err");return false;
  }
  const list = target.childKind==="storyelement" ? story.storyElements : story.characters;
  const child = list.find(c=>c.id===target.id);
  if(!child){
    sys("Character/element not found.","err");return false;
  }
  child.enabled = !child.enabled;
  saveRoles(state.roles);
  if(!child.enabled && state.storySelection && state.storySelection.storyId===target.storyId && state.storySelection.childId===target.id){
    saveStorySelection(null);
    state.activeRoleId = target.storyId;
    localStorage.setItem(LS.roleId, target.storyId);
  }
  renderRoles();renderChat();
  sys((child.enabled?"✅ Enabled":"🚫 Disabled")+" "+target.name);
  return true;
}

function clearChat(noBackup){
  if(!activeChatId()){sys("No chat to clear.");return;}
  const hist=activeChatHistory();
  if(!hist.length){sys("Chat is already empty.");return;}
  if(!noBackup)chatBackup();
  state.pendingClear=false;
  state.chats[activeChatId()]=[];
  saveChats(state.chats);
  renderRoles();
  renderChat();
  sys("🧹 Memory (context) wiped. Start fresh!");
}
function showStatus(){
  const h=activeChatHistory();const r=currentRole();
  const len=state.length==null?"auto (no limit)":"approximately "+state.length+" words";
  const mem=h.length+" messages (limit 50)";
  const ctx="32K (32768)";
  const th=state.think?"On (slower)":"Off";
  const vs=state.voice?"\n🔊 Voice: on · speed "+state.voiceSpeed+"/10 ("+stepToRate(state.voiceSpeed).toFixed(2)+"x)":"\n🔇 Voice: off";
  sys("📏 Response length: "+len+"\n💬 Memory: "+mem+"\n📐 Context: "+ctx+"\n💭 Thinking: "+th+vs+(r?"\n🎭 Role: "+r.name+" · Mode: "+state.mode:""));
}
function delLast(){
  const h=activeChatHistory();
  if(!h.length){sys("No messages to delete.");return;}
  if(h[h.length-1].role==="assistant")h.pop();
  if(h.length&&h[h.length-1].role==="user")h.pop();
  saveChats(state.chats);renderRoles();renderChat();
  sys("🗑 Deleted last message + response ("+h.length+" messages left).");
}
function resendLast(){
  const h=activeChatHistory();
  if(!h.length){sys("No messages to resend.");return;}
  if(!currentRole()){sys("Pick a role first (left sidebar).");return;}
  if(!state.apiKey||!state.model){sys("No API key/model — reopen Setup (⚙️).","err");return;}
  // Re-send the most recent user message without duplicating it in history.
  let lastUser=null;
  for(let i=h.length-1;i>=0;i--){if(h[i].role==="user"){lastUser=h[i].content;break;}}
  if(!lastUser){sys("No user message to resend.");return;}
  const role=currentRole();
  sys("🔁 Resending your last message…");
  setBusy(true);
  const context=state.mode==="story"?[{role:"user",content:lastUser}]:h;
  let sysPrompt=currentStoryChild()?sysStoryPrompt(role,currentStoryChild().child).prompt:(role.prompt||"");
  const persona=personasAvailable()?currentPersona():null;
  if(persona){sysPrompt+="\n\nUSER PERSONA:\n---\n"+persona.prompt;}
  if(state.think)sysPrompt+="\n\nYou may think step by step before replying if it helps.";
  if(state.length)sysPrompt+="\n\nKeep your reply to roughly "+state.length+" words.";
  const payload={model:state.model,messages:[{role:"system",content:sysPrompt},...context.map(m=>({role:m.role,content:m.content}))],max_tokens:1500,reasoning:{enabled:state.think}};
  const typing=document.createElement("div");typing.className="typing";typing.textContent=role.name+" is typing…";$("messages").appendChild(typing);scrollBottom();
  const callLLM=async pl=>{
    const res=await fetch(OR+"/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+state.apiKey,"Content-Type":"application/json","HTTP-Referer":location.href,"X-Title":"GoChat"},body:JSON.stringify(pl)});
    if(res.ok)return res.json();
    const body=await res.text().catch(()=> "");const err=new Error("HTTP "+res.status+" "+body.slice(0,220));err.body=body;throw err;
  };
  (async()=>{
    try{
      let j;
      try{j=await callLLM(payload);}
      catch(e){
        if(!state.think&&/reasoning is mandatory|cannot be disabled/i.test(e.body||"")){
          const p2={...payload};delete p2.reasoning;
          sys("ℹ️ This model can't run with thinking off — answering without the reasoning flag (it may still think).");
          j=await callLLM(p2);
        }else throw e;
      }
      const reply=j.choices?.[0]?.message?.content||"(empty reply)";
      typing.remove();addMsg("assistant",reply);
      const aiBubble=bubble("assistant",reply);
      $("messages").appendChild(aiBubble);scrollBottom();renderRoles();
      attachVoicePlayer(aiBubble, reply);
    }catch(e){typing.remove();$("messages").appendChild(bubble("sys","❌ "+e.message,"err"));scrollBottom();console.error(e);}
    setBusy(false);$("input").focus();
  })();
}
async function recap(){
  const hist=activeChatHistory();
  if(!hist.length){sys("Nothing to recap yet — chat first.");return;}
  const promptStr=hist.slice(-50).map(m=>(m.role==="user"?"User":(currentRole()?.name||"Assistant"))+": "+m.content).join("\n");
  const payload={model:state.model,messages:[
    {role:"system",content:"Summarize the last 50 messages of this conversation in a short, clear recap: key facts, decisions, open questions, and next steps. Plain text, no roleplay."},
    {role:"user",content:promptStr}],max_tokens:800};
  sys("📝 Summarizing the last "+Math.min(50,hist.length)+" messages…");
  try{
    const res=await fetch(OR+"/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+state.apiKey,"Content-Type":"application/json","HTTP-Referer":location.href,"X-Title":"GoChat"},body:JSON.stringify(payload)});
    if(!res.ok){const e=await res.text().catch(()=>"");throw new Error("HTTP "+res.status+" "+e.slice(0,220));}
    const j=await res.json();sys("📝 Recap:\n"+(j.choices?.[0]?.message?.content||"(empty)"));
  }catch(e){sys("❌ Recap failed: "+e.message,"err");}
}
async function ask(text){
  const role=currentRole();
  if(!role){sys("Install/select a role first (e.g. .install <gist-url>).","err");return;}
  if(!text){sys("Usage: .ask <your question> — answer is given outside roleplay, with history access.");return;}
  const hist=activeChatHistory();
  const histStr=hist.slice(-50).map(m=>(m.role==="user"?"User":role.name)+": "+m.content).join("\n")||"(no prior messages)";
  const payload={model:state.model,messages:[
    {role:"system",content:"You are a helpful assistant answering OUTSIDE the roleplay. Ignore the role persona. Use the conversation history for context if it helps. Answer the user's question directly."},
    {role:"user",content:"Conversation so far:\n"+histStr+"\n\nQuestion: "+text}],max_tokens:800};
  sys("❓ Asking (outside roleplay, with history)…");
  try{
    const res=await fetch(OR+"/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+state.apiKey,"Content-Type":"application/json","HTTP-Referer":location.href,"X-Title":"GoChat"},body:JSON.stringify(payload)});
    if(!res.ok){const e=await res.text().catch(()=>"");throw new Error("HTTP "+res.status+" "+e.slice(0,220));}
    const j=await res.json();sys("❓ "+(j.choices?.[0]?.message?.content||"(empty)"));
  }catch(e){sys("❌ Ask failed: "+e.message,"err");}
}
async function roleSummary(){
  const r=currentRole();
  if(!r){sys("No role selected — install one first (.install <gist-url>).","err");return;}
  if(!r.prompt){sys("This role has no prompt to summarize.","err");return;}
  sys("📋 Summarizing "+r.name+"'s traits (not added to context)…");
  try{
    const res=await fetch(OR+"/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+state.apiKey,"Content-Type":"application/json","HTTP-Referer":location.href,"X-Title":"GoChat"},body:JSON.stringify({model:state.model,messages:[
      {role:"system",content:"Summarize this person's character traits from the given profile. Keep it brief and clear — personality, speech style, relationships, boundaries. Plain text, no roleplay."},
      {role:"user",content:r.prompt}],max_tokens:500})});
    if(!res.ok){const e=await res.text().catch(()=>"");throw new Error("HTTP "+res.status+" "+e.slice(0,220));}
    const j=await res.json();sys("📋 "+r.name+" — trait summary (NOT added to context):\n"+(j.choices?.[0]?.message?.content||"(empty)"));
  }catch(e){sys("❌ Role summary failed: "+e.message,"err");}
}
async function installGist(url){
  // synchronous-ish feedback in the chat itself
  sys("⏳ Installing role from "+url+" …");
  const role=await addRole(url); // addRole(msgEl=null) → no inline errors, returns role|null
  if(role){renderRoles();if(role.isStory){setMode("story");if(role.characters&&role.characters.length)selectStoryChild(role.id,role.characters[0].id,"character");else if(role.storyElements&&role.storyElements.length)selectStoryChild(role.id,role.storyElements[0].id,"storyelement");else{selectRole(role.id);}}else{selectRole(role.id);}sys("✅ Installed & switched to: "+role.name+(role.thumbUrl?" (thumbnail loaded)":" (no thumbnail found)"));}
  else sys("❌ Install failed. Check the Gist URL and that it contains a GOCHATAPPROLETAG_*.txt or GOCHATAPPSTORYTAG_*.md file.","err");
}
function handleCommand(raw){
  const t=raw.trim();if(!t.startsWith("."))return false;
  const parts=t.slice(1).trim().split(/\s+/);const cmd=(parts[0]||"").toLowerCase();const arg=parts.slice(1).join(" ").trim();
  if(cmd==="mode"){if(["chat","story"].includes(arg.toLowerCase())){setMode(arg.toLowerCase());}else sys("Usage: .mode chat  |  .mode story");return true;}
  if(cmd==="m"){if(["chat","story"].includes(arg.toLowerCase())){setMode(arg.toLowerCase());}else sys("Usage: .m chat  |  .m story");return true;}
  if(cmd==="s"){showStatus();return true;}
  if(cmd==="h"){sys("Commands:\n.think [on|off|toggle] — toggle thinking (off = preferred, faster)\n.length [n|auto|reset] — set reply length in words (n), or auto/reset removes the limit\n.clear [noback] — download a .txt backup, then wipe memory; noback skips the download\n.recap [n] — summarize last 50 messages using prompt n\n.ask [text] — ask outside roleplay (with history)\n.del — delete last message + response\n.resend — resend last user message\n.backup — download this chat as a .txt file without clearing\n.install <gist-url> — install role from Gist\n.mode chat|story — switch context mode\n.m chat|story — shortcut for .mode\n.role summary — summarize this person's traits (not added to context)\n.status — show length, memory, context, thinking\n.s — shortcut for .status\n.voice [on|off|toggle] — toggle voice\n.voice speed [1-10] — set speed (1=normal, 5=1.5x, 9+=2x max)\n.toggle [on|off|toggle] — toggle current story character/element enabled state\n.delete yes [nobackup] — delete active role/story with .txt backup; nobackup skips download\n.delete persona yes [nobackup] — delete active persona with .txt backup; nobackup skips download\n.help — list commands\n.h — shortcut for .help");return true;}
  if(cmd==="i"){const url=arg.split(/\s+/)[0]||"";if(!url){sys("Usage: .i https://gist.github.com/<user>/<id>");return true;}installGist(url);return true;}
  if(cmd==="think"){const a=arg.toLowerCase();if(a===""||a==="toggle")setThink(!state.think);else if(a==="on")setThink(true);else if(a==="off")setThink(false);else sys("Usage: .think [on|off|toggle] — off = preferred, faster");renderChat();return true;}
  if(cmd==="voice"){
    const parts=arg.trim().split(/\s+/);
    const sub=(parts[0]||"").toLowerCase();
    const val=parts[1];
    if(sub==="speed"){
      if(!val){sys("🔊 Voice speed: "+state.voiceSpeed+"/10 ("+stepToRate(state.voiceSpeed).toFixed(2)+"x)");return true;}
      setVoiceSpeed(val);
      return true;
    }
    const a=arg.toLowerCase();
    if(a===""||a==="toggle"){state.voice=!state.voice;localStorage.setItem(LS.voice,state.voice?"1":"0");}
    else if(a==="on"){state.voice=true;localStorage.setItem(LS.voice,"1");}
    else if(a==="off"){state.voice=false;localStorage.setItem(LS.voice,"0");}
    else{sys("Usage: .voice [on|off|toggle] — toggle voice\n.voice speed [1-10] — set speed (1=normal, 5=1.5x, 9+=2x max)");return true;}
    $("voiceToggle").checked=state.voice;
    syncVoiceUI();
    sys(state.voice?"🔊 Voice ON — each AI reply gets a play button (SoniaNeural).":"🔇 Voice OFF — text only.");
    return true;
  }
  if(cmd==="length"){const a=arg.toLowerCase();if(a==="auto"||a==="reset")setLength(null);else if(a){const n=parseInt(a,10);if(isNaN(n)||n<1)sys("Usage: .length [n|auto|reset] — approximate response length in words");else setLength(n);}else sys("Reply length: "+(state.length==null?"auto (no limit)":"~"+state.length+" words"));renderChat();return true;}
  if(cmd==="del"){delLast();return true;}
  if(cmd==="resend"){resendLast();return true;}
  if(cmd==="backup"){chatBackup();return true;}
  if(cmd==="recap"){recap();return true;}
  if(cmd==="ask"){ask(arg);return true;}
  if(cmd==="clear"){clearChat(arg.toLowerCase()==="noback");return true;}
  if(cmd==="delete"){
    const parts=arg.trim().split(/\s+/);
    const target=(parts[0]||"").toLowerCase();
    const hasNoBackup=parts.includes("nobackup");
    if(target==="persona"){
      if(parts[1]!=="yes"){sys("Usage: .delete persona yes [nobackup]");return true;}
      const pid=state.activePersonaId;
      if(!pid){sys("No active persona.","err");return true;}
      return deletePersona(pid, !hasNoBackup);
    }
    if(target!=="yes"){sys("Usage: .delete yes [nobackup]  |  .delete persona yes [nobackup]");return true;}
    return deleteActiveRoleOrStory(!hasNoBackup);
  }
  if(cmd==="role"){if(!arg||arg.toLowerCase()!=="summary"){sys("Usage: .role summary — summarize this person's traits (not added to context)");return true;}roleSummary();return true;}
  if(cmd==="toggle"){
    const child = currentStoryChild();
    if(!child){sys("Not in a story or no character/element selected.","err");return true;}
    const a = arg.toLowerCase();
    const list = child.kind==="storyelement" ? storyElements(child.role) : storyCharacters(child.role);
    const target = list.find(c=>c.id===child.child.id);
    if(!target){sys("Character/element not found.","err");return true;}
    if(a===""||a==="toggle"){target.enabled = !target.enabled;}
    else if(a==="on"){target.enabled = true;}
    else if(a==="off"){target.enabled = false;}
    else {sys("Usage: .toggle [on|off|toggle]");return true;}
    saveRoles(state.roles);
    if(!target.enabled && state.storySelection && state.storySelection.storyId===child.role.id && state.storySelection.childId===target.id){
      saveStorySelection(null);
      state.activeRoleId = child.role.id;
      localStorage.setItem(LS.roleId, child.role.id);
    }
    renderRoles();renderChat();
    sys((target.enabled?"✅ Enabled":"🚫 Disabled")+" "+target.name);
    return true;
  }
  if(cmd==="install"){const url=arg.split(/\s+/)[0]||"";if(!url){sys("Usage: .install https://gist.github.com/<user>/<id>");return true;}installGist(url);return true;}
  if(cmd==="status"){showStatus();return true;}
  if(cmd==="help"){sys("Commands:\n.think [on|off|toggle] — toggle thinking (off = preferred, faster)\n.length [n|auto|reset] — set reply length in words (n), or auto/reset removes the limit\n.clear [noback] — download a .txt backup, then wipe memory; noback skips the download\n.recap [n] — summarize last 50 messages using prompt n\n.ask [text] — ask outside roleplay (with history)\n.del — delete last message + response\n.resend — resend last user message\n.backup — download this chat as a .txt file without clearing\n.install <gist-url> — install role from Gist\n.mode chat|story — switch context mode\n.role summary — summarize this person's traits (not added to context)\n.status — show length, memory, context, thinking\n.help — list commands\n.delete yes [nobackup] — delete active role/story with .txt backup; nobackup skips download\n.delete persona yes [nobackup] — delete active persona with .txt backup; nobackup skips download\n.toggle [on|off|toggle] — toggle current story character/element enabled state");return true;}
  sys("Unknown command: ."+cmd+" — type .help");return true;
}
/* ================= send to LLM ================= */
async function sendMessage(){
  const text=$("input").value.trim();if(!text||state.busy)return;
  if(handleCommand(text)){$("input").value="";return;}
  const role=currentRole();
  if(!role){sys("Pick a role first (left sidebar), or add one from a Gist URL.");return;}
  if(!state.apiKey||!state.model){sys("No API key/model — reopen Setup (⚙️).","err");return;}
  addMsg("user",text);
  $("input").value="";$("messages").appendChild(bubble("user",text));scrollBottom();renderRoles();
  setBusy(true);
  const hist=activeChatHistory();
  const context=state.mode==="story"?[hist[hist.length-1]]:hist;
  let sysPrompt=currentStoryChild()?sysStoryPrompt(role,currentStoryChild().child).prompt:(role.prompt||"");
  const persona=personasAvailable()?currentPersona():null;
  if(persona){sysPrompt+="\n\nUSER PERSONA:\n---\n"+persona.prompt;}
  if(state.think)sysPrompt+="\n\nYou may think step by step before replying if it helps.";
  if(state.length)sysPrompt+="\n\nKeep your reply to roughly "+state.length+" words.";
  const payload={model:state.model,messages:[{role:"system",content:sysPrompt},...context.map(m=>({role:m.role,content:m.content}))],max_tokens:1500,reasoning:{enabled:state.think}};
  const typing=document.createElement("div");typing.className="typing";typing.textContent=role.name+" is typing…";$("messages").appendChild(typing);scrollBottom();
  const callLLM=async pl=>{
    const res=await fetch(OR+"/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+state.apiKey,"Content-Type":"application/json","HTTP-Referer":location.href,"X-Title":"GoChat"},body:JSON.stringify(pl)});
    if(res.ok)return res.json();
    const body=await res.text().catch(()=>"");const err=new Error("HTTP "+res.status+" "+body.slice(0,220));err.body=body;throw err;
  };
  try{
    let j;
    try{j=await callLLM(payload);}
    catch(e){
      // Thinking is off by default, but some endpoints refuse to disable reasoning (HTTP 400).
      // Keep the default, just drop the flag for this reply so the chat still works.
      if(!state.think&&/reasoning is mandatory|cannot be disabled/i.test(e.body||"")){
        const p2={...payload};delete p2.reasoning;
        sys("ℹ️ This model can't run with thinking off — answering without the reasoning flag (it may still think).");
        j=await callLLM(p2);
      }else throw e;
    }
    const reply=j.choices?.[0]?.message?.content||"(empty reply)";
    typing.remove();addMsg("assistant",reply);
    const aiBubble = bubble("assistant",reply);
    $("messages").appendChild(aiBubble);scrollBottom();renderRoles();
    attachVoicePlayer(aiBubble, reply);
  }catch(e){typing.remove();$("messages").appendChild(bubble("sys","❌ "+e.message,"err"));scrollBottom();console.error(e);}
  setBusy(false);$("input").focus();
}
/* ================= TTS (Edge TTS — SoniaNeural) ================= */
// Strip markdown formatting (ported from Go test_tts/main.go)
function stripMarkdown(text){
  text = text.replace(/(\*\*|__)(.*?)(\*\*|__)/g, '$2');
  text = text.replace(/(\*|_)(.*?)(\*|_)/g, '$2');
  text = text.replace(/`([^`]*)`/g, '$1');
  text = text.replace(/```[^`]*```/g, '');
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/^\s{0,3}>\s?/gm, '');
  text = text.replace(/^\s{0,3}((-\{3,})|(\*{3,})|(_{3,}))\s*$/gm, '');
  text = text.replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, '');
  text = text.replace(/~~(.*?)~~/g, '$1');
  text = text.replace(/\*\*/g, '').replace(/__/g, '').replace(/\*/g, '').replace(/_/g, '').replace(/`/g, '').replace(/~~/g, '');
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

// Split text into chunks at word boundaries (ported from Go test_tts/tts_compare_test.go)
function splitTextForTTS(text, maxCharacters){
  const words = text.split(/\s+/);
  const chunks = [];
  let current = '';
  for(const word of words){
    const candidate = current ? current + ' ' + word : word;
    if(current && candidate.length > maxCharacters){
      chunks.push(current);
      current = word;
    }else{
      current = candidate;
    }
  }
  if(current) chunks.push(current);
  return chunks;
}

/* ================= sidebar mobile ================= */// Edge TTS WebSocket client — generates MP3 via Microsoft's Read-Aloud service
// Voice: en-GB-SoniaNeural (female, British)
// Returns a Promise resolving to an audio Blob (audio/mpeg)
async function fetchEdgeTtsMp3(text){
  const voice = 'en-GB-SoniaNeural';
  const maxCharsTotal = 3000;
  const maxCharsChunk = 1000;

  const clean = stripMarkdown(text).slice(0, maxCharsTotal);
  if(!clean) return null;

  const chunks = splitTextForTTS(clean, maxCharsChunk);
  const audioParts = [];

  for(const chunk of chunks){
    const escaped = chunk
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&apos;');
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><voice name="${voice}">${escaped}</voice></speak>`;

    const now = Date.now();
    const filetime = BigInt((now + 11644473600000) * 10000);
    const rounded = (filetime / 3000000000n) * 3000000000n;
    const guid = crypto.randomUUID().replace(/-/g, '');
    const tokenInput = rounded.toString() + guid;
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tokenInput));
    const token = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${token}&Sec-MS-GSL=${token}`;
    console.log('[TTS] Connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    const chunkAudio = await new Promise((resolve, reject) => {
      let receivedAudio = new Uint8Array(0);
      ws.onopen = () => {
        console.log('[TTS] WebSocket open, sending config and request');
        const config = JSON.stringify({context:{synthesis:{audio:{metadataOptions:{sentenceBoundaryEnabled:false,wordBoundaryEnabled:false},outputFormat:'audio-24khz-48kbitrate-mono-mp3'}}}});
        ws.send(config);
        const request = JSON.stringify({input:{text:ssml,voice:{name:voice}},voice:{name:voice}});
        ws.send(request);
      };
      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          console.log('[TTS] WS text message:', event.data.slice(0, 200));
        }
        if(event.data instanceof ArrayBuffer){
          const frame = new Uint8Array(event.data);
          const combined = new Uint8Array(receivedAudio.length + frame.length);
          combined.set(receivedAudio);
          combined.set(frame, receivedAudio.length);
          receivedAudio = combined;
        }else if(typeof event.data === 'string'){
          try{
            const msg = JSON.parse(event.data);
            if(msg.type === 'turn.end'){
              ws.close();
              resolve(receivedAudio);
            }
          }catch(e){}
        }
      };
      ws.onerror = (err) => {
        console.error('[TTS] WebSocket error event:', err);
        // WebSocket error events don't have .message, use type instead
        reject(new Error('WebSocket error: connection failed (check console for details)'));
      };
      ws.onclose = (e) => {
        console.log('[TTS] WebSocket closed, code:', e.code, 'reason:', e.reason, 'wasClean:', e.wasClean);
        // Common close codes: 1000=normal, 1006=abnormal (no close frame), 1007=invalid data, 1008=policy violation
        if (e.code === 1006) {
          console.error('[TTS] Connection closed abnormally (code 1006). Likely: network issue, CORS, or endpoint blocked.');
        } else if (e.code === 1007) {
          console.error('[TTS] Invalid frame payload data (code 1007). Protocol mismatch?');
        } else if (e.code === 1008) {
          console.error('[TTS] Policy violation (code 1008). Origin/Referer blocked?');
        } else if (e.code === 1011) {
          console.error('[TTS] Server error (code 1011). Token or request format invalid?');
        }
        if(receivedAudio.length > 0) resolve(receivedAudio);
        else reject(new Error('WebSocket closed without audio (code ' + e.code + ')'));
      };
      setTimeout(() => { ws.close(); reject(new Error('TTS timeout')); }, 15000);
    });

    audioParts.push(chunkAudio);
  }

  const totalLength = audioParts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for(const part of audioParts){
    combined.set(part, offset);
    offset += part.length;
  }
  return new Blob([combined], {type: 'audio/mpeg'});
}

/* ================= sidebar mobile ================= */// Attach a voice player to an assistant message bubble
// Called only for NEW messages when voice is enabled (not on history re-render)
async function attachVoicePlayer(bubbleEl, replyText){
  if(!state.voice) return;
  if(!bubbleEl || bubbleEl.classList.contains('voice-attached')) return;

  bubbleEl.classList.add('voice-attached');

  const placeholder = document.createElement('div');
  placeholder.className = 'voice-generating';
  placeholder.textContent = '🔊 Generating voice…';
  bubbleEl.appendChild(placeholder);

  // Try Edge TTS first (SoniaNeural voice)
  try{
    const blob = await fetchEdgeTtsMp3(replyText);
    placeholder.remove();
    if(!blob || blob.size === 0){
      throw new Error('Empty response from Edge TTS');
    }
    const url = URL.createObjectURL(blob);
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = url;
    bubbleEl.appendChild(audio);
    return; // Success - used Edge TTS
  } catch (e) {
    console.warn('[TTS] Edge TTS failed, falling back to speechSynthesis:', e);
    // Fall through to speechSynthesis fallback
  }

  // Fallback: Browser speechSynthesis (built-in, works offline)
  // Ensure voices are loaded (async in some browsers)
  await new Promise(resolve => {
    if (window.speechSynthesis.getVoices().length > 0) {
      resolve();
    } else {
      window.speechSynthesis.onvoiceschanged = () => resolve();
      // Fallback timeout in case event never fires
      setTimeout(resolve, 500);
    }
  });

  placeholder.remove();
  try {
    if (!window.speechSynthesis) {
      throw new Error('speechSynthesis not supported in this browser');
    }
    const clean = stripMarkdown(replyText).slice(0, 3000);
    if (!clean) throw new Error('No text to speak');

    window.speechSynthesis.cancel(); // Stop any ongoing speech
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'en-GB'; // British English
    utter.rate = stepToRate(state.voiceSpeed);
    utter.pitch = 1.0;
    utter.volume = 1.0;

    // Try to find a British female voice
    const voices = window.speechSynthesis.getVoices();
    const britishFemale = voices.find(v => v.lang.startsWith('en-GB') && /female/i.test(v.name));
    if (britishFemale) utter.voice = britishFemale;

    const fallbackMsg = document.createElement('div');
    fallbackMsg.className = 'voice-generating';
    fallbackMsg.textContent = '🔊 Playing via browser speechSynthesis…';
    bubbleEl.appendChild(fallbackMsg);

    utter.onend = () => fallbackMsg.remove();
    utter.onerror = (ev) => {
      fallbackMsg.textContent = '🔊 Voice error: ' + (ev.error || 'speechSynthesis failed');
      console.error('[TTS] speechSynthesis error:', ev);
    };

    window.speechSynthesis.speak(utter);
  } catch (e2) {
    const err = document.createElement('div');
    err.className = 'voice-generating';
    const msg = e2?.message || String(e2);
    err.textContent = '🔊 Voice error: ' + msg.slice(0, 120);
    err.title = msg;
    bubbleEl.appendChild(err);
    console.error('[TTS] Both Edge TTS and speechSynthesis failed:', e2);
  }
}

/* ================= sidebar mobile ================= */
/* ================= sidebar mobile ================= */
function openSidebar(){$("sidebar").classList.add("open");$("overlay").classList.add("show");}
function closeSidebar(){$("sidebar").classList.remove("open");$("overlay").classList.remove("show");}
/* ================= setup save ================= */
async function saveSetup(){
  const key=$("apiKey").value.trim();
  const v=validateModel();const model=$("modelSelect").value;
  if(!key){setSetupMsg("⚠️ Enter your OpenRouter API key.","err");return;}
  if(!v.ok){setSetupMsg(v.msg,"err");return;}
  localStorage.setItem(LS.apiKey,key);localStorage.setItem(LS.model,model);
  state.apiKey=key;state.model=model;
  setSetupMsg("✅ Saved! Opening chat… Tip: type .install <gist-url> in the chat to add a role.","ok");
  showChat();renderRoles();
  if(state.roles.length){const firstChat=state.roles.find(x=>!isStoryRole(x));const firstStory=state.roles.find(x=>isStoryRole(x));if(firstChat)selectRole(firstChat.id);else if(firstStory){setMode("story");const first=firstStory;if(first.characters&&first.characters.length)selectStoryChild(first.id,first.characters[0].id,"character");else if(first.storyElements&&first.storyElements.length)selectStoryChild(first.id,first.storyElements[0].id,"storyelement");}}
  else renderChat();
  if(!state.roles.length)sys("👋 Welcome! There's no role yet — type:\n.install https://gist.github.com/gochatapp/0653c10f46341223b5a3370af74c6528\n…or any Gist containing a GOCHATAPPROLETAG_*.txt or GOCHATAPPSTORYTAG_*.md file, and I'll install it.");
  setTimeout(()=>setSetupMsg(""),2500);
}
/* ================= events & init ================= */
$("loadModels").onclick=loadModels;
$("saveSetup").onclick=saveSetup;
$("modelFilter").oninput=applyFilter;
$("modelSelect").onchange=e=>pickModel(e.target.value);
$("thinkToggle").onchange=e=>{state.think=!!e.target.checked;localStorage.setItem(LS.think,state.think?"1":"0");setSetupMsg(state.think?"🧠 Thinking ON — replies may be slower and use more tokens.":"💬 Thinking OFF — faster, fewer tokens.","ok");};
$("voiceToggle").onchange=e=>{state.voice=!!e.target.checked;localStorage.setItem(LS.voice,state.voice?"1":"0");setSetupMsg(state.voice?"🔊 Voice ON — each AI reply gets a play button (SoniaNeural).":"🔇 Voice OFF — text only.","ok");syncVoiceUI();};
$("voiceHdrBtn").onclick=()=>{state.voice=!state.voice;localStorage.setItem(LS.voice,state.voice?"1":"0");syncVoiceUI();};
$("voiceSpeed").oninput=e=>{state.voiceSpeed=parseInt(e.target.value,10);localStorage.setItem(LS.voiceSpeed,String(state.voiceSpeed));};
$("toggleKey").onclick=()=>{const i=$("apiKey");i.type=i.type==="password"?"text":"password";$("toggleKey").textContent=i.type==="password"?"Show":"Hide";};
$("fontSize").oninput=e=>applyFontSize(parseInt(e.target.value,10));
$("sendBtn").onclick=sendMessage;
$("input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}});
$("input").addEventListener("input",()=>{const i=$("input");i.style.height="auto";i.style.height=Math.min(i.scrollHeight,130)+"px";});
$("modeBtn").onclick=()=>setMode(state.mode==="story"?"chat":"story");
$("settingsBtn").onclick=()=>{primeSetup();showSetup();setSetupMsg("Edit your settings, then Save & Start Chatting.");};
$("menuBtn").onclick=openSidebar;$("overlay").onclick=closeSidebar;
$("addRoleBtn").onclick=async()=>{
  const u=$("newGist").value.trim();if(!u)return;
  $("addRoleMsg").textContent="Loading role…";
  const r=await addRole(u,$("addRoleMsg"));
  if(r){$("newGist").value="";if(r.isStory){renderRoles();setMode("story");if(r.characters&&r.characters.length)selectStoryChild(r.id,r.characters[0].id,"character");else if(r.storyElements&&r.storyElements.length)selectStoryChild(r.id,r.storyElements[0].id,"storyelement");closeSidebar();}else{renderRoles();selectRole(r.id);closeSidebar();}}
};
$("newGist").addEventListener("keydown",e=>{if(e.key==="Enter")$("addRoleBtn").click();});
$("tabRoles").onclick=()=>setSidebarTab("roles");
$("tabPersonas").onclick=()=>setSidebarTab("personas");
$("newPersonaBtn").onclick=()=>{window.open("persona_maker.html","_blank");};
window.addEventListener("resize",()=>{if(window.innerWidth>760)closeSidebar();});
boot();
