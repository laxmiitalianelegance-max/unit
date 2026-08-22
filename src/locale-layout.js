import app from "./world-i18n.js";

const STRUCTURE = String.raw`
<style id="unit369-locale-layout">
html[dir="rtl"] body{text-align:right}
html[dir="rtl"] header{flex-direction:row-reverse;text-align:right}
html[dir="rtl"] .sendrow,html[dir="rtl"] .pa{justify-content:flex-start!important}
html[dir="rtl"] .setting-row,html[dir="rtl"] .si,html[dir="rtl"] .pr{flex-direction:row-reverse}
html[dir="rtl"] .mode{text-align:right!important;justify-content:flex-end!important}
html[dir="rtl"] .mode:before{left:auto!important;right:12px}
html[dir="rtl"] .prow{flex-direction:row-reverse}
html[dir="rtl"] input,html[dir="rtl"] textarea,html[dir="rtl"] select{text-align:right;direction:rtl}
html[dir="rtl"] nav.bottomnav{direction:rtl}
html[dir="rtl"] .u{flex-direction:row-reverse;justify-content:flex-start}
html[dir="rtl"] .panel-head{text-align:right;justify-content:flex-start}
html[dir="rtl"] .panel-body{direction:rtl;text-align:right}
html[dir="ltr"] input,html[dir="ltr"] textarea,html[dir="ltr"] select{direction:ltr}
html[lang^="ja"],html[lang^="zh"],html[lang^="ko"] body{font-family:Inter,"Noto Sans CJK JP","Noto Sans",system-ui,sans-serif!important}
html[lang^="ar"],html[lang^="fa"],html[lang^="ur"] body{font-family:Inter,"Noto Sans Arabic",Tahoma,Arial,sans-serif!important;line-height:1.55}
html[lang^="he"] body{font-family:Inter,"Noto Sans Hebrew",Arial,sans-serif!important}
html[lang^="hi"],html[lang^="bn"],html[lang^="mr"],html[lang^="ne"] body{font-family:Inter,"Noto Sans Devanagari","Noto Sans",system-ui,sans-serif!important}
html[lang^="th"] body{font-family:Inter,"Noto Sans Thai","Noto Sans",system-ui,sans-serif!important}
html.locale-long .mode{font-size:10px!important;line-height:1.2!important;padding:11px 9px!important}
html.locale-long nav.bottomnav .navitem{font-size:9.5px!important}
html.locale-long .ub{font-size:10px!important}
@media(max-width:390px){html.locale-long .modes{grid-template-columns:1fr!important}.mode{min-height:58px!important}}
</style>
<script>
(()=>{
const RTL=new Set(['ar','fa','he','ur','ps','yi','ku']);
const LONG=new Set(['de','fi','hu','nl','pl','ru','uk','el','tr','cs','sk']);
function current(){return (document.documentElement.lang||navigator.language||'en').toLowerCase()}
function adapt(){
 const tag=current(),code=tag.split('-')[0],rtl=RTL.has(code);
 document.documentElement.dir=rtl?'rtl':'ltr';
 document.documentElement.classList.toggle('locale-long',LONG.has(code));
 document.body?.setAttribute('data-locale',tag);
 document.querySelectorAll('input[type="number"],input[inputmode="decimal"]').forEach(e=>{e.lang=tag;e.dir='ltr'});
 document.querySelectorAll('input[type="url"],input[type="email"],input[name="sku"]').forEach(e=>e.dir='ltr');
 const nav=document.querySelector('nav.bottomnav');if(nav)nav.setAttribute('aria-label','Unit369');
}
const mo=new MutationObserver(()=>adapt());
function boot(){adapt();mo.observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});mo.observe(document.body,{childList:true,subtree:true})}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
</script>`;

export default {
  async fetch(request,env,ctx){
    const response=await app.fetch(request,env,ctx);
    const url=new URL(request.url),type=response.headers.get('content-type')||'';
    if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/app')&&type.includes('text/html')){
      const html=(await response.text()).replace(/<\/body>/i,STRUCTURE+'\n</body>');
      const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');
      return new Response(html,{status:response.status,statusText:response.statusText,headers});
    }
    return response;
  }
};