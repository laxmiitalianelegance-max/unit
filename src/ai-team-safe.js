import app from "./world-safe.js";

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}

async function synthesize(request,env){
  try{
    const body=await request.json();
    const question=String(body.question||"").trim();
    const answers=body.answers&&typeof body.answers==="object"?body.answers:{};
    const usable=Object.entries(answers).filter(function(x){return typeof x[1]==="string"&&x[1].trim()});
    if(!question||usable.length<2)return json({error:"At least two answers are required."},400);
    if(!env.AI)return json({error:"Workers AI unavailable."},503);
    const joined=usable.map(function(x){return "["+x[0]+"]\n"+x[1]}).join("\n\n");
    const prompt="User question:\n"+question+"\n\nTeam answers:\n"+joined+"\n\nReturn ONLY valid JSON with keys summary, consensus, disagreements, risks, recommendation, next_steps. Answer in the same language as the user question.";
    const result=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"system",content:"You synthesize multiple AI answers. Return only valid JSON."},{role:"user",content:prompt}],max_tokens:1600});
    let text=String(result&&result.response||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
    const a=text.indexOf("{"),b=text.lastIndexOf("}");
    if(a>=0&&b>a)text=text.slice(a,b+1);
    return json({result:JSON.parse(text)});
  }catch(error){return json({error:String(error&&error.message||error).slice(0,500)},500)}
}

const STYLE=String.raw`<style id="u369-ai-safe-style">
.u369-roles{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:0 0 12px}.u369-role{padding:9px;border:1px solid #1d3045;border-radius:11px;background:#08111b;min-width:0}.u369-role b{display:block;font-size:10px;color:#e5f2ff}.u369-role span{display:block;margin-top:3px;font-size:8.5px;color:#70859e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.u369-sessionbar{display:flex;gap:7px;align-items:center;margin:0 0 11px}.u369-session-title{flex:1;min-width:0;font-size:10px;color:#7f93ab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.u369-mini{border:1px solid #24445f;border-radius:8px;background:#091521;color:#71caff;padding:7px 9px;font-size:9px;font-weight:800}.u369-history{display:none;margin-bottom:12px;border:1px solid #1d3045;border-radius:12px;background:#07101a;padding:8px;max-height:250px;overflow:auto}.u369-history.open{display:block}.u369-hrow{display:flex;gap:7px;align-items:center;padding:8px 2px;border-bottom:1px solid #142337}.u369-hrow:last-child{border-bottom:0}.u369-hmain{flex:1;min-width:0}.u369-hq{font-size:10px;color:#d8e6f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.u369-hmeta{font-size:8px;color:#647890;margin-top:2px}.u369-state{margin-left:auto;font-size:8px;padding:3px 6px;border-radius:999px;background:#102238;color:#69bfff}.u369-state.off{background:#26151b;color:#ff8392}.u369-roleline{font-size:9px;color:#6f8298;padding:8px 13px 0}.u369-actions{display:flex;gap:7px;padding:0 13px 12px}.u369-final{margin-top:14px;border:1px solid #27557b;border-radius:14px;background:#081522;overflow:hidden}.u369-final h3{margin:0;padding:11px 13px;font-size:12px;color:#65caff;border-bottom:1px solid #1b3650}.u369-final section{padding:9px 13px;border-bottom:1px solid #142a40}.u369-final section:last-child{border-bottom:0}.u369-final h4{margin:0 0 4px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#70bfff}.u369-final div{font-size:13px;line-height:1.5;color:#dce7f4;white-space:pre-wrap}@media(max-width:390px){.u369-roles{grid-template-columns:repeat(2,1fr)}}html[dir="rtl"] .u369-sessionbar,html[dir="rtl"] .u369-hrow,html[dir="rtl"] .u369-actions{flex-direction:row-reverse}
</style>`;

