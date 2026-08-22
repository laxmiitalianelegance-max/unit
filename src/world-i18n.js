import app from "./unit369.js";

const BASE = {
  ai:"AI Team", ais:"Ask one question and compare answers from multiple AI models.", prod:"Products", prods:"Add new products and manage entries in one place.", set:"Settings", sets:"Unit369 application settings.", mode:"Work mode", side:"Side by side", combine:"Combined answer", crit:"Cross-critique", newq:"New question", ph:"Ask all models a question...", send:"Send", answers:"Answers", newsession:"＋ New session", history:"History", final:"Final answer", lang:"Application language", integr:"Integrations", app:"Application", general:"General", notif:"Notifications", theme:"Theme", dark:"Dark", language:"Language", about:"About", compact:"Compact view", version:"Version", clear:"Clear AI history", status:"Status", draft:"Draft — review before publishing", publish:"Publish now", sku:"SKU base", ptype:"Product type", vendor:"Vendor", tags:"Tags", images:"Images", latest:"Latest products", title:"Product name", price:"Price", sizes:"Sizes", desc:"Description", video:"Video", add:"Add product", saved:"Language changed", loading:"Translating interface...", custom:"Custom language", customPh:"Language name or BCP-47 code", apply:"Apply", unavailable:"Translation service unavailable; English fallback is active.", open:"Open", nohistory:"No history.", copy:"Copy", continue:"Continue", working:"working...", noanswer:"(no answer)", needtwo:"Two answers are required", merging:"merging...", critiqueTitle:"Cross-critique", analyzing:"analyzing...", enterq:"Enter a question", preview:"Preview", confirm:"Tap again to confirm.", confirmsave:"Confirm and save", saving:"Saving...", savedProduct:"Product saved", integrationsNote:"API keys are server-side Cloudflare secrets.", compactOn:"On", compactOff:"Off", auto:"Automatic (device language)"
};

const LANGS = [
["auto","Automatic"],["af","Afrikaans"],["sq","Shqip"],["am","አማርኛ"],["ar","العربية"],["hy","Հայերեն"],["az","Azərbaycanca"],["eu","Euskara"],["be","Беларуская"],["bn","বাংলা"],["bs","Bosanski"],["bg","Български"],["my","မြန်မာ"],["ca","Català"],["zh-CN","中文（简体）"],["zh-TW","中文（繁體）"],["hr","Hrvatski"],["cs","Čeština"],["da","Dansk"],["nl","Nederlands"],["en","English"],["eo","Esperanto"],["et","Eesti"],["fi","Suomi"],["fr","Français"],["gl","Galego"],["ka","ქართული"],["de","Deutsch"],["el","Ελληνικά"],["gu","ગુજરાતી"],["ht","Kreyòl ayisyen"],["ha","Hausa"],["he","עברית"],["hi","हिन्दी"],["hu","Magyar"],["is","Íslenska"],["ig","Igbo"],["id","Bahasa Indonesia"],["ga","Gaeilge"],["it","Italiano"],["ja","日本語"],["jv","Basa Jawa"],["kn","ಕನ್ನಡ"],["kk","Қазақша"],["km","ខ្មែរ"],["ko","한국어"],["ku","Kurdî"],["ky","Кыргызча"],["lo","ລາວ"],["lv","Latviešu"],["lt","Lietuvių"],["mk","Македонски"],["ms","Bahasa Melayu"],["ml","മലയാളം"],["mt","Malti"],["mi","Māori"],["mr","मराठी"],["mn","Монгол"],["ne","नेपाली"],["no","Norsk"],["ps","پښتو"],["fa","فارسی"],["pl","Polski"],["pt","Português"],["pa","ਪੰਜਾਬੀ"],["ro","Română"],["ru","Русский"],["sr","Srpski"],["sk","Slovenčina"],["sl","Slovenščina"],["so","Soomaali"],["es","Español"],["sw","Kiswahili"],["sv","Svenska"],["tl","Filipino"],["ta","தமிழ்"],["te","తెలుగు"],["th","ไทย"],["tr","Türkçe"],["uk","Українська"],["ur","اردو"],["uz","O‘zbekcha"],["vi","Tiếng Việt"],["cy","Cymraeg"],["xh","isiXhosa"],["yi","ייִדיש"],["yo","Yorùbá"],["zu","isiZulu"],["custom","Custom language"]
];

const RTL = new Set(["ar","fa","he","ur","ps","yi","ku"]);

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}

