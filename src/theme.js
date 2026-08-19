import app from "./router.js";

const UNIT_THEME = String.raw`
<style id="unit-blue-theme">
:root{--bg:#05070c!important;--surface:#0b111a!important;--surface-2:#111a27!important;--line:#233247!important;--line-soft:#162233!important;--gold:#28a7ff!important;--gold-dim:#1476c8!important;--ink:#f5f8fc!important;--ink-dim:#95a3b8!important;--ink-faint:#617087!important;--sage:#52d7ff!important;--brick:#ff667a!important}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html{background:#05070c!important}body{margin:0!important;min-height:100vh;background:radial-gradient(800px 460px at 65% -10%,rgba(26,148,255,.2),transparent 62%),radial-gradient(480px 360px at -10% 40%,rgba(0,205,255,.07),transparent 70%),linear-gradient(180deg,#070b12 0%,#04060a 100%)!important;color:#f5f8fc!important;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;padding-bottom:92px!important}
header{max-width:620px;margin:0 auto;padding:22px 20px 8px!important;display:flex!important;align-items:center!important;gap:14px!important}header:before{content:"";display:block;width:58px;height:58px;flex:0 0 58px;border-radius:16px;background:url('/unit369-192.png?v=3801') center/cover no-repeat!important;box-shadow:0 8px 24px rgba(0,126,255,.18)}header:after{display:none!important}h1{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;font-size:22px!important;font-weight:800!important;letter-spacing:-.6px!important;margin:0!important;color:#fff!important}p.sub{display:none!important}
.page{display:none!important;max-width:620px;margin:0 auto;padding:18px 20px 24px!important}.page.active{display:block!important}.section-title{font-size:26px;font-weight:800;letter-spacing:-.7px;margin:5px 0 5px}.section-sub{color:#8291a7;font-size:13px;line-height:1.45;margin-bottom:18px}.workspace-label{color:#718097;font-size:11px;font-weight:750;letter-spacing:.12em;text-transform:uppercase;margin:18px 0 9px}
.keys,.promptbox,.panel,.product-shell,.settings-shell{background:linear-gradient(180deg,rgba(16,23,34,.97),rgba(8,13,21,.97))!important;border:1px solid rgba(91,130,178,.25)!important;border-radius:17px!important;box-shadow:0 12px 34px rgba(0,0,0,.24),inset 0 1px rgba(255,255,255,.025)!important}.keys{padding:16px!important;margin:0!important}.promptbox{padding:14px!important;margin-bottom:14px!important}
label{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;color:#718197!important;font-size:10px!important;font-weight:750!important;letter-spacing:.12em!important}input,textarea{background:#070c13!important;color:#f4f8ff!important;border:1px solid #202d40!important;border-radius:12px!important;padding:13px 14px!important;font-family:inherit!important}input::placeholder,textarea::placeholder{color:#506078!important}input:focus,textarea:focus{outline:none!important;border-color:#259cff!important;box-shadow:0 0 0 3px rgba(32,151,255,.11)!important}.toggle-keys{color:#5db5ff!important;font-weight:650!important;cursor:pointer!important}.promptbox textarea{min-height:128px!important;background:transparent!important;border:0!important;box-shadow:none!important;padding:7px 6px!important;font-size:16px!important}.sendrow{border-top:1px solid #1a2635!important;padding-top:12px!important}.sendbtn,button.primary{border:0!important;border-radius:11px!important;background:linear-gradient(135deg,#35c5ff 0%,#198cff 55%,#1467e7 100%)!important;color:#fff!important;font-family:inherit!important;font-weight:800!important;letter-spacing:.03em!important;box-shadow:0 8px 24px rgba(0,124,255,.27),inset 0 1px rgba(255,255,255,.28)!important}.sendbtn{padding:11px 23px!important}button.primary{padding:15px!important}
.modes{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:8px!important;margin:0 0 15px!important;border:0!important;background:transparent!important;overflow:visible!important}.mode{min-height:78px!important;display:flex!important;align-items:flex-end!important;justify-content:flex-start!important;text-align:left!important;padding:12px!important;border:1px solid #1e2b3d!important;border-radius:13px!important;background:#0a1018!important;color:#728198!important;font-size:11px!important;font-weight:700!important;line-height:1.25!important;position:relative!important}.mode:before{position:absolute;top:11px;left:12px;color:#52bfff;font-size:17px}.mode[data-mode="side"]:before{content:"✦"}.mode[data-mode="combine"]:before{content:"↗"}.mode[data-mode="critique"]:before{content:"◇"}.mode.active{color:#f3f9ff!important;background:linear-gradient(180deg,#163452,#10243b)!important;border-color:#2a6ca3!important;box-shadow:0 5px 18px rgba(0,113,255,.12)!important}
.panels{gap:12px!important;margin-top:16px!important}.panel{overflow:hidden!important}.panel-head{font-family:inherit!important;font-weight:800!important;border-bottom:1px solid #1a2433!important;background:rgba(255,255,255,.012)!important}.panel-body{color:#dfe7f2!important}.panel-body.loading{color:#75849a!important}.dot{border-radius:50%!important;transform:none!important}
#page-product form{background:linear-gradient(180deg,rgba(16,23,34,.97),rgba(8,13,21,.97))!important;border:1px solid rgba(91,130,178,.25)!important;border-radius:17px!important;padding:16px!important;box-shadow:0 12px 34px rgba(0,0,0,.24)!important}#page-product form:before{content:"Novi proizvod";display:block;font-size:24px;font-weight:800;letter-spacing:-.6px;margin:2px 0 4px}#page-product form:after{content:"Unesi podatke i dodaj proizvod u katalog.";display:block;position:absolute;color:transparent}
.settings-card{margin-bottom:13px}.settings-heading{font-size:13px;font-weight:800;margin:0 0 11px}.setting-row{display:flex;align-items:center;justify-content:space-between;padding:15px 2px;border-top:1px solid #172233;color:#dce6f2;font-size:14px}.setting-row:first-of-type{border-top:0}.setting-row span:last-child{color:#74849b}
nav.bottomnav{position:fixed!important;bottom:0;left:0;right:0;z-index:50;display:flex!important;background:rgba(6,9,14,.95)!important;border-top:1px solid rgba(71,101,139,.3)!important;backdrop-filter:blur(18px)!important;-webkit-backdrop-filter:blur(18px)!important;box-shadow:0 -10px 35px rgba(0,0,0,.26)!important;padding-bottom:env(safe-area-inset-bottom)!important}nav.bottomnav .navitem{flex:1!important;text-align:center!important;padding:11px 4px 10px!important;font-family:inherit!important;font-size:10.5px!important;font-weight:700!important;color:#59687c!important;border-top:2px solid transparent!important;position:relative!important}nav.bottomnav .navitem:before{display:block;font-size:18px;line-height:20px;margin-bottom:3px}nav.bottomnav .navitem[data-page="team"]:before{content:"◎"}nav.bottomnav .navitem[data-page="product"]:before{content:"□"}nav.bottomnav .navitem[data-page="settings"]:before{content:"⚙"}nav.bottomnav .navitem.active{color:#51c6ff!important;border-top-color:#2da8ff!important;text-shadow:0 0 16px rgba(45,168,255,.35)!important}
@media(min-width:520px){.page,header{max-width:620px}.keys,.promptbox,.panel,#page-product form{border-radius:19px!important}}
</style>`;