const CLIENT=String.raw`(function(){
var $=function(s){return document.querySelector(s)};
var all=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
var STORE='unit369-team-safe-v1',CUR='unit369-team-safe-current-v1';
var ROLES={claude:{name:'Claude',role:'Strategist'},openai:{name:'ChatGPT',role:'Builder'},grok:{name:'Grok',role:'Challenger'},workers:{name:'Workers AI',role:'Verifier'}};
var sessions=[],current=null,status={},running=false;
function esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
function load(){try{sessions=JSON.parse(localStorage.getItem(STORE)||'[]')}catch(e){sessions=[]}var id=localStorage.getItem(CUR);current=sessions.find(function(x){return x.id===id})||sessions[0]||null}
function save(){try{localStorage.setItem(STORE,JSON.stringify(sessions.slice(0,30)));if(current)localStorage.setItem(CUR,current.id)}catch(e){}}
function fresh(){current={id:'s'+Date.now()+Math.random().toString(36).slice(2,7),title:'',createdAt:Date.now(),updatedAt:Date.now(),turns:[]};sessions.unshift(current);save();renderTitle();clearPanels()}
function renderTitle(){var e=$('#u369-session-title');if(e)e.textContent=current&&current.title?current.title:'New session'}
function clearPanels(){var p=$('#panels');if(p)p.innerHTML='';var q=$('#prompt');if(q)q.value=''}
function providerOn(p){var i=status.integrations||{};return p==='workers'?!!i.workersAi:!!i[p]}
function historyFor(p){var out=[];(current&&current.turns||[]).slice(-5).forEach(function(t){out.push({role:'user',content:t.q});if(t.answers&&t.answers[p])out.push({role:'assistant',content:t.answers[p]})});return out}
function systemFor(p){var m={claude:'You are the strategic analyst. Find goals, constraints, tradeoffs and the strongest strategy.',openai:'You are the builder. Produce an executable solution with precise steps.',grok:'You are the challenger. Stress-test assumptions, edge cases and blind spots.',workers:'You are the verifier. Check logic, unsupported claims and give a neutral alternative.'};return m[p]+' Answer in the user language.'}
async function ask(p,q){var messages=[{role:'system',content:systemFor(p)}].concat(historyFor(p),[{role:'user',content:q}]);var url=p==='workers'?'/api/free-ai':'/api/ai-proxy';var body=p==='workers'?{messages:messages}:{provider:p,messages:messages,max_tokens:1500};var r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});var d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'AI request failed');return d.content||d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||''}
function mount(){var team=$('#page-team');if(!team||$('#u369-roles'))return;var roles=document.createElement('div');roles.id='u369-roles';roles.className='u369-roles';roles.innerHTML=Object.keys(ROLES).map(function(k){var r=ROLES[k];return '<div class="u369-role"><b>'+esc(r.name)+'</b><span>'+esc(r.role)+'</span></div>'}).join('');var anchor=team.querySelector('.section-sub');if(anchor)anchor.after(roles);var bar=document.createElement('div');bar.className='u369-sessionbar';bar.innerHTML='<div id="u369-session-title" class="u369-session-title"></div><button type="button" class="u369-mini" id="u369-new">＋</button><button type="button" class="u369-mini" id="u369-history-btn">☰</button>';roles.after(bar);var hist=document.createElement('div');hist.id='u369-history';hist.className='u369-history';bar.after(hist);$('#u369-new').onclick=fresh;$('#u369-history-btn').onclick=function(){hist.classList.toggle('open');renderHistory()};renderTitle()}
function renderHistory(){var h=$('#u369-history');if(!h)return;if(!sessions.length){h.innerHTML='<div class="u369-hq">No sessions</div>';return}h.innerHTML=sessions.map(function(s){return '<div class="u369-hrow"><div class="u369-hmain"><div class="u369-hq">'+esc(s.title||'New session')+'</div><div class="u369-hmeta">'+new Date(s.updatedAt||s.createdAt).toLocaleString()+'</div></div><button type="button" class="u369-mini" data-open="'+s.id+'">Open</button></div>'}).join('');all('[data-open]').forEach(function(b){b.onclick=function(){current=sessions.find(function(x){return x.id===b.getAttribute('data-open')})||current;save();renderTitle();restore();h.classList.remove('open')}})}
function card(p){var r=ROLES[p],on=providerOn(p);return '<div class="panel" data-u369-p="'+p+'"><div class="panel-head">'+esc(r.name)+'<span class="u369-state '+(on?'':'off')+'">'+(on?'ON':'OFF')+'</span></div><div class="u369-roleline">'+esc(r.role)+'</div><div class="panel-body '+(on?'loading':'err')+'">'+(on?'working...':'Not connected')+'</div><div class="u369-actions"><button type="button" class="u369-mini" data-copy="'+p+'">Copy</button></div></div>'}
function wireCopy(){all('[data-copy]').forEach(function(b){b.onclick=function(){var p=b.getAttribute('data-copy');var e=$('[data-u369-p="'+p+'"] .panel-body');if(e&&navigator.clipboard)navigator.clipboard.writeText(e.textContent||'')}})}
function restore(){var t=current&&current.turns&&current.turns[current.turns.length-1];if(!t){clearPanels();return}var box=$('#panels');if(!box)return;box.innerHTML=Object.keys(ROLES).map(card).join('');Object.keys(ROLES).forEach(function(p){var e=$('[data-u369-p="'+p+'"] .panel-body');if(!e)return;if(t.answers&&t.answers[p]){e.className='panel-body';e.textContent=t.answers[p]}else if(t.errors&&t.errors[p]){e.className='panel-body err';e.textContent=t.errors[p]}});wireCopy();if(t.synthesis)renderFinal(t.synthesis)}
async function run(){if(running)return;var q=$('#prompt')&&$('#prompt').value.trim();if(!q)return;if(!current)fresh();running=true;var btn=$('#sendBtn');if(btn)btn.disabled=true;var box=$('#panels');if(!box){running=false;if(btn)btn.disabled=false;return}box.innerHTML=Object.keys(ROLES).map(card).join('');var turn={q:q,at:Date.now(),answers:{},errors:{},synthesis:null};var active=Object.keys(ROLES).filter(providerOn);await Promise.all(active.map(async function(p){var e=$('[data-u369-p="'+p+'"] .panel-body');try{var a=await ask(p,q);turn.answers[p]=a;if(e){e.className='panel-body';e.textContent=a}}catch(err){turn.errors[p]=err.message;if(e){e.className='panel-body err';e.textContent=err.message}}}));current.turns.push(turn);if(!current.title)current.title=q.slice(0,80);current.updatedAt=Date.now();sessions=[current].concat(sessions.filter(function(s){return s.id!==current.id}));save();renderTitle();wireCopy();running=false;if(btn)btn.disabled=false;var mode=$('.mode.active');mode=mode&&mode.getAttribute('data-mode');if(mode==='combine'||mode==='critique')await synth()}
async function synth(){var t=current&&current.turns&&current.turns[current.turns.length-1];if(!t)return;var usable=Object.keys(t.answers||{}).filter(function(k){return t.answers[k]});if(usable.length<2)return;var r=await fetch('/api/team-synthesize-safe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:t.q,answers:t.answers})});var d=await r.json();if(!r.ok||d.error)return;t.synthesis=d.result;save();renderFinal(d.result)}
function renderFinal(s){var box=$('#panels');if(!box)return;var f=$('#u369-final');if(!f){f=document.createElement('div');f.id='u369-final';f.className='u369-final';box.appendChild(f)}var order=[['summary','Summary'],['consensus','Consensus'],['disagreements','Disagreements'],['risks','Risks'],['recommendation','Recommendation'],['next_steps','Next steps']];f.innerHTML='<h3>Unit369 Final</h3>'+order.map(function(x){return s&&s[x[0]]?'<section><h4>'+x[1]+'</h4><div>'+esc(s[x[0]])+'</div></section>':''}).join('')}
function takeover(){var old=$('#sendBtn');if(old){var n=old.cloneNode(true);old.parentNode.replaceChild(n,old);n.addEventListener('click',function(e){e.preventDefault();run()})}var f=$('#fb');if(f)f.onclick=synth;var ns=$('#ns');if(ns)ns.onclick=fresh;var hb=$('#hb');if(hb)hb.onclick=function(){var h=$('#u369-history');if(h){h.classList.toggle('open');renderHistory()}}}
async function boot(){load();try{var r=await fetch('/api/status',{cache:'no-store'});status=await r.json()}catch(e){status={integrations:{}}}if(!current)fresh();mount();takeover();restore()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,120)});else setTimeout(boot,120);
})();`;

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==="/api/team-synthesize-safe"&&request.method==="POST")return synthesize(request,env);
  if(url.pathname==="/ai-team-safe-client.js")return new Response(CLIENT,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store"}});
  const response=await app.fetch(request,env,ctx);
  const type=response.headers.get("content-type")||"";
  if(request.method==="GET"&&(url.pathname==="/"||url.pathname==="/app")&&type.includes("text/html")){
    const html=(await response.text()).replace(/<\/head>/i,STYLE+"</head>").replace(/<\/body>/i,'<script src="/ai-team-safe-client.js?v=1"></script></body>');
    const headers=new Headers(response.headers);headers.delete("content-length");headers.set("cache-control","no-store");
    return new Response(html,{status:response.status,statusText:response.statusText,headers:headers});
  }
  return response;
}};