async function translate(request,env){
  try{
    if(!env.AI)return json({error:"Workers AI is unavailable."},503);
    const body=await request.json();
    const target=String(body.target||"").trim();
    if(!target)return json({error:"Missing target language."},400);
    if(target.toLowerCase()==="en"||target.toLowerCase().startsWith("en-"))return json({dictionary:BASE,dir:"ltr"});
    const prompt=`Translate the JSON values below into ${target}. Return ONLY valid JSON with exactly the same keys. Preserve Unit369, AI, API, SKU, provider names Claude, OpenAI, Grok, Workers AI, Shopify, and symbols. Use natural native UI language, concise labels, and correct script. JSON:\n${JSON.stringify(BASE)}`;
    const result=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"system",content:"You are a software localization engine. Output only valid JSON, never markdown."},{role:"user",content:prompt}],max_tokens:3000});
    let text=String(result?.response||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
    const first=text.indexOf("{");const last=text.lastIndexOf("}");if(first>=0&&last>first)text=text.slice(first,last+1);
    const parsed=JSON.parse(text);
    const dictionary={...BASE};for(const k of Object.keys(BASE))if(typeof parsed[k]==="string"&&parsed[k].trim())dictionary[k]=parsed[k].trim();
    const code=String(body.code||target).toLowerCase().split("-")[0];
    return json({dictionary,dir:RTL.has(code)?"rtl":"ltr"});
  }catch(error){return json({error:String(error?.message||error).slice(0,400)},500)}
}

