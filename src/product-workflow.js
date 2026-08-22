import app from "./ai-team.js";

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}

async function prepareProduct(request,env){
  try{
    if(!env.AI)return json({error:"Workers AI is unavailable."},503);
    const b=await request.json();
    const title=String(b.title||"").trim();
    const notes=String(b.notes||"").trim();
    const language=String(b.language||"en").trim();
    if(!title&&!notes)return json({error:"Provide a product name or notes."},400);
    const prompt=`You are the product merchandising assistant inside Unit369. Prepare a clean ecommerce product draft from the user's raw input. Answer in language ${language}. Return ONLY valid JSON with these exact keys: title, description, productType, tags, suggestedSizes, skuBase. tags must be an array of short strings; suggestedSizes must be an array of strings. Do not invent material, origin, composition, dimensions, certifications or claims unless explicitly supplied. Keep description polished but factual. Raw title: ${title}\nRaw notes: ${notes}`;
    const r=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"system",content:"Return only valid JSON. Never fabricate product facts."},{role:"user",content:prompt}],max_tokens:1200});
    let t=String(r?.response||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
    const a=t.indexOf("{"),z=t.lastIndexOf("}");if(a>=0&&z>a)t=t.slice(a,z+1);
    const o=JSON.parse(t);
    return json({draft:{title:String(o.title||title),description:String(o.description||""),productType:String(o.productType||""),tags:Array.isArray(o.tags)?o.tags.map(String).slice(0,12):[],suggestedSizes:Array.isArray(o.suggestedSizes)?o.suggestedSizes.map(String).slice(0,20):[],skuBase:String(o.skuBase||"")}});
  }catch(e){return json({error:String(e?.message||e).slice(0,500)},500)}
}

const PRODUCT_STYLE=String.raw`
<style id="unit369-product-workflow-style">
.pwf{margin:0 0 14px;border:1px solid #1e3349;border-radius:15px;background:linear-gradient(180deg,#0b1622,#08111a);overflow:hidden}.pwf-head{display:flex;gap:7px;padding:11px;border-bottom:1px solid #172b3e}.pwf-step{flex:1;min-width:0;text-align:center;font-size:9px;font-weight:800;color:#60758d;padding:7px 4px;border-radius:8px;background:#09121c}.pwf-step.on{color:#79d2ff;background:#10263b}.pwf-body{padding:12px}.pwf-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.pwf-btn{border:1px solid #275273;border-radius:9px;background:#0c1b29;color:#7dd2ff;padding:9px 11px;font-size:10px;font-weight:800}.pwf-btn.primary{background:linear-gradient(135deg,#35c5ff,#167cef);color:white;border:0}.pwf-note{font-size:10px;color:#6f8298;line-height:1.45}.pwf-checks{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0}.pwf-check{padding:8px 9px;border:1px solid #1b2d40;border-radius:9px;font-size:9px;color:#72869d}.pwf-check.ok{color:#64d8ad;border-color:#245541}.pwf-preview{display:none;margin-top:11px;border:1px solid #275273;border-radius:12px;padding:10px;background:#091827}.pwf-preview.open{display:block}.pwf-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #14283a;font-size:10px}.pwf-row:last-child{border:0}.pwf-row span{color:#71869e}.pwf-row strong{text-align:end;color:#e7f2fd}.pwf-warning{margin-top:9px;padding:8px 9px;border-radius:9px;background:#251a0b;color:#f2bd65;font-size:9px}.pwf-success{margin-top:9px;padding:9px;border-radius:9px;background:#0c241c;color:#69d7ac;font-size:10px}.pwf-error{margin-top:9px;padding:9px;border-radius:9px;background:#271218;color:#ff8595;font-size:10px}
html[dir="rtl"] .pwf-head,html[dir="rtl"] .pwf-actions{flex-direction:row-reverse}html[dir="rtl"] .pwf-row{flex-direction:row-reverse}
@media(max-width:390px){.pwf-checks{grid-template-columns:1fr}.pwf-head{display:grid;grid-template-columns:repeat(2,1fr)}}
</style>`;

