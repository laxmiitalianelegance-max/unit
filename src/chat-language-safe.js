import app from "./chat-final-safe.js";

const CLIENT=String.raw`(()=>{
const K='u369-lang-all-v4';
function selected(){const v=localStorage.getItem(K)||'auto';return v==='auto'?(navigator.language||'en'):v}
function instruction(lang){const c=String(lang||'en').toLowerCase().split('-')[0];
if(c==='sr')return 'You are Unit369. Reply in natural standard Serbian, preferably Ekavian when the user writes Ekavian. Do not mix Serbian with Croatian or Bosnian variants. Avoid Croatian-specific words such as Bok, tisuća, računalo, siječanj, veljača, zrakoplov, tvrtka, and similar regionalisms unless the user explicitly uses or asks for them. Sound natural, direct and conversational, not translated or robotic. Use Latin script when the user writes Latin script, and Cyrillic when the user writes Cyrillic. Be helpful, accurate and concise.';
if(c==='hr')return 'You are Unit369. Reply in natural standard Croatian. Do not mix in Serbian or Bosnian variants unless the user explicitly asks for them. Sound natural and conversational. Be helpful, accurate and concise.';
if(c==='bs')return 'You are Unit369. Reply in natural standard Bosnian. Do not mix in Serbian or Croatian variants unless the user explicitly asks for them. Sound natural and conversational. Be helpful, accurate and concise.';
return 'You are Unit369. Reply naturally and idiomatically in the selected application language: '+lang+'. Do not mix neighboring regional language variants unless the user explicitly asks for that. Match the user script and tone when appropriate. Be helpful, accurate and concise.'}
const native=window.fetch.bind(window);
window.fetch=async function(input,init){try{const u=typeof input==='string'?input:(input&&input.url)||'';if(u.includes('/api/free-ai')&&init&&init.body){const b=JSON.parse(init.body);if(Array.isArray(b.messages)){const sys=instruction(selected());if(b.messages[0]&&b.messages[0].role==='system')b.messages[0]={...b.messages[0],content:sys};else b.messages.unshift({role:'system',content:sys});init={...init,body:JSON.stringify(b)}}}}catch(e){}return native(input,init)};
})();`;

export default{async fetch(request,env,ctx){const r=await app.fetch(request,env,ctx);const u=new URL(request.url),t=r.headers.get('content-type')||'';if(request.method==='GET'&&(u.pathname==='/'||u.pathname==='/app')&&t.includes('text/html')){const html=(await r.text()).replace(/<\/body>/i,'<script>'+CLIENT+'</script></body>');const h=new Headers(r.headers);h.delete('content-length');h.set('cache-control','no-store');return new Response(html,{status:r.status,statusText:r.statusText,headers:h})}return r}};