const CLIENT = String.raw`(()=>{
const BASE=${JSON.stringify(BASE)};
const LANGS=${JSON.stringify(LANGS)};
const RTL=new Set(${JSON.stringify([...RTL])});
const KEY='unit369-language-v2',CACHE='unit369-i18n-cache-v2:';
const $=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
let lang=localStorage.getItem(KEY)||'auto', D=BASE, busy=false;
function resolved(){if(lang!=='auto')return lang;return (navigator.languages&&navigator.languages[0])||navigator.language||'en'}
function code(){return resolved().toLowerCase().split('-')[0]}
function t(k){return D[k]||BASE[k]||k}
function tx(s,v){const e=$(s);if(e)e.textContent=v}
function label(name,v){const e=$('[name="'+name+'"]');if(e&&e.previousElementSibling?.tagName==='LABEL')e.previousElementSibling.textContent=v}
function toast(v){let e=$('.toast');if(!e){e=document.createElement('div');e.className='toast';document.body.appendChild(e)}e.textContent=v;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',1800)}
function dir(){const c=code();document.documentElement.dir=RTL.has(c)?'rtl':'ltr';document.documentElement.lang=resolved()}
function cacheGet(k){try{return JSON.parse(localStorage.getItem(CACHE+k)||'')}catch{return null}}
function cacheSet(k,v){try{localStorage.setItem(CACHE+k,JSON.stringify(v))}catch{}}
async function loadLanguage(target){
  const r=target==='auto'?resolved():target;const c=r.toLowerCase();
  if(c==='en'||c.startsWith('en-')){D=BASE;dir();apply();return}
  const cached=cacheGet(c);if(cached){D={...BASE,...cached};dir();apply();return}
  if(busy)return;busy=true;toast(BASE.loading);
  try{const res=await fetch('/api/i18n',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({target:r,code:r})});const data=await res.json();if(!res.ok||data.error)throw Error(data.error||'translate');D={...BASE,...data.dictionary};cacheSet(c,D);document.documentElement.dir=data.dir||'ltr'}catch(e){D=BASE;toast(BASE.unavailable)}finally{busy=false;dir();apply()}
}
function ensureSelector(){const s=$('#page-settings');if(!s)return;let c=$('#u369-world-lang');if(!c){c=document.createElement('div');c.id='u369-world-lang';c.className='keys settings-card';c.innerHTML='<div class="settings-heading" id="u369-lang-h"></div><select id="u369-lang-s" class="sel"></select><div id="u369-custom-wrap" style="display:none;margin-top:10px"><input id="u369-custom" class="sel" placeholder="Language name or BCP-47 code"><button id="u369-custom-go" class="ub" style="margin-top:8px">Apply</button></div>';const cards=s.querySelectorAll('.settings-card');s.insertBefore(c,cards[1]||null);const sel=$('#u369-lang-s');LANGS.forEach(([v,n])=>sel.add(new Option(n,v)));sel.onchange=()=>{if(sel.value==='custom'){$('#u369-custom-wrap').style.display='block';return}$('#u369-custom-wrap').style.display='none';lang=sel.value;localStorage.setItem(KEY,lang);loadLanguage(lang);toast(t('saved'))};$('#u369-custom-go').onclick=()=>{const v=$('#u369-custom').value.trim();if(!v)return;lang=v;localStorage.setItem(KEY,lang);loadLanguage(lang);toast(t('saved'))}}tx('#u369-lang-h',t('lang'));const sel=$('#u369-lang-s');if(LANGS.some(x=>x[0]===lang)){sel.value=lang;$('#u369-custom-wrap').style.display='none'}else{sel.value='custom';$('#u369-custom-wrap').style.display='block';$('#u369-custom').value=lang}$('#u369-custom').placeholder=t('customPh');$('#u369-custom-go').textContent=t('apply')}
function replaceSettingsRows(){all('#page-settings .setting-row').forEach(r=>{const a=r.querySelector('span:first-child'),b=r.querySelector('span:last-child');if(!a)return;const q=a.dataset.i18n||a.textContent.toLowerCase();if(!a.dataset.i18n){if(/notif/.test(q))a.dataset.i18n='notif';else if(/tema|theme|design/.test(q))a.dataset.i18n='theme';else if(/jezik|language|lingua|sprache/.test(q))a.dataset.i18n='language';else if(/o aplik|about|info app|über/.test(q))a.dataset.i18n='about';else if(/kompakt|compact/.test(q))a.dataset.i18n='compact';else if(/verz|version/.test(q))a.dataset.i18n='version';else if(/obriši|clear ai|cancella|verlauf/.test(q))a.dataset.i18n='clear'}if(a.dataset.i18n)a.textContent=t(a.dataset.i18n);if(b&&/Tamna|Dark|Scuro|Dunkel/.test(b.textContent))b.textContent=t('dark')})}
function apply(){
  dir();tx('#page-team .section-title',t('ai'));tx('#page-team .section-sub',t('ais'));tx('#page-product .section-title',t('prod'));tx('#page-product .section-sub',t('prods'));tx('#page-settings .section-title',t('set'));tx('#page-settings .section-sub',t('sets'));
  const w=all('.workspace-label');if(w[0])w[0].textContent=t('mode');if(w[1])w[1].textContent=t('newq');if(w[2])w[2].textContent=t('answers');
  const m=all('.mode');if(m[0])m[0].textContent=t('side');if(m[1])m[1].textContent=t('combine');if(m[2])m[2].textContent=t('crit');const p=$('#prompt');if(p)p.placeholder=t('ph');tx('#sendBtn',t('send'));
  const n=all('nav.bottomnav .navitem');if(n[0])n[0].textContent=t('ai');if(n[1])n[1].textContent=t('prod');if(n[2])n[2].textContent=t('set');tx('#ns',t('newsession'));tx('#hb',t('history'));tx('#fb',t('final'));
  label('title',t('title'));label('price',t('price'));label('sizes',t('sizes'));label('description',t('desc'));label('video',t('video'));label('status',t('status'));label('sku',t('sku'));label('productType',t('ptype'));label('vendor',t('vendor'));label('tags',t('tags'));label('images',t('images'));
  const st=$('select[name="status"]');if(st?.options?.length>1){st.options[0].textContent=t('draft');st.options[1].textContent=t('publish')}
  const b=$('#page-product button[type="submit"]');if(b&&!b.disabled)b.textContent=t('add');all('.settings-heading').forEach(h=>{if(h.id==='u369-lang-h')return;const q=h.textContent.toLowerCase();if(/integr/.test(q))h.textContent=t('integr');else if(/aplik|application|applic|anwendung/.test(q))h.textContent=t('app');else if(/opšte|general|generale|allgemein/.test(q))h.textContent=t('general')});replaceSettingsRows();ensureSelector();const latest=all('.workspace-label').find(e=>/Poslednji proizvodi|Latest products|Prodotti recenti|Neueste Produkte/.test(e.textContent));if(latest)latest.textContent=t('latest');
}
let timer;const mo=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(apply,60)});
function boot(){loadLanguage(lang);mo.observe(document.body,{childList:true,subtree:true})}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();`;

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==="/api/i18n"&&request.method==="POST")return translate(request,env);
    if(url.pathname==="/world-i18n.js")return new Response(CLIENT,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store"}});
    const response=await app.fetch(request,env,ctx);const type=response.headers.get("content-type")||"";
    if(request.method==="GET"&&(url.pathname==="/"||url.pathname==="/app")&&type.includes("text/html")){
      const html=(await response.text()).replace(/<\/body>/i,'<script src="/world-i18n.js?v=2"></script></body>');
      const headers=new Headers(response.headers);headers.delete("content-length");headers.set("cache-control","no-store");
      return new Response(html,{status:response.status,statusText:response.statusText,headers});
    }
    return response;
  }
};