const PRODUCT_CLIENT=String.raw`(()=>{
const $=s=>document.querySelector(s),E=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
let armed=false,busy=false;
function language(){return document.documentElement.lang||navigator.language||'en'}
function val(n){return document.querySelector('#page-product [name="'+n+'"]')?.value?.trim()||''}
function set(n,v){const e=document.querySelector('#page-product [name="'+n+'"]');if(e&&v!=null)e.value=v}
function files(n){const e=document.querySelector('#page-product [name="'+n+'"]');return e?.files?.length||0}
function state(){return{title:val('title'),price:val('price'),sizes:val('sizes'),description:val('description'),status:val('status')||'DRAFT',sku:val('sku'),productType:val('productType'),vendor:val('vendor'),tags:val('tags'),images:files('images'),video:files('video')}}
function valid(s){return{title:!!s.title,price:Number(String(s.price).replace(',','.'))>0,sizes:s.sizes.split(',').map(x=>x.trim()).filter(Boolean).length>0,description:!!s.description,media:s.images>0||s.video>0}}
function renderChecks(){const s=state(),v=valid(s),b=$('#pwf-checks');if(!b)return;b.innerHTML=[['title','Name'],['price','Price'],['sizes','Variants'],['description','Description'],['media','Media']].map(([k,n])=>'<div class="pwf-check '+(v[k]?'ok':'')+'">'+(v[k]?'✓ ':'○ ')+n+'</div>').join('')}
function preview(){const s=state(),v=valid(s),p=$('#pwf-preview');if(!v.title||!v.price||!v.sizes){p.className='pwf-preview open';p.innerHTML='<div class="pwf-error">Name, valid price and at least one size are required.</div>';armed=false;return}p.className='pwf-preview open';p.innerHTML='<b>Final preview</b>'+[['Name',s.title],['Price',s.price],['Sizes',s.sizes],['Status',s.status],['SKU',s.sku||'—'],['Type',s.productType||'—'],['Vendor',s.vendor||'—'],['Tags',s.tags||'—'],['Images',s.images],['Video',s.video]].map(x=>'<div class="pwf-row"><span>'+E(x[0])+'</span><strong>'+E(x[1])+'</strong></div>').join('')+(s.status==='ACTIVE'?'<div class="pwf-warning">This will publish immediately. Change Status to Draft if you want review first.</div>':'<div class="pwf-note">This will be saved as Draft until you publish it later.</div>')+'<div class="pwf-actions"><button type="button" class="pwf-btn" id="pwf-back">Edit</button><button type="button" class="pwf-btn primary" id="pwf-confirm">Confirm & save</button></div>';armed=true;$('#pwf-back').onclick=()=>{armed=false;p.classList.remove('open')};$('#pwf-confirm').onclick=save}
async function aiPrepare(){if(busy)return;const title=val('title'),notes=val('description');if(!title&&!notes)return msg('Add a name or rough notes first','error');busy=true;const b=$('#pwf-ai');b.disabled=true;b.textContent='Preparing…';try{const r=await fetch('/api/product-prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title,notes,language:language()})}),d=await r.json();if(!r.ok||d.error)throw Error(d.error||'AI preparation failed');const x=d.draft||{};set('title',x.title||title);if(x.description)set('description',x.description);if(x.productType)set('productType',x.productType);if(x.tags?.length)set('tags',x.tags.join(', '));if(x.suggestedSizes?.length&&!val('sizes'))set('sizes',x.suggestedSizes.join(','));if(x.skuBase&&!val('sku'))set('sku',x.skuBase);renderChecks();msg('AI draft prepared. Review every field before saving.','success')}catch(e){msg(e.message,'error')}finally{busy=false;b.disabled=false;b.textContent='AI prepare draft'}}
function msg(t,type='success'){const x=$('#pwf-msg');if(!x)return;x.className=type==='error'?'pwf-error':'pwf-success';x.textContent=t}
async function save(){if(!armed||busy)return;const f=$('#page-product form');if(!f)return;busy=true;const c=$('#pwf-confirm');if(c){c.disabled=true;c.textContent='Saving…'}try{const r=await fetch('/api/create-product',{method:'POST',body:new FormData(f)}),d=await r.json();if(!r.ok||d.error)throw Error(d.error||'Save failed');msg('Product saved as '+(d.product?.status||'DRAFT')+'.','success');armed=false;$('#pwf-preview')?.classList.remove('open');f.reset();renderChecks();document.querySelector('#plist')&&window.setTimeout(()=>location.reload(),700)}catch(e){msg(e.message,'error')}finally{busy=false;if(c){c.disabled=false;c.textContent='Confirm & save'}}}
function mount(){const page=$('#page-product'),f=page?.querySelector('form');if(!page||!f||$('#pwf'))return;const w=document.createElement('div');w.id='pwf';w.className='pwf';w.innerHTML='<div class="pwf-head"><div class="pwf-step on">1 · Input</div><div class="pwf-step">2 · AI assist</div><div class="pwf-step">3 · Review</div><div class="pwf-step">4 · Save</div></div><div class="pwf-body"><div class="pwf-note">Build the product as a Draft by default. AI may improve copy and organization but never replaces your factual review.</div><div id="pwf-checks" class="pwf-checks"></div><div class="pwf-actions"><button type="button" class="pwf-btn" id="pwf-ai">AI prepare draft</button><button type="button" class="pwf-btn primary" id="pwf-review">Review product</button></div><div id="pwf-msg"></div><div id="pwf-preview" class="pwf-preview"></div></div>';f.parentNode.insertBefore(w,f);renderChecks();$('#pwf-ai').onclick=aiPrepare;$('#pwf-review').onclick=preview;f.addEventListener('input',()=>{armed=false;renderChecks()});f.addEventListener('change',()=>{armed=false;renderChecks()});const submit=f.querySelector('button[type="submit"]');if(submit){submit.type='button';submit.textContent='Review product';submit.onclick=preview}}
function boot(){mount()}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,220)):setTimeout(boot,220);
})();`;

export default{
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==="/api/product-prepare"&&request.method==="POST")return prepareProduct(request,env);
  if(url.pathname==="/product-workflow.js")return new Response(PRODUCT_CLIENT,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store"}});
  const r=await app.fetch(request,env,ctx),type=r.headers.get("content-type")||"";
  if(request.method==="GET"&&(url.pathname==="/"||url.pathname==="/app")&&type.includes("text/html")){
   const html=(await r.text()).replace(/<\/head>/i,PRODUCT_STYLE+"</head>").replace(/<\/body>/i,'<script src="/product-workflow.js?v=1"></script></body>');
   const h=new Headers(r.headers);h.delete("content-length");h.set("cache-control","no-store");return new Response(html,{status:r.status,statusText:r.statusText,headers:h})
  }
  return r;
 }
};