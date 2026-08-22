import app from "./conversation-safe.js";

const STYLE=String.raw`<style id="u369-chat-runtime-style">
/* Hide legacy AI dashboard immediately, before any shell JS runs. */
#page-team>.session-actions,#page-team>.u369-sessionbar,#page-team>#u369-roles,#page-team>#u369-history,#page-team>.modes,#page-team>#panels,#page-team>.workspace-label,#page-team>.section-label{display:none!important}
#page-team .promptbox{visibility:hidden}
body.u369-shell #page-team .promptbox{visibility:visible}
</style>`;

const CLIENT=String.raw`(()=>{
const $=s=>document.querySelector(s),STORE='unit369-team-safe-v1',CUR='unit369-team-safe-current-v1';
let sending=false;
function load(){try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch(e){return[]}}
function save(a,current){localStorage.setItem(STORE,JSON.stringify(a.slice(0,30)));if(current)localStorage.setItem(CUR,current.id)}
function currentSession(){let a=load(),id=localStorage.getItem(CUR),s=a.find(x=>x.id===id)||a[0];if(!s){s={id:'s'+Date.now()+Math.random().toString(36).slice(2,7),title:'',createdAt:Date.now(),updatedAt:Date.now(),turns:[]};a.unshift(s);save(a,s)}return {a,s}}
function historyMessages(s){const out=[];(s.turns||[]).slice(-8).forEach(t=>{if(t.q)out.push({role:'user',content:t.q});const a=t.answers||{},ans=a.workers||a.openai||a.claude||a.grok;if(ans)out.push({role:'assistant',content:ans})});return out}
async function askWorkers(s,q){const messages=[{role:'system',content:'You are Unit369, a concise and capable assistant. Answer in the same language as the user.'},...historyMessages(s),{role:'user',content:q}];const r=await fetch('/api/free-ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages})});let d={};try{d=await r.json()}catch(e){}if(!r.ok||d.error)throw new Error(typeof d.error==='string'?d.error:'AI request failed');return d.content||d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||''}
function notify(){window.dispatchEvent(new Event('unit369-chat-updated'))}
async function send(e){if(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()}if(sending)return;const input=$('#prompt'),q=input&&input.value.trim();if(!q)return;sending=true;const btn=$('#sendBtn');if(btn)btn.disabled=true;const {a,s}=currentSession();const turn={q,at:Date.now(),answers:{},errors:{},synthesis:null,pending:true};s.turns=s.turns||[];s.turns.push(turn);if(!s.title)s.title=q.slice(0,80);s.updatedAt=Date.now();save([s,...a.filter(x=>x.id!==s.id)],s);input.value='';input.style.height='auto';notify();try{const ans=await askWorkers(s,q);turn.answers.workers=ans||'(empty response)';delete turn.pending}catch(err){turn.errors.workers=String(err&&err.message||err);turn.answers.workers='Došlo je do problema pri odgovoru. Pokušaj ponovo.';delete turn.pending}finally{s.updatedAt=Date.now();const list=load();save([s,...list.filter(x=>x.id!==s.id)],s);sending=false;if(btn)btn.disabled=false;notify()}}
function bind(){const btn=$('#sendBtn'),input=$('#prompt');if(!btn||!input||btn.dataset.chatRuntime==='1')return false;btn.dataset.chatRuntime='1';btn.addEventListener('click',send,true);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(e)}},true);return true}
function boot(){bind();const mo=new MutationObserver(()=>bind());mo.observe(document.body,{childList:true,subtree:true})}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,20)):setTimeout(boot,20);
})();`;

export default{async fetch(request,env,ctx){const r=await app.fetch(request,env,ctx);const u=new URL(request.url),t=r.headers.get('content-type')||'';if(request.method==='GET'&&(u.pathname==='/'||u.pathname==='/app')&&t.includes('text/html')){const html=(await r.text()).replace(/<\/head>/i,STYLE+'</head>').replace(/<\/body>/i,'<script>'+CLIENT+'</script></body>');const h=new Headers(r.headers);h.delete('content-length');h.set('cache-control','no-store');return new Response(html,{status:r.status,statusText:r.statusText,headers:h})}return r}};