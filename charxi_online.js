/* charxi_online.js - page logic for charxi_online.html (split out of the inline <script> block). */
"use strict";
/* ================= storage ================= */
const LS={apiKey:"gochat_apiKey",model:"gochat_model",fs:"gochat_fontSize",roles:"gochat_roles",chats:"gochat_chats",roleId:"gochat_activeRoleId",mode:"gochat_mode",think:"gochat_think",length:"gochat_length",voice:"gochat_voice"};
const $=id=>document.getElementById(id);
const loadJSON=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
const saveJSON=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.warn("save failed (quota?)",e)}};
const getRoles=()=>loadJSON(LS.roles,[]);
const saveRoles=r=>saveJSON(LS.roles,r);
const getChats=()=>loadJSON(LS.chats,{});
const saveChats=c=>saveJSON(LS.chats,c);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const OR="https://openrouter.ai/api/v1";
let state={apiKey:"",model:"",roles:[],chats:{},activeRoleId:null,mode:"chat",busy:false,models:[],filtered:[],think:false,length:null,voice:false};
const currentRole=()=>state.roles.find(r=>r.id===state.activeRoleId)||null;
const currentHistory=()=>state.activeRoleId?(state.chats[state.activeRoleId]||[]):[];
function applyFontSize(px){document.documentElement.style.setProperty("--fs",px+"px");localStorage.setItem(LS.fs,String(px));$("fsVal").textContent=px+"px";$("fontSize").value=px;}
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
function parseName(filename){const base=filename.replace(/\.txt$/i,"").replace(/^GOCHATAPPROLETAG_/i,"").replace(/_/g," ").trim();return base||"Role";}
function extractThumb(md){if(!md)return"";const m=md.match(/src\s*=\s*["']([^"']+)["']/i);if(m)return m[1];const u=md.match(/https?:\/\/[^\s)"'\]]+/);return u?u[0]:"";}
function extractName(prompt){
  let m=prompt.match(/^\s*(?:Name|Character(?:\s*Name)?|Full\s*Name)\s*:\s*(.+)$/im);if(m)return m[1].trim().replace(/^\*\*|\*\*$/g,"");
  m=prompt.match(/\*\*(?:Name|Character(?:\s*Name)?)\*\*\s*:\s*(.+)/i);if(m)return m[1].trim().replace(/^\*\*|\*\*$/g,"");
  m=prompt.match(/^\s*\*\*Name:\*\*\s*(.+)$/m);if(m)return m[1].trim();
  return null;
}
async function fetchRoleFromGist(url){
  const id=gistIdFromUrl(url);if(!id)throw new Error("Not a valid Gist URL.");
  const j=await(await fetch("https://api.github.com/gists/"+id)).json();
  if(j.message&&!j.files)throw new Error(j.message);
  const files=Object.values(j.files||{});
  const roleFile=files.find(f=>/^GOCHATAPPROLETAG_.+\.txt$/i.test(f.filename))||files.find(f=>/\.txt$/i.test(f.filename));
  if(!roleFile)throw new Error("No GOCHATAPPROLETAG_*.txt file in this Gist.");
  const prompt=roleFile.content||await(await fetch(roleFile.raw_url)).text();
  const thumbFile=files.find(f=>/^thumb\.md$/i.test(f.filename));
  let thumb="";if(thumbFile){const md=thumbFile.content||await(await fetch(thumbFile.raw_url)).text();thumb=extractThumb(md);}
  return{id:"gist_"+id,sourceGist:id,gistUrl:"https://gist.github.com/"+id,name:extractName(prompt)||parseName(roleFile.filename),prompt,promptFile:roleFile.filename,thumbUrl:thumb,createdAt:Date.now()};
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
  state.activeRoleId=localStorage.getItem(LS.roleId)||null;
  state.mode=localStorage.getItem(LS.mode)||"chat";
  if(localStorage.getItem(LS.think)===null)localStorage.setItem(LS.think,"0"); // thinking is OFF by default
  state.think=localStorage.getItem(LS.think)==="1";
  {const t=$("thinkToggle");if(t)t.checked=state.think;}
  if(localStorage.getItem(LS.voice)===null)localStorage.setItem(LS.voice,"0"); // voice is OFF by default
  state.voice=localStorage.getItem(LS.voice)==="1";
  {const v=$("voiceToggle");if(v)v.checked=state.voice;}
  state.length=localStorage.getItem(LS.length)?parseInt(localStorage.getItem(LS.length),10):null;
  applyFontSize(parseInt(localStorage.getItem(LS.fs)||"16",10)||16);
  if(!state.apiKey||!state.model){primeSetup();showSetup();if(!state.roles.length)$("setupMsg").textContent="First run — add your key above to get started.";return;}
  showChat();renderRoles();if(!currentRole()&&state.roles.length)selectRole(state.roles[0].id);else renderChat();
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
function renderChat(){
  const box=$("messages");box.innerHTML="";
  const r=currentRole();
  $("hdrName").textContent=r?r.name:"No role selected";
  $("hdrImg").style.display=r&&r.thumbUrl?"block":"none";if(r&&r.thumbUrl)$("hdrImg").src=r.thumbUrl;
  $("hdrModel").textContent=(state.model||"")+(r?" · "+state.mode+(state.think?" · think":(state.length?" · ~"+state.length+"w":"")):"");
  $("modeBtn").textContent=state.mode==="story"?"📖 Story":"💬 Chat";
  if(!r){
    const e=document.createElement("div");e.className="emptyState";
    e.innerHTML="👋 Welcome to GoChat<br><span class='small'>Pick a role on the left, or add one — paste a Gist URL in the sidebar.</span>";
    box.appendChild(e);return;
  }
  const hist=currentHistory();
  if(!hist.length){
    const e=document.createElement("div");e.className="emptyState";
    e.innerHTML=(r.thumbUrl?`<img src="${esc(r.thumbUrl)}" alt="">`:"")+"<br><b>"+esc(r.name)+"</b><br><span class='small'>Say hello to start. In <b>"+state.mode+"</b> mode"+(state.mode==="story"?" only your latest message is sent (no history).":" the full conversation is sent each time.")+"</span>";
    box.appendChild(e);return;
  }
  hist.forEach(m=>box.appendChild(bubble(m.role,m.content)));
  scrollBottom();
}
function renderRoles(){
  const box=$("roleList");box.innerHTML="";
  if(!state.roles.length){box.innerHTML='<div class="emptyState" style="margin-top:30px"><span class="small">No roles yet.<br>Paste a Gist URL below to add one.</span></div>';return;}
  state.roles.forEach(r=>{
    const h=state.chats[r.id]||[];const last=h[h.length-1];
    const b=document.createElement("button");b.className="roleItem"+(r.id===state.activeRoleId?" active":"");
    b.innerHTML=(r.thumbUrl?`<img src="${esc(r.thumbUrl)}" alt="" loading="lazy">`:`<div class="avaFallback">${esc((r.name||"?")[0].toUpperCase())}</div>`)
      +`<div class="meta"><div class="rname">${esc(r.name)}</div><div class="rprev">${esc(last?last.content:"No messages yet")}</div></div>`
      +`<span class="badge">${h.length?h.length+" msg":""}</span>`;
    b.onclick=()=>{selectRole(r.id);closeSidebar();};
    box.appendChild(b);
  });
}
function selectRole(id){state.activeRoleId=id;localStorage.setItem(LS.roleId,id);renderRoles();renderChat();}
function addMsg(role,content){const arr=state.chats[state.activeRoleId]||[];arr.push({role,content,ts:Date.now()});state.chats[state.activeRoleId]=arr;saveChats(state.chats);return arr[arr.length-1];}
function sys(text,cls){$("messages").appendChild(bubble("sys",text,cls||""));scrollBottom();}
function setBusy(v){state.busy=v;$("sendBtn").disabled=v;$("sendBtn").textContent=v?"…":"Send ➤";$("input").disabled=v;}
/* ================= .commands ================= */
function setMode(m){state.mode=m;localStorage.setItem(LS.mode,m);renderRoles();renderChat();sys("Mode: "+(m==="story"?"📖 Story — only your latest message is sent.":"💬 Chat — full history is sent."));}
function setThink(v){state.think=v;localStorage.setItem(LS.think,v?"1":"0");const t=$("thinkToggle");if(t)t.checked=v;sys(v?"🧠 Think ON — model may reason before replying (slower).":"🧠 Think OFF — direct replies (preferred, faster).");}
function setLength(v){state.length=v;if(v==null){localStorage.removeItem(LS.length);sys("📏 Reply length: auto (no limit).");}else{localStorage.setItem(LS.length,String(v));sys("📏 Reply length: ~"+v+" words.");}}
/* ---- plain-text chat backup ---- */
function downloadBlob(blob,filename){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
function chatBackup(){
  const r=currentRole();if(!r){sys("No role selected — nothing to back up.","err");return false;}
  const hist=currentHistory();if(!hist.length){sys("No messages to back up.","err");return false;}
  const d=new Date();const stamp=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+"_"+String(d.getHours()).padStart(2,"0")+String(d.getMinutes()).padStart(2,"0")+String(d.getSeconds()).padStart(2,"0");
  const gistUrl=r.gistUrl||r.sourceGist||"";
  const filename="chat_"+(gistUrl||"unknown").replace(/[^a-zA-Z0-9]/g,"_")+"_"+stamp+".txt";
  const transcript="gist_url:["+gistUrl+"]\n\n"+hist.map(m=>(m.role==="user"?"user":"assistant")+" -----------\n"+m.content).join("\n\n")+"\n";
  downloadBlob(new Blob([transcript],{type:"text/plain;charset=utf-8"}),filename);
  sys("📝 Backup downloaded: "+filename+" ("+hist.length+" messages).");
  return true;
}
function clearChat(noBackup){
  if(!state.activeRoleId){sys("No chat to clear.");return;}
  const hist=currentHistory();
  if(!hist.length){sys("Chat is already empty.");return;}
  if(!noBackup)chatBackup();
  state.pendingClear=false;
  state.chats[state.activeRoleId]=[];
  saveChats(state.chats);
  renderRoles();
  renderChat();
  sys("🧹 Memory (context) wiped. Start fresh!");
}
function showStatus(){
  const h=currentHistory();const r=currentRole();
  const len=state.length==null?"auto (no limit)":"approximately "+state.length+" words";
  const mem=h.length+" messages (limit 50)";
  const ctx="32K (32768)";
  const th=state.think?"On (slower)":"Off";
  sys("📏 Response length: "+len+"\n💬 Memory: "+mem+"\n📐 Context: "+ctx+"\n💭 Thinking: "+th+(r?"\n🎭 Role: "+r.name+" · Mode: "+state.mode:""));
}
function delLast(){
  const h=currentHistory();
  if(!h.length){sys("No messages to delete.");return;}
  if(h[h.length-1].role==="assistant")h.pop();
  if(h.length&&h[h.length-1].role==="user")h.pop();
  saveChats(state.chats);renderRoles();renderChat();
  sys("🗑 Deleted last message + response ("+h.length+" messages left).");
}
async function recap(){
  const hist=currentHistory();
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
  const hist=currentHistory();
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
  if(role){renderRoles();selectRole(role.id);sys("✅ Installed & switched to: "+role.name+(role.thumbUrl?" (thumbnail loaded)":" (no thumbnail found)"));}
  else sys("❌ Install failed. Check the Gist URL and that it contains a GOCHATAPPROLETAG_*.txt file.","err");
}
function handleCommand(raw){
  const t=raw.trim();if(!t.startsWith("."))return false;
  const parts=t.slice(1).trim().split(/\s+/);const cmd=(parts[0]||"").toLowerCase();const arg=parts.slice(1).join(" ").trim();
  if(cmd==="mode"){if(["chat","story"].includes(arg.toLowerCase())){setMode(arg.toLowerCase());}else sys("Usage: .mode chat  |  .mode story");return true;}
  if(cmd==="m"){if(["chat","story"].includes(arg.toLowerCase())){setMode(arg.toLowerCase());}else sys("Usage: .m chat  |  .m story");return true;}
  if(cmd==="s"){showStatus();return true;}
  if(cmd==="h"){sys("Commands:\n.think [on|off|toggle] — toggle thinking (off = preferred, faster)\n.length [n|auto|reset] — set reply length in words (n), or auto/reset removes the limit\n.clear [noback] — download a .txt backup, then wipe memory; noback skips the download\n.recap [n] — summarize last 50 messages using prompt n\n.ask [text] — ask outside roleplay (with history)\n.del — delete last message + response\n.backup — download this chat as a .txt file without clearing\n.install <gist-url> — install role from Gist\n.mode chat|story — switch context mode\n.m chat|story — shortcut for .mode\n.role summary — summarize this person's traits (not added to context)\n.status — show length, memory, context, thinking\n.s — shortcut for .status\n.help — list commands\n.h — shortcut for .help");return true;}
  if(cmd==="i"){const url=arg.split(/\s+/)[0]||"";if(!url){sys("Usage: .i https://gist.github.com/<user>/<id>");return true;}installGist(url);return true;}
  if(cmd==="think"){const a=arg.toLowerCase();if(a===""||a==="toggle")setThink(!state.think);else if(a==="on")setThink(true);else if(a==="off")setThink(false);else sys("Usage: .think [on|off|toggle] — off = preferred, faster");renderChat();return true;}
  if(cmd==="voice"){const a=arg.toLowerCase();if(a===""||a==="toggle"){state.voice=!state.voice;localStorage.setItem(LS.voice,state.voice?"1":"0");}else if(a==="on"){state.voice=true;localStorage.setItem(LS.voice,"1");}else if(a==="off"){state.voice=false;localStorage.setItem(LS.voice,"0");}else{sys("Usage: .voice [on|off|toggle] — toggle Edge TTS voice (SoniaNeural)");return true;}$("voiceToggle").checked=state.voice;sys(state.voice?"🔊 Voice ON — each AI reply gets a play button (SoniaNeural).":"🔇 Voice OFF — text only.");return true;}
  if(cmd==="length"){const a=arg.toLowerCase();if(a==="auto"||a==="reset")setLength(null);else if(a){const n=parseInt(a,10);if(isNaN(n)||n<1)sys("Usage: .length [n|auto|reset] — approximate response length in words");else setLength(n);}else sys("Reply length: "+(state.length==null?"auto (no limit)":"~"+state.length+" words"));renderChat();return true;}
  if(cmd==="del"){delLast();return true;}
  if(cmd==="backup"){chatBackup();return true;}
  if(cmd==="recap"){recap();return true;}
  if(cmd==="ask"){ask(arg);return true;}
  if(cmd==="clear"){clearChat(arg.toLowerCase()==="noback");return true;}
  if(cmd==="role"){if(!arg||arg.toLowerCase()!=="summary"){sys("Usage: .role summary — summarize this person's traits (not added to context)");return true;}roleSummary();return true;}
  if(cmd==="install"){const url=arg.split(/\s+/)[0]||"";if(!url){sys("Usage: .install https://gist.github.com/<user>/<id>");return true;}installGist(url);return true;}
  if(cmd==="status"){showStatus();return true;}
  if(cmd==="help"){sys("Commands:\n.think [on|off|toggle] — toggle thinking (off = preferred, faster)\n.length [n|auto|reset] — set reply length in words (n), or auto/reset removes the limit\n.clear [noback] — download a .txt backup, then wipe memory; noback skips the download\n.recap [n] — summarize last 50 messages using prompt n\n.ask [text] — ask outside roleplay (with history)\n.del — delete last message + response\n.backup — download this chat as a .txt file without clearing\n.install <gist-url> — install role from Gist\n.mode chat|story — switch context mode\n.role summary — summarize this person's traits (not added to context)\n.status — show length, memory, context, thinking\n.help — list commands");return true;}
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
  const hist=currentHistory();
  const context=state.mode==="story"?[hist[hist.length-1]]:hist;
  let sysPrompt=role.prompt||"";
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
    utter.rate = 1.0;
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
  if(state.roles.length)selectRole(state.roles[0].id);else renderChat();
  if(!state.roles.length)sys("👋 Welcome! There's no role yet — type:\n.install https://gist.github.com/gochatapp/0653c10f46341223b5a3370af74c6528\n…or any Gist containing a GOCHATAPPROLETAG_*.txt file, and I'll install it.");
  setTimeout(()=>setSetupMsg(""),2500);
}
/* ================= events & init ================= */
$("loadModels").onclick=loadModels;
$("saveSetup").onclick=saveSetup;
$("modelFilter").oninput=applyFilter;
$("modelSelect").onchange=e=>pickModel(e.target.value);
$("thinkToggle").onchange=e=>{state.think=!!e.target.checked;localStorage.setItem(LS.think,state.think?"1":"0");setSetupMsg(state.think?"🧠 Thinking ON — replies may be slower and use more tokens.":"💬 Thinking OFF — faster, fewer tokens.","ok");};
$("voiceToggle").onchange=e=>{state.voice=!!e.target.checked;localStorage.setItem(LS.voice,state.voice?"1":"0");setSetupMsg(state.voice?"🔊 Voice ON — each AI reply gets a play button (SoniaNeural).":"🔇 Voice OFF — text only.","ok")};
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
  if(r){$("newGist").value="";renderRoles();selectRole(r.id);closeSidebar();}
};
$("newGist").addEventListener("keydown",e=>{if(e.key==="Enter")$("addRoleBtn").click();});
window.addEventListener("resize",()=>{if(window.innerWidth>760)closeSidebar();});
boot();