const UNIT_STRUCTURE = String.raw`
<script id="unit-structure-script">
(function(){
  function boot(){
    const team=document.getElementById('page-team');
    const product=document.getElementById('page-product');
    const oldNav=document.querySelector('nav.bottomnav');
    const title=document.querySelector('header h1');
    if(title) title.textContent='Unit369';
    if(!team||!product||!oldNav||document.getElementById('page-settings')) return;

    const keys=team.querySelector('.keys');
    const modes=team.querySelector('.modes');
    const prompt=team.querySelector('.promptbox');
    const panels=team.querySelector('.panels');

    team.innerHTML='';
    const intro=document.createElement('div');
    intro.innerHTML='<div class="section-title">AI Tim</div><div class="section-sub">Postavi jedno pitanje i uporedi odgovore više AI modela.</div>';
    team.appendChild(intro);
    if(modes){const l=document.createElement('div');l.className='workspace-label';l.textContent='Režim rada';team.appendChild(l);team.appendChild(modes)}
    if(prompt){const l=document.createElement('div');l.className='workspace-label';l.textContent='Novo pitanje';team.appendChild(l);team.appendChild(prompt)}
    if(panels){const l=document.createElement('div');l.className='workspace-label';l.textContent='Odgovori';team.appendChild(l);team.appendChild(panels)}

    const productIntro=document.createElement('div');
    productIntro.innerHTML='<div class="section-title">Proizvodi</div><div class="section-sub">Dodaj novi proizvod i upravljaj unosom na jednom mestu.</div>';
    product.insertBefore(productIntro,product.firstChild);

    const settings=document.createElement('div');
    settings.className='page';settings.id='page-settings';
    settings.innerHTML='<div class="section-title">Settings</div><div class="section-sub">API ključevi i podešavanja Unit369 aplikacije.</div>';
    if(keys){const card=document.createElement('div');card.className='settings-card';card.appendChild(keys);settings.appendChild(card)}
    const general=document.createElement('div');general.className='keys settings-card';
    general.innerHTML='<div class="settings-heading">Opšte</div><div class="setting-row"><span>Integracije</span><span>›</span></div><div class="setting-row"><span>Notifikacije</span><span>›</span></div><div class="setting-row"><span>Tema</span><span>Tamna</span></div><div class="setting-row"><span>Jezik</span><span>Srpski</span></div><div class="setting-row"><span>O aplikaciji</span><span>Unit369</span></div>';
    settings.appendChild(general);
    oldNav.parentNode.insertBefore(settings,oldNav);

    oldNav.innerHTML='<div class="navitem active" data-page="team">AI Tim</div><div class="navitem" data-page="product">Proizvodi</div><div class="navitem" data-page="settings">Settings</div>';
    oldNav.querySelectorAll('.navitem').forEach(function(el){el.addEventListener('click',function(){document.querySelectorAll('.navitem').forEach(function(n){n.classList.remove('active')});document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active')});el.classList.add('active');document.getElementById('page-'+el.dataset.page).classList.add('active')})});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
</script>`;

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      const type = response.headers.get("content-type") || "";
      if (type.includes("text/html")) {
        const html = await response.text();
        const themed = html
          .replace('<meta name="theme-color" content="#17130f">','<meta name="theme-color" content="#05070c">')
          .replace("</head>", UNIT_THEME + "</head>")
          .replace("</body>", UNIT_STRUCTURE + "</body>");
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return new Response(themed,{status:response.status,statusText:response.statusText,headers});
      }
    }
    return response;
  }
};
